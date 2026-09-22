use crate::aether::AetherManager;
use crate::ip_changer::TorManager;
use crate::tun::TunManager;
use serde::Serialize;
use std::sync::{Arc, Mutex};

/// Mirrors the state machine in the approved plan: Idle -> Launching (PTY
/// spawned, answering prompts) -> Connecting (prompts done, waiting on the
/// SOCKS5 port to come alive) -> Connected. Any abnormal exit or timeout
/// from Launching/Connecting/Connected goes to Error rather than a separate
/// Disconnected state — a clean user-requested stop returns to Idle instead.
///
/// `Reconnecting` is the one addition: an unexpected exit or timeout that
/// wasn't user-requested retries automatically (see aether/mod.rs's
/// `handle_unexpected_failure`) rather than dropping straight to Error —
/// this is the brief backoff wait before a fresh Launching begins, shown
/// distinctly so the user knows it's a retry, not a first attempt.
#[derive(Serialize, Clone, Debug)]
#[serde(tag = "state")]
pub enum ConnectionState {
    Idle,
    Launching,
    Connecting,
    /// `connected_at_ms` is an absolute UNIX-epoch timestamp (ms) rather than
    /// a pre-computed elapsed duration, so the frontend can render a live-
    /// updating session timer without needing another event from the backend.
    Connected {
        /// The engine's raw SOCKS5 bind address — used to point the bridge's
        /// upstream (`set_target`); never hand this to apps directly.
        socks_addr: String,
        /// Loopback HTTP+SOCKS5 counting bridge — hand this to apps, PAC and
        /// manual proxy configs so their bytes land in the traffic monitor.
        bridge_addr: String,
        connected_at_ms: u64,
    },
    Reconnecting {
        attempt: u32,
        max_attempts: u32,
    },
    Disconnecting,
    Error {
        message: String,
        phase: String,
    },
}

pub struct AppState {
    pub manager: Arc<Mutex<AetherManager>>,
    pub tun_manager: Arc<Mutex<TunManager>>,
    /// Independent Tor client for the IP Changer panel — shares no ports with
    /// Aether's engine (SOCKS 9050 vs 1819) and can run alongside or without it.
    /// Engine Tor (arti, when `engine_tor_mode != Disabled`) is a third
    /// isolate: it lives inside the Aether binary/profile.json on 1820 and
    /// shares no binary/dir/port/state with this TorManager.
    pub tor_manager: Arc<Mutex<TorManager>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            manager: Arc::new(Mutex::new(AetherManager::new())),
            tun_manager: Arc::new(Mutex::new(TunManager::new())),
            tor_manager: Arc::new(Mutex::new(TorManager::default())),
        }
    }
}
