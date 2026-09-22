pub mod engine;
pub mod orphan;
pub mod profiles;
pub mod prompts;
#[cfg(not(target_os = "android"))]
pub mod pty;
#[cfg(target_os = "android")]
#[path = "pty_android.rs"]
pub mod pty;
pub mod pty_output;
pub mod status;

use crate::error::AetherError;
use crate::events::{
    now_millis, EnginePsiphonStatus, EngineTorStatus, LogEvent, ENGINE_PSIHON_STATUS_EVENT,
    ENGINE_TOR_STATUS_EVENT, LOG_EVENT, STATUS_EVENT,
};
use crate::history::{self, ConnectionEntry};
use crate::state::ConnectionState;
use profiles::ConnectionProfile;
use pty::PtySession;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

pub struct AetherManager {
    session: Option<PtySession>,
    state: ConnectionState,
    user_requested_stop: bool,
    /// Consecutive auto-retry attempts for the current connection lineage.
    /// Reset to 0 on a fresh user-initiated connect, on reaching Connected
    /// (a proven-working connection earns a full retry budget for whatever
    /// drops it next), and on a user-requested disconnect.
    retry_count: u32,
    /// Timestamp (ms since epoch) when we last entered Connected, used to
    /// compute session duration for connection history.
    connected_at: Option<u64>,
    tor_status: EngineTorStatus,
    psiphon_status: EnginePsiphonStatus,
    /// Bumped on every spawn. Monitors capture it at start and bail if it
    /// changes, so a stale monitor can never kill or manage a newer session.
    epoch: u64,
}

impl AetherManager {
    pub fn new() -> Self {
        Self {
            session: None,
            state: ConnectionState::Idle,
            user_requested_stop: false,
            retry_count: 0,
            connected_at: None,
            tor_status: EngineTorStatus::default(),
            psiphon_status: EnginePsiphonStatus::default(),
            epoch: 0,
        }
    }

    pub fn status(&self) -> ConnectionState {
        self.state.clone()
    }

    pub fn tor_status(&self) -> EngineTorStatus {
        self.tor_status.clone()
    }

    pub fn psiphon_status(&self) -> EnginePsiphonStatus {
        self.psiphon_status.clone()
    }

    fn update_tor_status(&mut self, app: &AppHandle, status: EngineTorStatus) {
        if self.tor_status != status {
            self.tor_status = status;
            let _ = app.emit(ENGINE_TOR_STATUS_EVENT, &self.tor_status);
        }
    }

    fn update_psiphon_status(&mut self, app: &AppHandle, status: EnginePsiphonStatus) {
        if self.psiphon_status != status {
            self.psiphon_status = status;
            let _ = app.emit(ENGINE_PSIHON_STATUS_EVENT, &self.psiphon_status);
        }
    }
}

fn app_data_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir())
}

fn set_state_and_emit(
    app: &AppHandle,
    manager: &Arc<Mutex<AetherManager>>,
    new_state: ConnectionState,
) {
    manager.lock().unwrap().state = new_state.clone();
    let _ = app.emit(STATUS_EVENT, &new_state);
}

