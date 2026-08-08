//! Tor "IP Changer" — an independent, optional Tor client that rotates the
//! user's public egress IP on demand.
//!
//! This is fully separate from Aether (which stays on its own SOCKS5 port).
//! Tor runs as a plain bundled subprocess on its own ports (SOCKS 9050,
//! control 9051) and is managed through:
//!   * command-line flags (no torrc file to ship or locate),
//!   * the control protocol over TCP (`SIGNAL NEWNYM` / `SIGNAL SHUTDOWN`)
//!     with cookie authentication,
//!   * `reqwest` over a `socks5h` proxy to fetch the live exit IP, reusing
//!     `crate::net`'s endpoints and parser so it behaves like the leak-check.
//!
//! Process lifetime is owned by a single `TorManager` shared through
//! `AppState`, exactly like `AetherManager`. Because polling the control port
//! during startup can take up to a couple of minutes on a cold boot, `start`
//! runs synchronously on Tauri's command worker thread (it never touches the
//! UI thread) while background reader/monitor/auto-rotate threads push
//! `ip-changer://log` and `ip-changer://status` events to the frontend.

use crate::error::AetherError;
use crate::events::{now_millis, LogEvent, TOR_LOG_EVENT, TOR_STATUS_EVENT};
use crate::net::PublicInfo;
use crate::state::AppState;
use serde::Serialize;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};

/// Tor's SOCKS5 listener (where the app's own HTTP client reaches the exit).
pub const DEFAULT_SOCKS_PORT: u16 = 9050;
/// Tor's control socket (used for NEWNYM / SHUTDOWN).
pub const DEFAULT_CONTROL_PORT: u16 = 9051;

/// How long we'll wait for Tor to open its control port & cookie before
/// giving up. A cold Tor that's fetching a fresh consensus comfortably fits.
const BOOTSTRAP_TIMEOUT: Duration = Duration::from_secs(120);
/// Grace period after `SIGNAL SHUTDOWN` before the process is force-killed.
const SHUTDOWN_GRACE: Duration = Duration::from_secs(10);
/// Additional grace after the force-kill before giving up on reaping.
const KILL_GRACE: Duration = Duration::from_secs(3);

/// Auto-rotation is deliberately clamped: Hammering NEWNYM spins the Tor
/// network's guard/exit circuit selection and burns bandwidth for everyone.
/// 60s is an aggressive floor; anything below it is rejected.
const MIN_AUTO_INTERVAL_SECS: u64 = 60;
const MAX_AUTO_INTERVAL_SECS: u64 = 86_400; // 24h

const IP_REQUEST_TIMEOUT: Duration = Duration::from_secs(8);
const IP_USER_AGENT: &str = concat!("aether-gui/", env!("CARGO_PKG_VERSION"), " ip-changer");

/// Tagged over-the-wire status; mirrored in `src/types/ipChanger.ts`.
///
/// `Stopping` exists so the UI can show a disabled in-flight state while the
/// (possibly slow, control-port-driven) shutdown is happening — the frontend
/// only entered the section after a explicit user action, so a transient
/// state here is visible.
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(tag = "state")]
pub enum TorStatus {
    Stopped,
    Starting,
    Running,
    Stopping,
    Error { message: String },
}

impl TorStatus {
    pub fn is_running(&self) -> bool {
        matches!(self, TorStatus::Running)
    }
}

/// Mirror of the tunable knobs held in `TorManager::auto`.
#[derive(Serialize, Clone, Debug)]
pub struct AutoRotateConfig {
    pub enabled: bool,
    /// Interval in seconds between automatic NEWNYM rotations.
    pub interval_secs: u64,
}

