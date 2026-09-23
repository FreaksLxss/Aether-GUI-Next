use super::profiles::{ConnectionProfile, EnginePsiphonMode, EngineTorMode, ScanMode};
use crate::events::EngineTorStatus;
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream};
use std::time::Duration;

pub const DEFAULT_SOCKS_ADDR: &str = "127.0.0.1:1819";

pub fn parse_bind_address(addr: &str) -> SocketAddr {
    addr.parse()
        .unwrap_or_else(|_| DEFAULT_SOCKS_ADDR.parse().unwrap())
}

fn probe_addr(listen: &SocketAddr) -> SocketAddr {
    if listen.ip().is_unspecified() {
        SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), listen.port())
    } else {
        *listen
    }
}

pub fn port_is_live(addr: &SocketAddr) -> bool {
    TcpStream::connect_timeout(&probe_addr(addr), Duration::from_millis(300)).is_ok()
}

pub fn connect_timeout(scan_mode: &ScanMode) -> Duration {
    Duration::from_secs(match scan_mode {
        ScanMode::Turbo => 90,
        ScanMode::Balanced => 150,
        ScanMode::Thorough => 330,
        ScanMode::Verified => 210,
        ScanMode::Ironclad => 240,
    })
}

pub fn startup_timeout(profile: &ConnectionProfile) -> Duration {
    let scan = connect_timeout(&profile.scan_mode);
    let tor_budget = Duration::from_secs(
        600 + u64::from(profile.engine_tor_direct_secs.unwrap_or(60))
            + u64::from(profile.engine_tor_stall_secs.unwrap_or(120)),
    );
    let tor = match profile.engine_tor_mode {
        EngineTorMode::TorOnly => tor_budget,
        EngineTorMode::TorReverse => tor_budget + scan,
        EngineTorMode::Disabled | EngineTorMode::Tor => Duration::ZERO,
    };
    let psiphon_budget = Duration::from_secs(300);
    let psiphon = match profile.engine_psiphon_mode {
        EnginePsiphonMode::PsiphonOnly => psiphon_budget,
        EnginePsiphonMode::PsiphonReverse => psiphon_budget + scan,
        EnginePsiphonMode::Disabled | EnginePsiphonMode::Psiphon => Duration::ZERO,
    };
    tor.max(psiphon).max(scan)
}

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

pub fn secondary_tor_status(profile: &ConnectionProfile, probe: bool) -> EngineTorStatus {
    match secondary_tor_address(profile) {
        Some(address) => {
            let live = crate::httpproxy::engine_tor_addr().unwrap_or(address);
            EngineTorStatus {
                enabled: true,
                ready: probe && port_is_live(&live),
                address: Some(probe_addr(&address).to_string()),
            }
        }
        None => EngineTorStatus::default(),
    }
}

pub fn secondary_psiphon_address(profile: &ConnectionProfile) -> Option<SocketAddr> {
    if profile.engine_psiphon_mode != EnginePsiphonMode::Psiphon {
        return None;
    }
    profile
        .engine_psiphon_bind
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("127.0.0.1:1821")
        .parse()
        .ok()
}

pub fn secondary_psiphon_status(profile: &ConnectionProfile, probe: bool) -> EngineTorStatus {
    match secondary_psiphon_address(profile) {
        Some(address) => {
            let live = crate::httpproxy::engine_psiphon_addr().unwrap_or(address);
            EngineTorStatus {
                enabled: true,
                ready: probe && port_is_live(&live),
                address: Some(probe_addr(&address).to_string()),
            }
        }
        None => EngineTorStatus::default(),
    }
}