/// Kicks off a connection attempt and returns as soon as Aether is spawned
/// (or a synchronous precondition fails: already running / port already
/// bound / binary missing). The actual Launching -> Connecting -> Connected
/// transitions happen on a background thread and reach the frontend via the
/// `aether://status` event, matching the IPC contract in the approved plan.
pub fn start_connect(
    app: AppHandle,
    manager: Arc<Mutex<AetherManager>>,
    profile_override: Option<ConnectionProfile>,
) -> Result<(), AetherError> {
    let installing = engine::INSTALLING.lock().unwrap();
    if *installing {
        return Err(AetherError::Internal("Engine repair is in progress".into()));
    }
    // Resolve everything fallible that doesn't touch AetherManager's state
    // first, so that once we transition to Launching below, the only
    // remaining failure mode is pty::spawn itself — which is handled
    // explicitly inside spawn_and_monitor rather than ever leaving the
    // state machine stuck in Launching with no process behind it.
    let profile = profile_override.unwrap_or_else(|| profiles::load(&app));
    if let Err(msg) = profiles::validate(&profile) {
        return Err(AetherError::Internal(msg));
    }
    // Unsupported engines fail before any state transition or retry loop.
    let binary = engine::resolve(&app)?;
    let data_dir = app_data_dir(&app);
    std::fs::create_dir_all(&data_dir).map_err(|e| AetherError::Internal(e.to_string()))?;

    {
        let mut mgr = manager.lock().unwrap();
        if !matches!(
            mgr.state,
            ConnectionState::Idle | ConnectionState::Error { .. }
        ) {
            return Err(AetherError::AlreadyRunning);
        }
        // Secondary arti door the engine will bind (chain mode default 1820;
        // reverse only when explicitly set) — claimed alongside the main bind.
        let tor_door = match profile.engine_tor_mode {
            profiles::EngineTorMode::Tor => status::secondary_tor_address(&profile),
            profiles::EngineTorMode::TorReverse => profile
                .engine_tor_bind
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .and_then(|s| s.parse().ok()),
            _ => None,
        };
        // Engine Psiphon secondary door (chain default 1821; reverse only when
        // explicitly set) — claimed after route_connect resets stale ports.
        let psiphon_door = match profile.engine_psiphon_mode {
            profiles::EnginePsiphonMode::Psiphon => status::secondary_psiphon_address(&profile),
            profiles::EnginePsiphonMode::PsiphonReverse => profile
                .engine_psiphon_bind
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .and_then(|s| s.parse().ok()),
            _ => None,
        };
        // Claim the advertised port (default 1819) for the counting bridge and
        // give the engine a private loopback port behind it, so hardcoded
        // configs like Telegram → 127.0.0.1:1819 land on the counter instead
        // of bypassing it. A foreign process on the advertised port errors
        // here the same way the old port-live probe did. Under the same lock
        // as the state check so a rapid double-click can't race past it.
        if let Err(e) = crate::httpproxy::route_connect(&profile.bind_address, tor_door) {
            let port = status::parse_bind_address(&profile.bind_address).port();
            log::warn!(
                "[httpproxy] route_connect({}) failed: {e}",
                profile.bind_address
            );
            return Err(AetherError::PortInUse(port));
        }
        // The optional HTTP door gets the same treatment — the bridge already
        // speaks HTTP CONNECT, so the engine never needs its native listener.
        if let Some(http) = profile
            .http_proxy_address
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            let engine = crate::httpproxy::engine_addr();
            if let Err(e) = crate::httpproxy::claim(http, engine) {
                let port = status::parse_bind_address(http).port();
                log::warn!("[httpproxy] claim({http}) failed: {e}");
                return Err(AetherError::PortInUse(port));
            }
        }
        // Same treatment for the Psiphon chain/reverse secondary door.
        if let Some(door) = psiphon_door {
            if let Err(e) = crate::httpproxy::claim_psiphon_door(door) {
                log::warn!("[httpproxy] claim_psiphon_door({door}) failed: {e}");
                return Err(AetherError::PortInUse(door.port()));
            }
        }
        // Reverse with no advertised door still binds a local SOCKS for the
        // tunnel to dial through — reserve a private port so the engine never
        // lands on 1821/1820 this process already holds from a chain session.
        if profile.engine_psiphon_mode == profiles::EnginePsiphonMode::PsiphonReverse
            && crate::httpproxy::engine_psiphon_addr().is_none()
        {
            if let Err(e) = crate::httpproxy::reserve_engine_psiphon() {
                log::warn!("[httpproxy] reserve_engine_psiphon failed: {e}");
                return Err(AetherError::Internal(e));
            }
        }
        if profile.engine_tor_mode == profiles::EngineTorMode::TorReverse
            && crate::httpproxy::engine_tor_addr().is_none()
        {
            if let Err(e) = crate::httpproxy::reserve_engine_tor() {
                log::warn!("[httpproxy] reserve_engine_tor failed: {e}");
                return Err(AetherError::Internal(e));
            }
        }
        mgr.state = ConnectionState::Launching;
        // A fresh user-initiated connect always gets a full retry budget,
        // independent of whatever happened on a previous, unrelated attempt.
        mgr.retry_count = 0;
    }
    crate::traffic::reset();
    let _ = app.emit(STATUS_EVENT, &ConnectionState::Launching);

    spawn_and_monitor(app, manager, binary, data_dir, profile)
}