/// Everything the app knows about its Tor child + control session.
///
/// The whole struct lives behind `Arc<Mutex<...>>` in `AppState`. Locks are
/// held only for short, non-blocking spans (a control exchange also holds it
/// briefly — localhost TCP, a few ms) so commands and background threads
/// never stall on each other for long.
pub struct TorManager {
    child: Option<Child>,
    status: TorStatus,
    /// Runtime data directory (holds `control_auth_cookie` + Tor's cached
    /// consensus). Re-created under the app data dir so it's always writable.
    data_dir: Option<PathBuf>,
    /// Cookie bytes read from `<data_dir>/control_auth_cookie` after a
    /// successful handshake; used for every later control command.
    cookie: Option<Vec<u8>>,
    /// True while a `stop` is in flight so the watchdog thread doesn't turn
    /// the expected exit into an "unexpected" `Error`.
    user_stop: bool,
    socks_port: u16,
    control_port: u16,
    /// Bind the SOCKS listener to `0.0.0.0` so other machines on the LAN can
    /// use it; loopback only otherwise. Also persists the choice.
    lan_bind: bool,
    auto_enabled: bool,
    auto_interval_secs: u64,
    /// ms since epoch of the last NEWIP, so the auto-rotate loop can pace
    /// itself without keeping a timer thread (it polls every second).
    auto_last_ms: u64,
}

impl TorManager {
    /// The SOCKS port the Tor listener is (or will be) bound to.
    pub fn socks_port(&self) -> u16 {
        self.socks_port
    }
}

impl Default for TorManager {
    fn default() -> Self {
        Self {
            child: None,
            status: TorStatus::Stopped,
            data_dir: None,
            cookie: None,
            user_stop: false,
            socks_port: DEFAULT_SOCKS_PORT,
            control_port: DEFAULT_CONTROL_PORT,
            lan_bind: false,
            auto_enabled: false,
            auto_interval_secs: 60,
            auto_last_ms: 0,
        }
    }
}

impl TorManager {
    /// `try_wait` on the live child (none → not started). `std` wraps the
    /// status in an `io::Result` we have no use for, so this flattens it.
    fn child_exited(&mut self) -> Option<std::process::ExitStatus> {
        self.child
            .as_mut()
            .and_then(|c| c.try_wait().ok())
            .flatten()
    }
}

// ---------------------------------------------------------------------------
// Bundled-binary resolution
// ---------------------------------------------------------------------------

/// Where inside `binaries/` the current platform's Tor lives. Windows ships a
/// single `windows/x86_64` dir holding the i686 (32-bit) build of the expert
/// bundle, which is what we're stuck with from the pre-downloaded sets and is
/// fully supported on 64-bit Windows via WOW64.
fn bundled_rel_dir() -> Result<&'static str, AetherError> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86" | "x86_64") => Ok("windows/x86_64"),
        ("linux", "x86_64") => Ok("linux/x86_64"),
        ("linux", "x86") => Ok("linux/i686"),
        ("macos", "aarch64") => Ok("macos/aarch64"),
        ("macos", "x86_64") => Ok("macos/x86_64"),
        (os, arch) => Err(AetherError::Internal(format!(
            "no bundled Tor for {os}/{arch}"
        ))),
    }
}

#[cfg(unix)]
fn fix_exec_bit(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755));
}

#[cfg(not(unix))]
fn fix_exec_bit(_path: &Path) {}

/// Returns the full path to the bundled, executable for the current platform,
/// honoring the same trio Aether's resolver checks (resource dir → app data
/// dir → the crate's own `binaries/` for dev runs / unit tests).
pub fn tor_binary_path(app: &AppHandle) -> Result<PathBuf, AetherError> {
    let dir = bundled_rel_dir()?;
    let name = if cfg!(windows) { "tor.exe" } else { "tor" };
    let rel = PathBuf::from("binaries").join("tor").join(dir).join(name);

    let mut tried = Vec::new();
    let mut check = |base: PathBuf| -> Option<PathBuf> {
        let full = base.join(&rel);
        tried.push(full.display().to_string());
        if full.exists() {
            fix_exec_bit(&full);
            Some(full)
        } else {
            None
        }
    };

    if let Ok(dir) = app.path().resource_dir() {
        if let Some(path) = check(dir) {
            return Ok(path);
        }
    }
    if let Ok(dir) = app.path().app_data_dir() {
        if let Some(path) = check(dir) {
            return Ok(path);
        }
    }
    if let Some(path) = check(PathBuf::from(env!("CARGO_MANIFEST_DIR"))) {
        return Ok(path);
    }

    Err(AetherError::Internal(format!(
        "Tor binary not found (looked in: {})",
        tried.join("; ")
    )))
}

