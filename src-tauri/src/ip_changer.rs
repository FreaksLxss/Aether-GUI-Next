
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

pub const DEFAULT_SOCKS_PORT: u16 = 9050;
pub const DEFAULT_CONTROL_PORT: u16 = 9051;

const BOOTSTRAP_TIMEOUT: Duration = Duration::from_secs(120);
const SHUTDOWN_GRACE: Duration = Duration::from_secs(10);
const KILL_GRACE: Duration = Duration::from_secs(3);

const MIN_AUTO_INTERVAL_SECS: u64 = 60;
const MAX_AUTO_INTERVAL_SECS: u64 = 86_400;

const IP_REQUEST_TIMEOUT: Duration = Duration::from_secs(8);
const IP_USER_AGENT: &str = concat!("aether-gui/", env!("CARGO_PKG_VERSION"), " ip-changer");

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

#[derive(Serialize, Clone, Debug)]
pub struct AutoRotateConfig {
    pub enabled: bool,
    pub interval_secs: u64,
}

pub struct TorManager {
    child: Option<Child>,
    status: TorStatus,
    data_dir: Option<PathBuf>,
    cookie: Option<Vec<u8>>,
    user_stop: bool,
    socks_port: u16,
    control_port: u16,
    lan_bind: bool,
    use_system_tor: bool,
    auto_enabled: bool,
    auto_interval_secs: u64,
    auto_last_ms: u64,
}

impl TorManager {
    pub fn socks_port(&self) -> u16 {
        self.socks_port
    }

    pub fn set_use_system_tor(&mut self, value: bool) {
        self.use_system_tor = value;
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
            use_system_tor: false,
            auto_enabled: false,
            auto_interval_secs: 60,
            auto_last_ms: 0,
        }
    }
}

impl TorManager {
    fn child_exited(&mut self) -> Option<std::process::ExitStatus> {
        self.child
            .as_mut()
            .and_then(|c| c.try_wait().ok())
            .flatten()
    }
}


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

pub fn system_tor_binary() -> Option<PathBuf> {
    let name = if cfg!(windows) { "tor.exe" } else { "tor" };

    if let Some(paths) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&paths) {
            let cand = dir.join(name);
            if cand.is_file() {
                return Some(cand);
            }
        }
    }
    if cfg!(target_os = "linux") {
        for dir in ["/usr/bin", "/usr/local/bin", "/bin"] {
            let cand = PathBuf::from(dir).join(name);
            if cand.is_file() {
                return Some(cand);
            }
        }
    }
    None
}

#[derive(PartialEq, Clone, Copy, Debug)]
enum TorEngine {
    Bundled,
    System,
}


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
    logline(app, "[tor] starting Tor…");

    match do_start(app, manager) {
        Ok(()) => Ok(()),
        Err(e) => {
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
    let engine = {
        let m = manager.lock().unwrap();
        if m.use_system_tor {
            TorEngine::System
        } else {
            TorEngine::Bundled
        }
    };
    let binary = match engine {
        TorEngine::Bundled => tor_binary_path(app)?,
        TorEngine::System => system_tor_binary().ok_or_else(|| {
            AetherError::Internal(
                "system Tor selected but no `tor` binary found on PATH".to_string(),
            )
        })?,
    };
    logline(
        app,
        match engine {
            TorEngine::Bundled => format!("[tor] using app-bundled Tor: {}", binary.display()),
            TorEngine::System => format!("[tor] using system Tor package: {}", binary.display()),
        },
    );

    {
        let (socks, control) = {
            let m = manager.lock().unwrap();
            (m.socks_port, m.control_port)
        };
        for port in [socks, control] {
            let addr = SocketAddr::from(([127, 0, 0, 1], port));
            if crate::aether::status::port_is_live(&addr) && !crate::httpproxy::is_claimed(&addr) {
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
    let cookie_path = run_dir.join("control_auth_cookie");
    let _ = std::fs::remove_file(&cookie_path);

    let (socks_port, control_port, lan_bind) = {
        let m = manager.lock().unwrap();
        (m.socks_port, m.control_port, m.lan_bind)
    };
    let socks_host = if lan_bind { "0.0.0.0" } else { "127.0.0.1" };

    let tor_upstream = crate::httpproxy::free_loopback_ports(1)
        .map_err(AetherError::Internal)?
        .into_iter()
        .next()
        .expect("one port");
    crate::httpproxy::claim(&format!("{socks_host}:{socks_port}"), tor_upstream)
        .map_err(|e| AetherError::Internal(format!("claim {socks_host}:{socks_port}: {e}")))?;

    let mut cmd = Command::new(&binary);
    crate::childproc::hidden(&mut cmd);
    cmd.arg("--SocksPort")
        .arg(tor_upstream.to_string())
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

pub fn shutdown_blocking(manager: &Mutex<TorManager>) {
    let mut m = manager.lock().unwrap();
    if let Some(child) = m.child.as_mut() {
        let _ = child.kill();
        let deadline = Instant::now() + KILL_GRACE;
        while m.child_exited().is_none() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(100));
        }
    }
    m.child = None;
}


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

#[derive(Serialize, Clone, Debug)]
pub struct TorSourceInfo {
    pub using_system: bool,
    pub bundled_available: bool,
    pub system_available: bool,
    pub system_path: Option<String>,
}

#[tauri::command]
pub fn get_tor_source(app: AppHandle, state: State<'_, AppState>) -> TorSourceInfo {
    let using_system = state.tor_manager.lock().unwrap().use_system_tor;
    let system_path = system_tor_binary();
    TorSourceInfo {
        using_system,
        bundled_available: tor_binary_path(&app).is_ok(),
        system_available: system_path.is_some(),
        system_path: system_path.map(|p| p.display().to_string()),
    }
}

#[tauri::command]
pub fn set_use_system_tor(
    app: AppHandle,
    state: State<'_, AppState>,
    use_system: bool,
) -> Result<(), AetherError> {
    if use_system && system_tor_binary().is_none() {
        return Err(AetherError::Internal(
            "system Tor not found on PATH".to_string(),
        ));
    }
    let mut m = state.tor_manager.lock().unwrap();
    m.set_use_system_tor(use_system);
    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app.store("settings.json") {
        store.set("ip_changer_use_system_tor", use_system);
        let _ = store.save();
    }
    Ok(())
}

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