/// Spawns the PTY session and the log-forwarding + monitor threads. Shared
/// by the initial user-initiated connect and by `handle_unexpected_failure`'s
/// auto-retry — both start from the same place (a fresh PTY, `Launching`
/// already set by the caller) and only differ in what led here.
fn spawn_and_monitor(
    app: AppHandle,
    manager: Arc<Mutex<AetherManager>>,
    binary: PathBuf,
    data_dir: PathBuf,
    profile: ConnectionProfile,
) -> Result<(), AetherError> {
    let (log_tx, log_rx) = mpsc::channel::<LogEvent>();
    // Engine gets the private ports `route_connect` allocated — the advertised
    // binds in `profile` stay advertised (they're bridge doors now).
    let mut engine_profile = profile.clone();
    engine_profile.bind_address = crate::httpproxy::engine_addr().to_string();
    if let Some(tor) = crate::httpproxy::engine_tor_addr() {
        engine_profile.engine_tor_bind = Some(tor.to_string());
    }
    if let Some(psi) = crate::httpproxy::engine_psiphon_addr() {
        engine_profile.engine_psiphon_bind = Some(psi.to_string());
    }
    let session_or_err = pty::spawn(&binary, &data_dir, engine_profile, log_tx);
    let session = match session_or_err {
        Ok(session) => session,
        Err(e) => {
            // Must not leave the state machine stuck in Launching with no
            // process behind it. A spawn failure is an OS/environment-level
            // problem (not a network drop), so it is not auto-retried —
            // retrying blindly here would just mask a real setup issue.
            // The SOCKS socket is dead now, so drop the system proxy too —
            // otherwise the OS keeps pointing at 127.0.0.1:1819 with nothing
            // listening behind it.
            crate::sysproxy::disable_if_main();
            set_state_and_emit(
                &app,
                &manager,
                ConnectionState::Error {
                    message: e.to_string(),
                    phase: "launching".into(),
                },
            );
            return Err(e);
        }
    };
    orphan::write_pid(&data_dir, session.pid());

    {
        let mut mgr = manager.lock().unwrap();
        mgr.session = Some(session);
        mgr.user_requested_stop = false;
        mgr.epoch += 1;
        mgr.update_tor_status(&app, status::secondary_tor_status(&profile, false));
        mgr.update_psiphon_status(&app, status::secondary_psiphon_status(&profile, false));
    }

    // Forward every log line to the frontend's advanced/log panel as it
    // arrives, independent of whether status classification succeeds.
    {
        let app_for_logs = app.clone();
        std::thread::spawn(move || {
            for log in log_rx {
                let _ = app_for_logs.emit(LOG_EVENT, &log);
            }
        });
    }

    {
        let app = app.clone();
        let manager = Arc::clone(&manager);
        let binary = binary.clone();
        let data_dir = data_dir.clone();
        std::thread::spawn(move || monitor_connect(app, manager, binary, data_dir, profile));
    }

    Ok(())
}