// ---------------------------------------------------------------------------
// Control-port protocol (cookie auth) — no external dependency needed.
// ---------------------------------------------------------------------------

/// Opens a fresh control connection, authenticates with the cookie bytes, and
/// sends `command`. Returns the reply (asserted to start with `250`).
///
/// A new connection is created per call rather than reused because control
/// sessions are cheap on loopback and this keeps every caller independent of
/// long-lived socket ownership.
fn control_exchange(port: u16, cookie: &[u8], command: &str) -> Result<(), AetherError> {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_secs(3))
        .map_err(|e| AetherError::Internal(format!("control connect: {e}")))?;
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .map_err(|e| AetherError::Internal(e.to_string()))?;

    let hex_cookie = hex(cookie);
    write!(stream, "AUTHENTICATE {hex_cookie}\r\n")
        .map_err(|e| AetherError::Internal(format!("control auth write: {e}")))?;
    read_reply(&mut stream)?;

    write!(stream, "{command}\r\n")
        .map_err(|e| AetherError::Internal(format!("control write: {e}")))?;
    read_reply(&mut stream)?;
    Ok(())
}

/// Reads one control reply line and validates it. `250` starts both the
/// single-line `250 OK` replies we expect and the `250-` continuation lines
/// (`GETINFO version`), so a prefix check is sufficient.
fn read_reply(stream: &mut TcpStream) -> Result<(), AetherError> {
    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    reader
        .read_line(&mut line)
        .map_err(|e| AetherError::Internal(format!("control read: {e}")))?;
    let line = line.trim_end().to_string();
    if line.starts_with("250") {
        Ok(())
    } else {
        Err(AetherError::Internal(format!("control rejected: {line}")))
    }
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect::<String>()
}

// ---------------------------------------------------------------------------
// Process scaffolding
// ---------------------------------------------------------------------------

fn set_status(app: &AppHandle, manager: &Arc<Mutex<TorManager>>, status: TorStatus) {
    manager.lock().unwrap().status = status.clone();
    let _ = app.emit(TOR_STATUS_EVENT, &status);
}

fn logline(app: &AppHandle, line: impl Into<String>) {
    let _ = app.emit(
        TOR_LOG_EVENT,
        LogEvent {
            line: line.into(),
            timestamp: now_millis(),
        },
    );
}

fn app_tor_run_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir())
        .join("tor-run")
}

/// Reads a line-delimited pipe and forwards every non-empty line to the log
/// event. One thread per stream (stdout + stderr).
fn spawn_log_reader(app: AppHandle, reader: impl Read + Send + 'static) {
    std::thread::spawn(move || {
        let mut reader = BufReader::new(reader);
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) => break,
                Ok(_) => {
                    let trimmed = line.trim_end();
                    if !trimmed.is_empty() {
                        logline(&app, trimmed.to_string());
                    }
                }
                Err(_) => break,
            }
        }
    });
}

/// Watches the child from birth to death. The whole state machine hinging on
/// "the process is gone" lives here: an unexpected exit becomes an Error; a
/// user-requested stop already set `user_stop`, so this just reflects Stopped.
fn spawn_monitor(app: AppHandle, manager: Arc<Mutex<TorManager>>) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(500));
        let (exited, user_stop) = {
            let mut m = manager.lock().unwrap();
            match m.child_exited() {
                Some(code) => {
                    m.child = None;
                    (Some(code), m.user_stop)
                }
                None => (None, false),
            }
        };
        if let Some(code) = exited {
            if user_stop {
                set_status(&app, &manager, TorStatus::Stopped);
                logline(&app, format!("[tor] stopped (exit status {code})"));
            } else {
                set_status(
                    &app,
                    &manager,
                    TorStatus::Error {
                        message: format!("Tor exited unexpectedly (status {code})"),
                    },
                );
                logline(&app, "[tor] process exited unexpectedly — see log above");
            }
            {
                let mut m = manager.lock().unwrap();
                m.user_stop = false;
            }
            return;
        }
    });
}

