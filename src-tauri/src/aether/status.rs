use super::profiles::{ConnectionProfile, EngineTorMode, ScanMode};
use crate::events::EngineTorStatus;
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream};
use std::time::Duration;

pub const DEFAULT_SOCKS_ADDR: &str = "127.0.0.1:1819";

pub fn parse_bind_address(addr: &str) -> SocketAddr {
    addr.parse()
        .unwrap_or_else(|_| DEFAULT_SOCKS_ADDR.parse().unwrap())
}

/// When Aether listens on 0.0.0.0, we probe 127.0.0.1 instead.
fn probe_addr(listen: &SocketAddr) -> SocketAddr {
    if listen.ip().is_unspecified() {
        SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), listen.port())
    } else {
        *listen
    }
}

/// Ground-truth "are we connected" signal: TCP connect to SOCKS5 port.
pub fn port_is_live(addr: &SocketAddr) -> bool {
    TcpStream::connect_timeout(&probe_addr(addr), Duration::from_millis(300)).is_ok()
}

/// The GUI's connect timeout must exceed Aether's own per-mode scan deadline
/// (`overall_deadline` in upstream v1.3.0 prober.rs / wg_prober.rs — MASQUE:
/// 45/120/300/180/180s, WireGuard: 30/80/250/150/180s) or it would kill
/// Aether while it's still legitimately scanning. Each value below is the
/// larger of the two probers' deadlines plus margin for tunnel establishment
/// and data-plane validation. Noize profiles don't factor in: their delays
/// are per-handshake milliseconds, and the scan deadline is a fixed
/// wall-clock cap upstream regardless of profile.
/// ponytail: WG retries up to 4 noize profiles back to back on failure, which
/// can legitimately exceed any sane timeout — this stays a backstop for the
/// common first-scan path, and the auto-retry policy below covers the rest.
pub fn connect_timeout(scan_mode: &ScanMode) -> Duration {
    Duration::from_secs(match scan_mode {
        ScanMode::Turbo => 90,
        ScanMode::Balanced => 150,
        ScanMode::Thorough => 330,
        ScanMode::Stealth => 210,
        ScanMode::Ironclad => 240,
    })
}

/// Mode-aware startup budget. Tor-only has no WARP scan but must bootstrap
/// arti (direct attempts, then bridge fallback — potentially several
/// minutes); reverse must bootstrap Tor before its WARP scan even starts.
/// The monitor keeps checking cancellation every tick throughout the budget.
pub fn startup_timeout(profile: &ConnectionProfile) -> Duration {
    // Tor budget: direct-attempt window + bridge/stall fallback, plus a
    // generous fixed margin; individual tuning env vars extend it 1:1.
    let tor_budget = Duration::from_secs(
        600 + u64::from(profile.engine_tor_direct_secs.unwrap_or(60))
            + u64::from(profile.engine_tor_stall_secs.unwrap_or(120)),
    );
    match profile.engine_tor_mode {
        EngineTorMode::TorOnly => tor_budget,
        EngineTorMode::TorReverse => tor_budget + connect_timeout(&profile.scan_mode),
        EngineTorMode::Disabled | EngineTorMode::Tor => connect_timeout(&profile.scan_mode),
    }
}

/// Which bind carries the separately-reported native Tor SOCKS endpoint.
/// Chain mode (`--tor`) only: WARP stays on the primary bind and arti gets a
/// second listener; the GUI must never route normal traffic or OS proxy
/// through it. Tor-only serves Tor on the primary bind (tracked by the main
/// connected status); reverse's Tor is internal to the primary tunnel.
/// Defaults to the engine's documented secondary port 1820.
pub fn secondary_tor_address(profile: &ConnectionProfile) -> Option<SocketAddr> {
    if profile.engine_tor_mode != EngineTorMode::Tor {
        return None;
    }
    profile
        .engine_tor_bind
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("127.0.0.1:1820")
        .parse()
        .ok()
}

/// Snapshot of the secondary endpoint for `aether://tor-status`. `probe`
/// does a real TCP connect (same ground-truth rule as the primary status).
pub fn secondary_tor_status(profile: &ConnectionProfile, probe: bool) -> EngineTorStatus {
    match secondary_tor_address(profile) {
        Some(address) => EngineTorStatus {
            enabled: true,
            ready: probe && port_is_live(&address),
            address: Some(probe_addr(&address).to_string()),
        },
        None => EngineTorStatus::default(),
    }
}

