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
    retry_count: u32,
    connected_at: Option<u64>,
    tor_status: EngineTorStatus,
    psiphon_status: EnginePsiphonStatus,
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

pub fn start_connect(
    app: AppHandle,
    manager: Arc<Mutex<AetherManager>>,
    profile_override: Option<ConnectionProfile>,
) -> Result<(), AetherError> {
    let installing = engine::INSTALLING.lock().unwrap();
    if *installing {
        return Err(AetherError::Internal("Engine repair is in progress".into()));
    }
    let profile = profile_override.unwrap_or_else(|| profiles::load(&app));
    if let Err(msg) = profiles::validate(&profile) {
        return Err(AetherError::Internal(msg));
    }
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
        if let Err(e) = crate::httpproxy::route_connect(&profile.bind_address, tor_door) {
            let port = status::parse_bind_address(&profile.bind_address).port();
            log::warn!(
                "[httpproxy] route_connect({}) failed: {e}",
                profile.bind_address
            );
            return Err(AetherError::PortInUse(port));
        }
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
        if let Some(door) = psiphon_door {
            if let Err(e) = crate::httpproxy::claim_psiphon_door(door) {
                log::warn!("[httpproxy] claim_psiphon_door({door}) failed: {e}");
                return Err(AetherError::PortInUse(door.port()));
            }
        }
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
        mgr.retry_count = 0;
    }
    crate::traffic::reset();
    let _ = app.emit(STATUS_EVENT, &ConnectionState::Launching);

    spawn_and_monitor(app, manager, binary, data_dir, profile)
}

fn spawn_and_monitor(
    app: AppHandle,
    manager: Arc<Mutex<AetherManager>>,
    binary: PathBuf,
    data_dir: PathBuf,
    profile: ConnectionProfile,
) -> Result<(), AetherError> {
    let (log_tx, log_rx) = mpsc::channel::<LogEvent>();
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
            return;
        }
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
        mgr.update_tor_status(&app, status::secondary_tor_status(&profile, false));
        mgr.update_psiphon_status(&app, status::secondary_psiphon_status(&profile, false));
        mgr.retry_count += 1;
        mgr.retry_count
    };
    orphan::clear_pid(&data_dir);

    let _ = app.emit(
        LOG_EVENT,
        LogEvent {
            line: format!("[gui] {failure_message}"),
            timestamp: now_millis(),
        },
    );

    if attempt > status::MAX_AUTO_RETRIES {
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
        let socks = crate::httpproxy::engine_addr();

        if let Some(exit) = mgr.session.as_mut().and_then(|s| s.try_wait()) {
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
            crate::httpproxy::set_target(&engine.to_string());
            let new_state = ConnectionState::Connected {
                socks_addr: engine.to_string(),
                bridge_addr: profile.bind_address.clone(),
                connected_at_ms: now,
            };
            mgr.state = new_state.clone();
            mgr.connected_at = Some(now);
            mgr.retry_count = 0;
            drop(mgr);
            let _ = app.emit(STATUS_EVENT, &new_state);
            profiles::save(&app, &profile);

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
                let engine = crate::httpproxy::engine_addr().to_string();
                if let Err(e) = tun.activate(&engine, &profile, resource_dir_ref) {
                    let _ = app.emit(
                        LOG_EVENT,
                        LogEvent {
                            line: format!("[tun] Failed to activate TUN: {e}"),
                            timestamp: now_millis(),
                        },
                    );
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
        let cancellable = !matches!(
            mgr.state,
            ConnectionState::Idle | ConnectionState::Error { .. }
        );
        if mgr.session.is_none() && !cancellable {
            return Err(AetherError::NotConnected);
        }
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
                crate::sysproxy::disable_if_main();
                crate::traffic::reset();
                set_state_and_emit(&app, &manager, ConnectionState::Idle);
                return;
            }
        }
    });

    Ok(())
}

pub fn shutdown_blocking(
    manager: &Arc<Mutex<AetherManager>>,
    data_dir: &Path,
    app: &tauri::AppHandle,
) {
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
    let _ = crate::sysproxy::disable();
}