// ---------------------------------------------------------------------------
// Public management operations (called from the Tauri commands)
// ---------------------------------------------------------------------------

pub fn start(app: &AppHandle, manager: &Arc<Mutex<TorManager>>) -> Result<(), AetherError> {
    {
        let mut m = manager.lock().unwrap();
        if matches!(
            m.status,
            TorStatus::Starting | TorStatus::Running | TorStatus::Stopping
        ) {
            return Err(AetherError::Internal("Tor is already running".to_string()));
        }
        m.user_stop = false;
    }

    set_status(app, manager, TorStatus::Starting);
    logline(app, "[tor] starting bundled Tor…");

    match do_start(app, manager) {
        Ok(()) => Ok(()),
        Err(e) => {
            // Nothing may dangle behind the state machine: an Error status
            // implies "no process". Only a child that never passed the
            // control-port handshake can still be here (the wait loop reaps
            // its own failures), so a background kill is sufficient.
            {
                let mut m = manager.lock().unwrap();
                if let Some(mut child) = m.child.take() {
                    let _ = child.kill();
                }
            }
            let msg = e.to_string();
            set_status(
                app,
                manager,
                TorStatus::Error {
                    message: msg.clone(),
                },
            );
            logline(app, format!("[tor] start failed: {msg}"));
            Err(e)
        }
    }
}

fn do_start(app: &AppHandle, manager: &Arc<Mutex<TorManager>>) -> Result<(), AetherError> {
    let binary = tor_binary_path(app)?;

    // Pre-flight: refuse to clobber an unrelated process already bound to
    // either of our ports. Without this Tor would just silently pick a
    // different control cookie/behave unpredictably and the user gets zilch.
    {
        let (socks, control) = {
            let m = manager.lock().unwrap();
            (m.socks_port, m.control_port)
        };
        for port in [socks, control] {
            if crate::aether::status::port_is_live(&SocketAddr::from(([127, 0, 0, 1], port))) {
                return Err(AetherError::PortInUse(port));
            }
        }
    }

    let run_dir = app_tor_run_dir(app);
    if let Err(e) = std::fs::create_dir_all(&run_dir) {
        return Err(AetherError::Internal(format!(
            "failed to create Tor data dir: {e}"
        )));
    }
    // The cookie rotates every start; a stale one from a prior run that we
    // can't authenticate against would make the startup probe spin forever.
    let cookie_path = run_dir.join("control_auth_cookie");
    let _ = std::fs::remove_file(&cookie_path);

    let (socks_port, control_port, lan_bind) = {
        let m = manager.lock().unwrap();
        (m.socks_port, m.control_port, m.lan_bind)
    };
    // Loopback keeps the proxy private to this machine; LAN opens it to the
    // network (useful for routing other devices through this exit).
    let socks_host = if lan_bind { "0.0.0.0" } else { "127.0.0.1" };

    let mut cmd = Command::new(&binary);
    cmd.arg("--SocksPort")
        .arg(format!("{socks_host}:{socks_port}"))
        .arg("--ControlPort")
        .arg(format!("127.0.0.1:{control_port}"))
        .arg("--CookieAuthentication")
        .arg("1")
        .arg("--DataDirectory")
        .arg(&run_dir)
        .arg("--ClientOnly")
        .arg("1")
        .arg("--Log")
        .arg("notice stdout");
    // Best-effort geoip so node-selection logs carry country names; absent
    // files (unusual for a proper bundle) must not prevent Tor from starting.
    if let Some(parent) = binary.parent() {
        let geoip = parent.join("data").join("geoip");
        let geoip6 = parent.join("data").join("geoip6");
        if geoip.exists() {
            cmd.arg("--GeoIPFile").arg(&geoip);
        }
        if geoip6.exists() {
            cmd.arg("--GeoIPv6File").arg(&geoip6);
        }
    }
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| AetherError::SpawnFailed(format!("{binary:?}: {e}")))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AetherError::SpawnFailed("failed to attach to Tor stdout".to_string()))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| AetherError::SpawnFailed("failed to attach to Tor stderr".to_string()))?;

    {
        let mut m = manager.lock().unwrap();
        m.child = Some(child);
        m.data_dir = Some(run_dir.clone());
        m.cookie = None;
    }
    spawn_log_reader(app.clone(), stdout);
    spawn_log_reader(app.clone(), stderr);
    spawn_monitor(app.clone(), Arc::clone(manager));

    logline(
        app,
        format!("[tor] waiting for control port {control_port} (cookie auth)…"),
    );

    // Wait (blocking on this command thread) for the control port to come up
    // and the freshly-written cookie to authenticate. Tor's own boot process —
    // load geoip, open ports, start bootstrapping — is fast; the boundary is
    // cold network bootstrap which shouldn't gate a *control* connection.
    let deadline = Instant::now() + BOOTSTRAP_TIMEOUT;
    loop {
        {
            let mut m = manager.lock().unwrap();
            if let Some(code) = m.child_exited() {
                m.child = None;
                return Err(AetherError::Internal(format!(
                    "Tor exited during startup (status {code})"
                )));
            }
        }

        if crate::aether::status::port_is_live(&SocketAddr::from(([127, 0, 0, 1], control_port)))
            && cookie_path.exists()
        {
            if let Ok(cookie) = std::fs::read(&cookie_path) {
                // A `GETINFO version` is the idempotent auth probe; a wrong
                // cookie would get a `515` and we keep waiting for a fresh one.
                if control_exchange(control_port, &cookie, "GETINFO version").is_ok() {
                    let mut m = manager.lock().unwrap();
                    m.cookie = Some(cookie);
                    m.status = TorStatus::Running;
                    drop(m);
                    let _ = app.emit(TOR_STATUS_EVENT, &TorStatus::Running);
                    logline(app, "[tor] control port ready — Tor is running");
                    return Ok(());
                }
            }
        }

        if Instant::now() >= deadline {
            {
                let mut m = manager.lock().unwrap();
                if let Some(c) = m.child.as_mut() {
                    let _ = c.kill();
                }
                m.child = None;
            }
            return Err(AetherError::Internal(
                "Timed out waiting for Tor to open its control port".to_string(),
            ));
        }
        std::thread::sleep(Duration::from_millis(1500));
    }
}