/// Current startup stage for progress feedback while the (possibly
/// Tor-extended) budget runs. Emitted to the log, not as a status change.
pub fn startup_stage(profile: &ConnectionProfile) -> &'static str {
    match profile.engine_tor_mode {
        EngineTorMode::TorOnly => "Waiting for native Tor bootstrap and the primary SOCKS listener (bridge fallback can take several minutes)",
        EngineTorMode::TorReverse => "Waiting for native Tor bootstrap, then the reverse tunnel's primary SOCKS listener (bridge fallback can take several minutes)",
        EngineTorMode::Tor | EngineTorMode::Disabled => {
            "Waiting for Aether's primary SOCKS listener"
        }
    }
}

/// How long to wait after sending Ctrl-C before force-killing. Manually
/// testing shutdown against the real binary showed it does NOT exit quickly
/// on SIGINT (still alive 10+ seconds later) — but since v1 never elevates
/// or opens a TUN device, there is nothing at the OS level a hard kill would
/// leave dangling, so a short grace period followed by SIGKILL is the
/// expected common path here, not a rare fallback.
pub const GRACEFUL_SHUTDOWN_GRACE: Duration = Duration::from_secs(3);

/// Auto-retry policy for unexpected drops/timeouts (never for a
/// user-requested disconnect) — applies uniformly to every protocol, since
/// a sudden mid-session drop (observed in practice with gool, the most
/// fragile of the three: two nested WireGuard tunnels) is exactly as
/// disruptive on MASQUE or plain WireGuard. Backoff increases per attempt
/// rather than retrying immediately, on the theory that whatever caused the
/// drop (a flaky relay, a momentary network hiccup) is more likely to have
/// cleared given a moment, and to avoid hammering the same dead endpoint.
pub const MAX_AUTO_RETRIES: u32 = 3;
pub const RETRY_BACKOFF: [Duration; MAX_AUTO_RETRIES as usize] = [
    Duration::from_secs(2),
    Duration::from_secs(5),
    Duration::from_secs(10),
];

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{TcpListener, TcpStream};
    use std::thread;

    #[test]
    fn parse_valid_and_invalid() {
        assert_eq!(
            parse_bind_address("127.0.0.1:1919"),
            "127.0.0.1:1919".parse().unwrap()
        );
        assert_eq!(
            parse_bind_address("0.0.0.0:1819"),
            "0.0.0.0:1819".parse().unwrap()
        );
        assert_eq!(
            parse_bind_address("0.0.0.0:9999"),
            "0.0.0.0:9999".parse().unwrap()
        );
        assert_eq!(
            parse_bind_address("127.0.0.1:"),
            DEFAULT_SOCKS_ADDR.parse().unwrap()
        );
        assert_eq!(
            parse_bind_address("not-an-addr"),
            DEFAULT_SOCKS_ADDR.parse().unwrap()
        );
    }

    #[test]
    fn probe_addr_rewrites_unspecified() {
        let any: SocketAddr = "0.0.0.0:1919".parse().unwrap();
        assert_eq!(probe_addr(&any), "127.0.0.1:1919".parse().unwrap());
        let loopback: SocketAddr = "127.0.0.1:1919".parse().unwrap();
        assert_eq!(probe_addr(&loopback), loopback);
    }

    #[test]
    fn port_is_live_detects_listener() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        thread::spawn(move || {
            let _ = listener.accept();
        });
        assert!(port_is_live(&addr));
        let dead: SocketAddr = format!("127.0.0.1:{}", addr.port().wrapping_add(1).max(20000))
            .parse()
            .unwrap();
        if TcpStream::connect_timeout(&dead, Duration::from_millis(50)).is_err() {
            assert!(!port_is_live(&dead));
        }
    }

    #[test]
    fn port_is_live_probes_loopback_when_bound_any() {
        let listener = TcpListener::bind("0.0.0.0:0").unwrap();
        let addr = listener.local_addr().unwrap();
        thread::spawn(move || {
            let _ = listener.accept();
        });
        let any = SocketAddr::new(IpAddr::V4(Ipv4Addr::UNSPECIFIED), addr.port());
        assert!(
            port_is_live(&any),
            "should probe 127.0.0.1 when listen is 0.0.0.0"
        );
    }

    #[test]
    fn connect_timeout_exceeds_upstream_scan_deadlines() {
        // Each right-hand value is the larger of upstream v1.3.0's MASQUE/WG
        // prober overall_deadline for that mode — the GUI must outlast it.
        assert!(connect_timeout(&ScanMode::Turbo) > Duration::from_secs(45));
        assert!(connect_timeout(&ScanMode::Balanced) > Duration::from_secs(120));
        assert!(connect_timeout(&ScanMode::Thorough) > Duration::from_secs(300));
        assert!(connect_timeout(&ScanMode::Stealth) > Duration::from_secs(180));
        assert!(connect_timeout(&ScanMode::Ironclad) > Duration::from_secs(180));
    }

    fn tor_profile(mode: EngineTorMode) -> ConnectionProfile {
        ConnectionProfile {
            engine_tor_mode: mode,
            ..ConnectionProfile::default()
        }
    }

    #[test]
    fn startup_timeout_is_mode_aware() {
        // Base = the plain scan budget of whatever scan mode the default
        // profile carries, so the equality holds regardless of the default.
        let base = connect_timeout(&tor_profile(EngineTorMode::Disabled).scan_mode);
        assert_eq!(startup_timeout(&tor_profile(EngineTorMode::Disabled)), base);
        // Chain keeps the plain scan deadline: the secondary listener is a
        // bonus endpoint, not a startup gate.
        assert_eq!(startup_timeout(&tor_profile(EngineTorMode::Tor)), base);
        assert!(startup_timeout(&tor_profile(EngineTorMode::TorOnly)) > base);
        // Reverse pays Tor bootstrap PLUS the full scan budget.
        assert!(
            startup_timeout(&tor_profile(EngineTorMode::TorReverse))
                > startup_timeout(&tor_profile(EngineTorMode::TorOnly))
        );
    }

    #[test]
    fn tor_tuning_extends_budget() {
        let mut p = tor_profile(EngineTorMode::TorOnly);
        let base = startup_timeout(&p);
        p.engine_tor_direct_secs = Some(120);
        p.engine_tor_stall_secs = Some(300);
        assert!(startup_timeout(&p) > base);
    }

    #[test]
    fn secondary_endpoint_is_chain_only() {
        assert_eq!(
            secondary_tor_address(&tor_profile(EngineTorMode::Disabled)),
            None
        );
        assert_eq!(
            secondary_tor_address(&tor_profile(EngineTorMode::TorReverse)),
            None
        );
        assert_eq!(
            secondary_tor_address(&tor_profile(EngineTorMode::TorOnly)),
            None
        );
        let chain = secondary_tor_address(&tor_profile(EngineTorMode::Tor)).unwrap();
        assert_eq!(chain, "127.0.0.1:1820".parse().unwrap());
    }

    #[test]
    fn secondary_endpoint_honors_bind_and_disables() {
        let mut p = tor_profile(EngineTorMode::Tor);
        p.engine_tor_bind = Some("127.0.0.1:1830".into());
        assert_eq!(
            secondary_tor_address(&p),
            Some("127.0.0.1:1830".parse().unwrap())
        );
        // Blank bind falls back to the default secondary port.
        p.engine_tor_bind = Some("   ".into());
        assert_eq!(
            secondary_tor_address(&p),
            Some("127.0.0.1:1820".parse().unwrap())
        );
        // Disabled mode always reports the inert default snapshot.
        p.engine_tor_mode = EngineTorMode::Disabled;
        assert_eq!(secondary_tor_status(&p, true), EngineTorStatus::default());
    }

    #[test]
    fn secondary_status_reports_live_listener() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let mut p = tor_profile(EngineTorMode::Tor);
        p.engine_tor_bind = Some(format!("127.0.0.1:{port}"));
        let status = secondary_tor_status(&p, true);
        assert!(status.enabled);
        assert!(status.ready, "listener is up, probe must succeed");
        assert_eq!(
            status.address.as_deref(),
            Some(format!("127.0.0.1:{port}").as_str()),
            "address must be a copyable host:port value"
        );
        // Unprobed snapshot: enabled with address, never claiming ready.
        let idle = secondary_tor_status(&p, false);
        assert!(idle.enabled && !idle.ready);
        std::thread::spawn(move || {
            let _ = listener.accept();
        });
    }
}