/// Common landing spot for every unexpected failure (process exit before
/// connecting, scan timeout, or process exit after being connected) that
/// was NOT a user-requested disconnect. Retries with backoff up to
/// `status::MAX_AUTO_RETRIES` before giving up with a real `Error` — this
/// is what turns a mid-session drop (the "stops all of a sudden" case,
/// worst on gool since it's two nested tunnels, but not exclusive to it)
/// into a brief, visible "Reconnecting" instead of dumping the user back to
/// Idle every time.
fn handle_unexpected_failure(
    app: AppHandle,
    manager: Arc<Mutex<AetherManager>>,
    binary: PathBuf,
    data_dir: PathBuf,
    profile: ConnectionProfile,
    failure_message: String,
    phase: &'static str,
) {
    let attempt = {
        let mut mgr = manager.lock().unwrap();
        if mgr.user_requested_stop {
            // request_disconnect is already handling this exit; don't race
            // it with a retry or an Error state it didn't ask for.
            return;
        }
        // Record history if we were previously connected.
        if let Some(connected_at) = mgr.connected_at.take() {
            let duration = now_millis().saturating_sub(connected_at) / 1000;
            history::save(
                &app,
                &ConnectionEntry {
                    protocol: format!("{:?}", profile.protocol).to_lowercase(),
                    scan_mode: format!("{:?}", profile.scan_mode).to_lowercase(),
                    timestamp: connected_at,
                    duration_secs: duration,
                    success: false,
                },
            );
        }
        mgr.session = None;
        // Keep the secondary listeners "enabled" (unready) across a retry so
        // the UI line doesn't unmount/remount when a VPN flap forces reconnect.
        mgr.update_tor_status(&app, status::secondary_tor_status(&profile, false));
        mgr.update_psiphon_status(&app, status::secondary_psiphon_status(&profile, false));
        mgr.retry_count += 1;
        mgr.retry_count
    };
    orphan::clear_pid(&data_dir);

    // Surface the actual reason (incl. the process exit code on Windows) in
    // the advanced log — without this, a crash-looping binary looks silent
    // because Reconnecting/Error states alone carry no detail.
    let _ = app.emit(
        LOG_EVENT,
        LogEvent {
            line: format!("[gui] {failure_message}"),
            timestamp: now_millis(),
        },
    );

    if attempt > status::MAX_AUTO_RETRIES {
        // Giving up on the attempt — the tunnel's SOCKS socket is dead, so the
        // OS proxy (if the user turned it on) would now point at a port with
        // nothing listening, breaking every browser. Drop it.
        crate::sysproxy::disable_if_main();
        crate::traffic::reset();
        set_state_and_emit(
            &app,
            &manager,
            ConnectionState::Error {
                message: format!(
                    "{failure_message} (gave up after {} retries)",
                    status::MAX_AUTO_RETRIES
                ),
                phase: phase.into(),
            },
        );
        return;
    }

    set_state_and_emit(
        &app,
        &manager,
        ConnectionState::Reconnecting {
            attempt,
            max_attempts: status::MAX_AUTO_RETRIES,
        },
    );

    let backoff = status::RETRY_BACKOFF[(attempt - 1) as usize];
    std::thread::spawn(move || {
        std::thread::sleep(backoff);
        {
            let mgr = manager.lock().unwrap();
            if mgr.user_requested_stop {
                return;
            }
        }
        crate::traffic::reset();
        set_state_and_emit(&app, &manager, ConnectionState::Launching);
        // spawn_and_monitor already lands its own failure in Error/retry —
        // nothing further to do with its Result here.
        let _ = spawn_and_monitor(app, manager, binary, data_dir, profile);
    });
}