pub fn stop(app: &AppHandle, manager: &Arc<Mutex<TorManager>>) -> Result<(), AetherError> {
    {
        let mut m = manager.lock().unwrap();
        if m.child.is_none() {
            return match &m.status {
                TorStatus::Error { .. } | TorStatus::Stopped => Ok(()),
                _ => Err(AetherError::Internal("Tor is not running".to_string())),
            };
        }
        m.user_stop = true;
    }

    set_status(app, manager, TorStatus::Stopping);
    logline(app, "[tor] stopping Tor…");

    // Graceful shutdown, then hard kill after SHUTDOWN_GRACE. Tor saves its
    // state on a clean SHUTDOWN; the fallback kill is what the aether flow
    // does too.
    let (control_port, cookie) = {
        let m = manager.lock().unwrap();
        (m.control_port, m.cookie.clone())
    };
    if let Some(cookie) = cookie {
        let _ = control_exchange(control_port, &cookie, "SIGNAL SHUTDOWN");
    }

    let grace = Instant::now() + SHUTDOWN_GRACE;
    let mut killed = false;
    loop {
        let exited = {
            let mut m = manager.lock().unwrap();
            if m.child_exited().is_some() {
                m.child = None;
            }
            if m.child.is_none() {
                true
            } else {
                if !killed && Instant::now() >= grace {
                    if let Some(child) = m.child.as_mut() {
                        let _ = child.kill();
                    }
                    killed = true;
                }
                false
            }
        };
        if exited {
            break;
        }
        if killed && Instant::now() >= grace + KILL_GRACE {
            let mut m = manager.lock().unwrap();
            if let Some(mut child) = m.child.take() {
                let _ = child.kill();
            }
            break;
        }
        std::thread::sleep(Duration::from_millis(200));
    }

    {
        let mut m = manager.lock().unwrap();
        m.child = None;
        m.cookie = None;
        m.user_stop = false;
    }
    // Tor's SOCKS is gone — if the IP-changer's system proxy was on, drop it
    // rather than leave every browser pointing at a dead 127.0.0.1:9050.
    if crate::sysproxy::source() == crate::sysproxy::SOURCE_IP_CHANGER {
        let _ = crate::sysproxy::disable();
    }
    set_status(app, manager, TorStatus::Stopped);
    logline(app, "[tor] stopped");
    Ok(())
}

