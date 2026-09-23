use serde::Serialize;

pub const STATUS_EVENT: &str = "aether://status";
pub const LOG_EVENT: &str = "aether://log";
pub const ENGINE_TOR_STATUS_EVENT: &str = "aether://tor-status";
pub const ENGINE_PSIHON_STATUS_EVENT: &str = "aether://psiphon-status";

#[derive(Serialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct EngineTorStatus {
    pub enabled: bool,
    pub ready: bool,
    pub address: Option<String>,
}

pub type EnginePsiphonStatus = EngineTorStatus;

pub const TRAFFIC_EVENT: &str = "aether://traffic";
pub const TOR_STATUS_EVENT: &str = "ip-changer://status";
pub const TOR_LOG_EVENT: &str = "ip-changer://log";

#[derive(Serialize, Clone, Debug)]
pub struct LogEvent {
    pub line: String,
    pub timestamp: u64,
}

pub fn now_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