fn monitor_connect(
    app: AppHandle,
    manager: Arc<Mutex<AetherManager>>,
    binary: PathBuf,
    data_dir: PathBuf,
    profile: ConnectionProfile,
) {
    let deadline = Instant::now() + status::startup_timeout(&profile);
    let epoch = manager.lock().unwrap().epoch;
    let mut announced_connecting = false;

    loop {
        std::thread::sleep(Duration::from_millis(400));
        let mut mgr = manager.lock().unwrap();
        if mgr.user_requested_stop || mgr.epoch != epoch {
            return;
        }
        // Liveness probes the ENGINE's private port — re-read every tick: a
        // later route_connect may have moved it. The advertised bind is the
        // bridge, always live, and would report a false Connected.
        let socks = crate::httpproxy::engine_addr();

        if let Some(exit) = mgr.session.as_mut().and_then(|s| s.try_wait()) {
            // A permanent configuration failure (rejected option/value,
            // missing transport, taken bind) must not burn the auto-retry
            // budget: retrying a bad flag just repeats it and buries the real
            // cause under scan-mode advice. Fail fast with the sanitized
            // fixed message instead. Desktop only — the Android pipe session
            // doesn't classify output.
            #[cfg(not(target_os = "android"))]
            if let Some(failure) = mgr
                .session
                .as_ref()
                .and_then(|s| s.startup_failure_after_exit())
            {
                mgr.session = None;
                mgr.update_tor_status(&app, EngineTorStatus::default());
                mgr.update_psiphon_status(&app, EnginePsiphonStatus::default());
                mgr.state = ConnectionState::Error {
                    message: failure.message().into(),
                    phase: "configuration".into(),
                };
                let state = mgr.state.clone();
                drop(mgr);
                orphan::clear_pid(&data_dir);
                crate::sysproxy::disable_if_main();
                crate::traffic::reset();
                let _ = app.emit(STATUS_EVENT, &state);
                return;
            }
            mgr.session = None;
            drop(mgr);
            handle_unexpected_failure(
                app,
                manager,
                binary,
                data_dir,
                profile,
                format!("Aether exited before connecting ({exit})"),
                "connecting",
            );
            return;
        }

        // Sticky once ready: re-probing a live SOCKS with a bare TCP connect
        // makes Psiphon log EOF every tick and (under PTY backpressure) flap
        // `ready` — which is exactly the status text blinking in the UI.
        let tor = mgr.tor_status();
        let next_tor = if tor.enabled && tor.ready {
            tor
        } else {
            status::secondary_tor_status(&profile, true)
        };
        mgr.update_tor_status(&app, next_tor);
        let psi = mgr.psiphon_status();
        let next_psi = if psi.enabled && psi.ready {
            psi
        } else {
            status::secondary_psiphon_status(&profile, true)
        };
        mgr.update_psiphon_status(&app, next_psi);

        if !announced_connecting {
            let done = mgr
                .session
                .as_ref()
                .map(|s| s.prompts_done())
                .unwrap_or(false);
            if done {
                mgr.state = ConnectionState::Connecting;
                let new_state = mgr.state.clone();
                announced_connecting = true;
                drop(mgr);
                let _ = app.emit(STATUS_EVENT, &new_state);
                let _ = app.emit(
                    LOG_EVENT,
                    LogEvent {
                        line: format!("[gui] {}", status::startup_stage(&profile)),
                        timestamp: now_millis(),
                    },
                );
                continue;
            }
        }

        if status::port_is_live(&socks) {
            let now = now_millis();
            let engine = crate::httpproxy::engine_addr();
            // Belt-and-braces: `route_connect` already pointed the bridge here,
            // but a retry may have re-allocated the engine port since.
            crate::httpproxy::set_target(&engine.to_string());
            let new_state = ConnectionState::Connected {
                // Private engine port — only for set_target/SystemProxyToggle.
                socks_addr: engine.to_string(),
                // The advertised bind is now this process's counting bridge —
                // hand it to copy/PAC/apps so their bytes land on the counter.
                bridge_addr: profile.bind_address.clone(),
                connected_at_ms: now,
            };
            mgr.state = new_state.clone();
            mgr.connected_at = Some(now);
            // Proven working — a future drop earns a fresh full retry budget
            // rather than inheriting whatever it took to get here.
            mgr.retry_count = 0;
            drop(mgr);
            let _ = app.emit(STATUS_EVENT, &new_state);
            // Only persisted as "last successful" once actually proven to
            // work, never on a mere attempt (see profiles::save's doc-comment).
            profiles::save(&app, &profile);

            // Activate TUN mode if capture_mode requires it
            if matches!(
                profile.capture_mode,
                crate::aether::profiles::CaptureMode::Tun
                    | crate::aether::profiles::CaptureMode::Both
            ) {
                use crate::state::AppState;
                let tun_manager = app.state::<AppState>().tun_manager.clone();
                let mut tun = tun_manager.lock().unwrap();
                let resource_dir = app.path().resource_dir().ok();
                let resource_dir_ref = resource_dir.as_deref();
                // Forwarder talks to the engine directly (already counted on
                // the TUN side) — going through the bridge would double-count.
                let engine = crate::httpproxy::engine_addr().to_string();
                if let Err(e) = tun.activate(&engine, &profile, resource_dir_ref) {
                    let _ = app.emit(
                        LOG_EVENT,
                        LogEvent {
                            line: format!("[tun] Failed to activate TUN: {e}"),
                            timestamp: now_millis(),
                        },
                    );
                    // TUN failure is non-fatal — connection still works via SOCKS5
                }
                drop(tun);
            }

            monitor_connected(app, manager, binary, data_dir, profile);
            return;
        }

        if Instant::now() >= deadline {
            if let Some(session) = mgr.session.as_mut() {
                session.kill();
            }
            mgr.session = None;
            drop(mgr);
            handle_unexpected_failure(
                app,
                manager,
                binary,
                data_dir,
                profile,
                "Timed out waiting for Aether to find a working route".into(),
                "connecting",
            );
            return;
        }
    }
}

