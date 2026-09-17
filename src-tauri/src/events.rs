use serde::Serialize;

pub const STATUS_EVENT: &str = "aether://status";
pub const LOG_EVENT: &str = "aether://log";
/// Native engine chain-Tor secondary listener readiness — `EngineTorStatus`.
/// Aether ≥2.0.0 chain mode (`--tor`) keeps the WARP listener on the primary
/// bind while arti serves a second SOCKS5 on its own bind; the GUI shows this
/// separately so a live WARP listener is never mistaken for a live Tor
/// listener. Reverse/only report readiness via the primary status — only-mode
/// serves plain Tor on the primary bind itself — and this event is unrelated
/// to the IP Changer's `ip-changer://status` Tor. Reset to the default
/// whenever the session stops/restarts.
pub const ENGINE_TOR_STATUS_EVENT: &str = "aether://tor-status";

#[derive(Serialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct EngineTorStatus {
    pub enabled: bool,
    pub ready: bool,
    pub address: Option<String>,
}

/// Live TUN/HTTP-proxy traffic counters — `TrafficStats`.
pub const TRAFFIC_EVENT: &str = "aether://traffic";
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