pub fn rotate(app: &AppHandle, manager: &Arc<Mutex<TorManager>>) -> Result<(), AetherError> {
    let (control_port, cookie) = {
        let m = manager.lock().unwrap();
        (m.control_port, m.cookie.clone())
    };
    let cookie = cookie.ok_or_else(|| AetherError::Internal("Tor is not running".to_string()))?;
    control_exchange(control_port, &cookie, "SIGNAL NEWNYM")
        .map_err(|e| AetherError::Internal(format!("failed to request new identity: {e}")))?;
    {
        let mut m = manager.lock().unwrap();
        m.auto_last_ms = now_millis();
    }
    logline(
        app,
        "[tor] new identity (NEWNYM) requested — exit IP will change within a few seconds",
    );
    Ok(())
}

/// Live exit IP through Tor's SOCKS5 port. `None` → not running (or the probe
/// is mid-bootstrap); the frontend renders dashes while that's the case and
/// keeps polling at a slow interval. No message spam for transient failures.
pub async fn current_ip(manager: &Arc<Mutex<TorManager>>) -> Option<PublicInfo> {
    let (running, socks_port) = {
        let m = manager.lock().unwrap();
        (m.status.is_running(), m.socks_port)
    };
    if !running {
        return None;
    }
    fetch_tor_ip(socks_port).await
}

async fn fetch_tor_ip(socks_port: u16) -> Option<PublicInfo> {
    let proxy = reqwest::Proxy::all(format!("socks5h://127.0.0.1:{socks_port}")).ok()?;
    let client = reqwest::Client::builder()
        .timeout(IP_REQUEST_TIMEOUT)
        .user_agent(IP_USER_AGENT)
        .proxy(proxy)
        .build()
        .ok()?;
    for url in [crate::net::ENDPOINT_IPWHO, crate::net::ENDPOINT_IPAPI] {
        if let Some(info) = fetch_from(&client, url).await {
            return Some(info);
        }
    }
    None
}

async fn fetch_from(client: &reqwest::Client, url: &str) -> Option<PublicInfo> {
    let resp = client.get(url).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let v: serde_json::Value = resp.json().await.ok()?;
    if v.get("success").and_then(|x| x.as_bool()) == Some(false) {
        return None;
    }
    crate::net::parse(&v)
}

pub fn apply_auto_rotate(
    manager: &Arc<Mutex<TorManager>>,
    interval_secs: u64,
    enabled: bool,
) -> Result<(), AetherError> {
    if enabled && !(MIN_AUTO_INTERVAL_SECS..=MAX_AUTO_INTERVAL_SECS).contains(&interval_secs) {
        return Err(AetherError::Internal(format!(
            "auto-rotate interval must be between {} and {MAX_AUTO_INTERVAL_SECS} seconds",
            MIN_AUTO_INTERVAL_SECS
        )));
    }
    let mut m = manager.lock().unwrap();
    m.auto_enabled = enabled;
    m.auto_interval_secs = interval_secs;
    if enabled {
        // Start the countdown from now so enabling doesn't rotate instantly.
        m.auto_last_ms = now_millis();
    }
    Ok(())
}

pub fn auto_rotate_config(manager: &Arc<Mutex<TorManager>>) -> AutoRotateConfig {
    let m = manager.lock().unwrap();
    AutoRotateConfig {
        enabled: m.auto_enabled,
        interval_secs: m.auto_interval_secs,
    }
}