/// Watches an established connection purely for an unexpected process exit —
/// there is no polling needed beyond that once `Connected` is reached.
fn monitor_connected(
    app: AppHandle,
    manager: Arc<Mutex<AetherManager>>,
    binary: PathBuf,
    data_dir: PathBuf,
    profile: ConnectionProfile,
) {
    let epoch = manager.lock().unwrap().epoch;
    loop {
        std::thread::sleep(Duration::from_millis(500));
        let mut mgr = manager.lock().unwrap();
        if mgr.user_requested_stop || mgr.epoch != epoch {
            return;
        }
        // Same stickiness as monitor_connect — a stable Ready must not re-probe.
        let tor = mgr.tor_status();
        let next_tor = if tor.enabled && tor.ready {
            tor
        } else {
            status::secondary_tor_status(&profile, true)
        };
        mgr.update_tor_status(&app, next_tor);
        let psi = mgr.psiphon_status();
        let next_psi = if psi.enabled && psi.ready {
            psi
        } else {
            status::secondary_psiphon_status(&profile, true)
        };
        mgr.update_psiphon_status(&app, next_psi);
        if let Some(exit) = mgr.session.as_mut().and_then(|s| s.try_wait()) {
            mgr.session = None;
            drop(mgr);
            handle_unexpected_failure(
                app,
                manager,
                binary,
                data_dir,
                profile,
                format!("Lost connection unexpectedly ({exit})"),
                "connected",
            );
            return;
        }
    }
}

/// Forwards a user-typed line (e.g. a Zero Trust one-time code, which Aether
/// ≥1.6.0 accepts on stdin and announces when it is waiting for) to the live
/// session's PTY. Nothing to send to if there is no session.
pub fn send_input(
    app: &AppHandle,
    manager: &Arc<Mutex<AetherManager>>,
    line: String,
) -> Result<(), AetherError> {
    let sent = {
        let mgr = manager.lock().unwrap();
        match mgr.session.as_ref() {
            Some(session) => {
                session.send_line(&line);
                true
            }
            None => false,
        }
    };
    if !sent {
        return Err(AetherError::NotConnected);
    }
    // Never echo the code itself; ack the action so the user sees the input
    // reached the tunnel.
    let _ = app.emit(
        LOG_EVENT,
        LogEvent {
            line: "[gui] one-time code sent to Aether".into(),
            timestamp: now_millis(),
        },
    );
    Ok(())
}

