use crate::aether::AetherManager;
use crate::ip_changer::TorManager;
use crate::tun::TunManager;
use serde::Serialize;
use std::sync::{Arc, Mutex};

#[derive(Serialize, Clone, Debug)]
#[serde(tag = "state")]
pub enum ConnectionState {
    Idle,
    Launching,
    Connecting,
    Connected {
        socks_addr: String,
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
