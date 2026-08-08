use serde::Serialize;

pub const STATUS_EVENT: &str = "aether://status";
pub const LOG_EVENT: &str = "aether://log";

/// Tor (IP Changer) status transitions — `TorStatus`, tagged `state`.
pub const TOR_STATUS_EVENT: &str = "ip-changer://status";
/// Tor stdout/stderr lines plus GUI-generated messages. Same `LogEvent` shape
/// as Aether's log event so the frontend can reuse one renderer.
pub const TOR_LOG_EVENT: &str = "ip-changer://log";

#[derive(Serialize, Clone, Debug)]
pub struct LogEvent {
    pub line: String,
    /// Milliseconds since UNIX_EPOCH — avoids pulling in a date/time crate
    /// just to format a value the frontend can turn into a Date() itself.
    pub timestamp: u64,
}

pub fn now_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