/// One-shot background loop (spawned once from `setup`): every second, if
/// auto-rotation is enabled and the per-interval window has elapsed since the
/// last NEWNYM, rotate again. Keeps working even while the panel is closed.
pub fn spawn_auto_rotate(app: AppHandle, manager: Arc<Mutex<TorManager>>) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(1));
        let now = now_millis();
        let (enabled, interval, last, running, cookie, port) = {
            let m = manager.lock().unwrap();
            (
                m.auto_enabled,
                m.auto_interval_secs,
                m.auto_last_ms,
                m.status.is_running(),
                m.cookie.clone(),
                m.control_port,
            )
        };
        if !(enabled && running) || interval == 0 || now.saturating_sub(last) < interval * 1000 {
            continue;
        }
        let Some(cookie) = cookie else { continue };
        match control_exchange(port, &cookie, "SIGNAL NEWNYM") {
            Ok(_) => {
                let mut m = manager.lock().unwrap();
                m.auto_last_ms = now_millis();
                logline(
                    &app,
                    format!("[tor] auto-rotate: new identity requested (every {interval}s)"),
                );
            }
            Err(e) => logline(&app, format!("[tor] auto-rotate failed: {e}")),
        }
    });
}

/// Called from `RunEvent::Exit` — no events, just make sure nothing survives.
pub fn shutdown_blocking(manager: &Mutex<TorManager>) {
    let mut m = manager.lock().unwrap();
    if let Some(child) = m.child.as_mut() {
        // Hard exit — no time for a graceful control-port SHUTDOWN.
        let _ = child.kill();
        let deadline = Instant::now() + KILL_GRACE;
        while m.child_exited().is_none() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(100));
        }
    }
    m.child = None;
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn start_tor(app: AppHandle, state: State<'_, AppState>) -> Result<(), AetherError> {
    start(&app, &state.tor_manager)
}

#[tauri::command]
pub fn stop_tor(app: AppHandle, state: State<'_, AppState>) -> Result<(), AetherError> {
    stop(&app, &state.tor_manager)
}

#[tauri::command]
pub fn rotate_ip(app: AppHandle, state: State<'_, AppState>) -> Result<(), AetherError> {
    rotate(&app, &state.tor_manager)
}

#[tauri::command]
pub async fn get_current_ip(state: State<'_, AppState>) -> Result<Option<PublicInfo>, AetherError> {
    Ok(current_ip(&state.tor_manager).await)
}

#[tauri::command]
pub fn get_tor_status(state: State<'_, AppState>) -> TorStatus {
    state.tor_manager.lock().unwrap().status.clone()
}

#[tauri::command]
pub fn set_auto_rotate(
    state: State<'_, AppState>,
    interval_secs: u64,
    enabled: bool,
) -> Result<(), AetherError> {
    apply_auto_rotate(&state.tor_manager, interval_secs, enabled)
}

#[tauri::command]
pub fn get_auto_rotate(state: State<'_, AppState>) -> AutoRotateConfig {
    auto_rotate_config(&state.tor_manager)
}

#[tauri::command]
pub fn tor_binary_exists(app: AppHandle) -> bool {
    tor_binary_path(&app).is_ok()
}

/// Effective SOCKS host the proxy is (or will be) bound to, plus its port —
/// lets the frontend render a copyable `127.0.0.1:9050` / `0.0.0.0:9050` chip.
#[derive(Serialize, Clone, Debug)]
pub struct TorSocksAddr {
    pub host: String,
    pub port: u16,
}

#[tauri::command]
pub fn get_socks_addr(state: State<'_, AppState>) -> TorSocksAddr {
    let m = state.tor_manager.lock().unwrap();
    TorSocksAddr {
        host: if m.lan_bind {
            "0.0.0.0".to_string()
        } else {
            "127.0.0.1".to_string()
        },
        port: m.socks_port,
    }
}

#[tauri::command]
pub fn set_tor_lan(state: State<'_, AppState>, enabled: bool) -> Result<(), AetherError> {
    state.tor_manager.lock().unwrap().lan_bind = enabled;
    Ok(())
}

#[tauri::command]
pub fn get_tor_lan(state: State<'_, AppState>) -> bool {
    state.tor_manager.lock().unwrap().lan_bind
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_encoding() {
        assert_eq!(hex(&[0xde, 0xad, 0xbe, 0xef]), "deadbeef");
        assert_eq!(hex(&[]), "");
        assert_eq!(hex(&[0x00, 0x0f]), "000f");
    }
}