pub fn startup_stage(profile: &ConnectionProfile) -> &'static str {
    match (
        &profile.engine_tor_mode,
        &profile.engine_psiphon_mode,
    ) {
        (_, EnginePsiphonMode::PsiphonOnly) => {
            "Waiting for Psiphon to hand a working route (can take a few minutes)"
        }
        (_, EnginePsiphonMode::PsiphonReverse) => {
            "Waiting for Psiphon bootstrap, then the reverse tunnel's primary SOCKS listener"
        }
        (EngineTorMode::TorOnly, _) => {
            "Waiting for native Tor bootstrap and the primary SOCKS listener (bridge fallback can take several minutes)"
        }
        (EngineTorMode::TorReverse, _) => {
            "Waiting for native Tor bootstrap, then the reverse tunnel's primary SOCKS listener (bridge fallback can take several minutes)"
        }
        (EngineTorMode::Tor | EngineTorMode::Disabled, _) => {
            "Waiting for Aether's primary SOCKS listener"
        }
    }
}

pub const GRACEFUL_SHUTDOWN_GRACE: Duration = Duration::from_secs(3);

pub const MAX_AUTO_RETRIES: u32 = 3;
pub const RETRY_BACKOFF: [Duration; MAX_AUTO_RETRIES as usize] = [
    Duration::from_secs(2),
    Duration::from_secs(5),
    Duration::from_secs(10),
];

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;
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
        let dead: SocketAddr = "127.0.0.1:0".parse().unwrap();
        assert!(!port_is_live(&dead));
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
        assert!(connect_timeout(&ScanMode::Turbo) > Duration::from_secs(45));
        assert!(connect_timeout(&ScanMode::Balanced) > Duration::from_secs(120));
        assert!(connect_timeout(&ScanMode::Thorough) > Duration::from_secs(300));
        assert!(connect_timeout(&ScanMode::Verified) > Duration::from_secs(180));
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
        let base = connect_timeout(&tor_profile(EngineTorMode::Disabled).scan_mode);
        assert_eq!(startup_timeout(&tor_profile(EngineTorMode::Disabled)), base);
        assert_eq!(startup_timeout(&tor_profile(EngineTorMode::Tor)), base);
        assert!(startup_timeout(&tor_profile(EngineTorMode::TorOnly)) > base);
        assert!(
            startup_timeout(&tor_profile(EngineTorMode::TorReverse))
                > startup_timeout(&tor_profile(EngineTorMode::TorOnly))
        );
        let psi = |m: EnginePsiphonMode| ConnectionProfile {
            engine_psiphon_mode: m,
            ..ConnectionProfile::default()
        };
        assert_eq!(startup_timeout(&psi(EnginePsiphonMode::Disabled)), base);
        assert_eq!(startup_timeout(&psi(EnginePsiphonMode::Psiphon)), base);
        assert!(startup_timeout(&psi(EnginePsiphonMode::PsiphonOnly)) > base);
        assert!(
            startup_timeout(&psi(EnginePsiphonMode::PsiphonReverse))
                > startup_timeout(&psi(EnginePsiphonMode::PsiphonOnly))
        );
    }

    #[test]
    fn secondary_psiphon_is_chain_only() {
        let psi = |m: EnginePsiphonMode| ConnectionProfile {
            engine_psiphon_mode: m,
            ..ConnectionProfile::default()
        };
        assert_eq!(
            secondary_psiphon_address(&psi(EnginePsiphonMode::Disabled)),
            None
        );
        assert_eq!(
            secondary_psiphon_address(&psi(EnginePsiphonMode::PsiphonReverse)),
            None
        );
        assert_eq!(
            secondary_psiphon_address(&psi(EnginePsiphonMode::PsiphonOnly)),
            None
        );
        let chain = secondary_psiphon_address(&psi(EnginePsiphonMode::Psiphon)).unwrap();
        assert_eq!(chain, "127.0.0.1:1821".parse().unwrap());
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
        p.engine_tor_bind = Some("   ".into());
        assert_eq!(
            secondary_tor_address(&p),
            Some("127.0.0.1:1820".parse().unwrap())
        );
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
        let idle = secondary_tor_status(&p, false);
        assert!(idle.enabled && !idle.ready);
        std::thread::spawn(move || {
            let _ = listener.accept();
        });
    }
}