pub fn request_disconnect(
    app: &AppHandle,
    manager: &Arc<Mutex<AetherManager>>,
) -> Result<(), AetherError> {
    // Deactivate TUN FIRST — the forwarder depends on SOCKS5 being alive.
    // Must happen before Ctrl-C because once Aether dies, SOCKS5 goes down.
    {
        use crate::state::AppState;
        let tun_manager = app.state::<AppState>().tun_manager.clone();
        let mut tun = tun_manager.lock().unwrap();
        if tun.is_active() {
            if let Err(e) = tun.deactivate() {
                let _ = app.emit(
                    LOG_EVENT,
                    crate::events::LogEvent {
                        line: format!("[tun] Failed to deactivate TUN: {e}"),
                        timestamp: now_millis(),
                    },
                );
            }
        }
    }

    let had_session = {
        let mut mgr = manager.lock().unwrap();
        // Any non-terminal state is cancellable even with no session behind it
        // (mid-backoff Reconnecting, a zombie Launching/Connecting whose
        // monitor already dropped the session) — otherwise the user is stuck
        // until app restart. Only Idle/Error have nothing to cancel.
        let cancellable = !matches!(
            mgr.state,
            ConnectionState::Idle | ConnectionState::Error { .. }
        );
        if mgr.session.is_none() && !cancellable {
            return Err(AetherError::NotConnected);
        }
        // Record history for a successful session being closed by the user.
        if let Some(connected_at) = mgr.connected_at.take() {
            let duration = now_millis().saturating_sub(connected_at) / 1000;
            let profile = profiles::load(app);
            history::save(
                app,
                &ConnectionEntry {
                    protocol: format!("{:?}", profile.protocol).to_lowercase(),
                    scan_mode: format!("{:?}", profile.scan_mode).to_lowercase(),
                    timestamp: connected_at,
                    duration_secs: duration,
                    success: true,
                },
            );
        }
        mgr.user_requested_stop = true;
        mgr.retry_count = 0;
        if let Some(session) = mgr.session.as_ref() {
            session.send_ctrl_c();
        }
        mgr.session.is_some()
    };

    if !had_session {
        // Mid-backoff: the retry thread checks user_requested_stop (just set
        // above) before respawning, so setting the flag is enough — there is
        // no process to wait on, so reflect Idle immediately.
        crate::traffic::reset();
        set_state_and_emit(app, manager, ConnectionState::Idle);
        return Ok(());
    }

    set_state_and_emit(app, manager, ConnectionState::Disconnecting);

    let app = app.clone();
    let manager = Arc::clone(manager);
    std::thread::spawn(move || {
        let deadline = Instant::now() + status::GRACEFUL_SHUTDOWN_GRACE;
        loop {
            std::thread::sleep(Duration::from_millis(200));
            let mut mgr = manager.lock().unwrap();
            let exited = mgr.session.as_mut().and_then(|s| s.try_wait()).is_some();
            if exited || Instant::now() >= deadline {
                if !exited {
                    if let Some(session) = mgr.session.as_mut() {
                        session.kill();
                    }
                }
                mgr.session = None;
                mgr.user_requested_stop = false;
                mgr.update_tor_status(&app, EngineTorStatus::default());
                mgr.update_psiphon_status(&app, EnginePsiphonStatus::default());
                drop(mgr);
                orphan::clear_pid(&app_data_dir(&app));
                // Tunnel is fully down now — turn off the system proxy so it
                // isn't left pointing at a dead SOCKS port when the user
                // disconnects.
                crate::sysproxy::disable_if_main();
                crate::traffic::reset();
                set_state_and_emit(&app, &manager, ConnectionState::Idle);
                return;
            }
        }
    });

    Ok(())
}

/// Called from `RunEvent::Exit` — the app is quitting regardless, so this
/// blocks briefly rather than spawning a thread, and skips emitting events
/// nobody is left to receive.
pub fn shutdown_blocking(
    manager: &Arc<Mutex<AetherManager>>,
    data_dir: &Path,
    app: &tauri::AppHandle,
) {
    // Deactivate TUN first
    {
        use crate::state::AppState;
        let tun_manager = app.state::<AppState>().tun_manager.clone();
        let mut tun = tun_manager.lock().unwrap();
        let _ = tun.deactivate();
    }

    let mut mgr = manager.lock().unwrap();
    if let Some(session) = mgr.session.as_mut() {
        session.send_ctrl_c();
        std::thread::sleep(Duration::from_millis(500));
        session.kill();
    }
    mgr.session = None;
    drop(mgr);
    orphan::clear_pid(data_dir);
    // App is quitting — make sure the OS proxy isn't left pointing at a
    // dead tunnel socket after we exit.
    let _ = crate::sysproxy::disable();
}
