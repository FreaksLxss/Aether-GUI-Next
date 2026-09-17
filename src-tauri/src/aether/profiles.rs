use serde::{Deserialize, Serialize};

/// How network traffic is captured and routed through the tunnel.
/// `Proxy` is the original behavior (Windows system proxy via registry).
/// `Tun` uses a wintun adapter to capture all IP-layer traffic.
/// `Both` enables system proxy and TUN simultaneously.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CaptureMode {
    Proxy,
    Tun,
    Both,
}

/// How DNS queries are resolved when TUN mode is active.
/// `Forward` routes DNS through the SOCKS5 proxy (UDP ASSOCIATE or TCP DNS).
/// `Direct` uses the system's default DNS resolver, bypassing the proxy.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DnsMode {
    Forward,
    Direct,
}

/// `Auto` resolves to Aether's own default (MASQUE). Aether's own `scan_mode`
/// already performs multi-route discovery internally (confirmed by manually
/// running the real binary), so Aether-GUI does not implement a client-side
/// protocol-fallback retry loop on top of this.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Protocol {
    Auto,
    Masque,
    Wireguard,
    Gool,
}

impl Protocol {
    /// The literal menu choice Aether expects at its "Protocol:" prompt.
    pub fn as_menu_choice(&self) -> &'static str {
        match self {
            Protocol::Auto | Protocol::Masque => "1",
            Protocol::Wireguard => "2",
            Protocol::Gool => "3",
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ScanMode {
    Turbo,
    Balanced,
    Thorough,
    Stealth,
    Ironclad,
}

impl ScanMode {
    pub fn as_menu_choice(&self) -> &'static str {
        match self {
            ScanMode::Turbo => "1",
            ScanMode::Balanced => "2",
            ScanMode::Thorough => "3",
            ScanMode::Stealth => "4",
            ScanMode::Ironclad => "5",
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum IpVersion {
    V4,
    V6,
    Both,
}

impl IpVersion {
    pub fn as_menu_choice(&self) -> &'static str {
        match self {
            IpVersion::V4 => "1",
            IpVersion::V6 => "2",
            IpVersion::Both => "3",
        }
    }
}

/// Obfuscation profile for MASQUE connections. The profile shapes how much
/// junk/padding Aether injects to disguise the handshake from DPI.
/// `Light` is Aether ≥1.6.0: a gentler profile for networks that only need a
/// nudge.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MasqueNoize {
    Firewall,
    Gfw,
    Light,
    Off,
}

impl MasqueNoize {
    pub fn as_flag(&self) -> &'static str {
        match self {
            MasqueNoize::Firewall => "firewall",
            MasqueNoize::Gfw => "gfw",
            MasqueNoize::Light => "light",
            MasqueNoize::Off => "off",
        }
    }
}

/// Obfuscation profile for WireGuard and gool connections.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum WgNoize {
    Balanced,
    Aggressive,
    Light,
    Off,
}

impl WgNoize {
    pub fn as_flag(&self) -> &'static str {
        match self {
            WgNoize::Balanced => "balanced",
            WgNoize::Aggressive => "aggressive",
            WgNoize::Light => "light",
            WgNoize::Off => "off",
        }
    }
}

/// Aether ≥1.4.0: log verbosity level passed via `--log-level`. Replaces the
/// old all-or-nothing `--verbose` flag. `--verbose` still works as a shortcut
/// for debug.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Error,
    Warn,
    Info,
    Debug,
    Trace,
}

impl LogLevel {
    pub fn as_flag(&self) -> &'static str {
        match self {
            LogLevel::Error => "error",
            LogLevel::Warn => "warn",
            LogLevel::Info => "info",
            LogLevel::Debug => "debug",
            LogLevel::Trace => "trace",
        }
    }
}

/// Aether ≥1.4.0: resource scaling override passed via `--perf`. When omitted,
/// Aether auto-detects CPU/RAM at startup and scales accordingly.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PerfLevel {
    Low,
    Medium,
    High,
}

impl PerfLevel {
    pub fn as_flag(&self) -> &'static str {
        match self {
            PerfLevel::Low => "low",
            PerfLevel::Medium => "medium",
            PerfLevel::High => "high",
        }
    }
}

/// Aether ≥2.0.0: built-in Tor (arti) mode. `Disabled` omits all `--tor*` flags.
/// Engine listens on 127.0.0.1:1819 (WARP) + 127.0.0.1:1820 (Tor) when chained —
///
/// **Isolation invariant:** this is the engine's arti Tor (port 1820, aether://* events,
/// profile.json) and is completely separate from `src-tauri/src/ip_changer.rs`
/// `TorManager` (ports 9050/9051, ip-changer://* events, settings.json). Never
/// import one into the other's module.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum EngineTorMode {
    #[default]
    Disabled,
    Tor,
    #[serde(rename = "tor-reverse", alias = "tor_reverse")]
    TorReverse,
    #[serde(rename = "tor-only", alias = "tor_only")]
    TorOnly,
}

impl EngineTorMode {
    pub fn as_flag(&self) -> Option<&'static str> {
        match self {
            EngineTorMode::Disabled => None,
            EngineTorMode::Tor => Some("--tor"),
            EngineTorMode::TorReverse => Some("--tor-reverse"),
            EngineTorMode::TorOnly => Some("--tor-only"),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct ConnectionProfile {
    pub protocol: Protocol,
    pub scan_mode: ScanMode,
    pub ip_version: IpVersion,
    /// Aether ≥1.1.1: reuse the last known-working gateway with a quick
    /// recheck instead of a full scan. `serde(default)` keeps profiles saved
    /// by older versions of this app loading cleanly.
    #[serde(default = "default_true")]
    pub quick_reconnect: bool,
    /// Aether ≥1.2.0: run the MASQUE tunnel over HTTP/2 (TCP) instead of the
    /// default HTTP/3 (QUIC) — for networks that block or throttle UDP.
    /// Passed as AETHER_MASQUE_HTTP2 in both directions to suppress prompts.
    /// Reverse Tor uses effective H2 without changing this saved preference.
    #[serde(default)]
    pub masque_http2: bool,
    /// Obfuscation profile for MASQUE (firewall/gfw/off). Passed as
    /// `--noize <value>`. Only sent when the active protocol is MASQUE-based.
    #[serde(default = "default_masque_noize")]
    pub masque_noize: MasqueNoize,
    /// Obfuscation profile for WireGuard/gool (balanced/aggressive/light/off).
    /// Only sent when the active protocol is WireGuard or gool.
    #[serde(default = "default_wg_noize")]
    pub wg_noize: WgNoize,
    /// Local SOCKS5 listen address (`--bind`). Aether defaults to
    /// 127.0.0.1:1819; users can change the port or bind to 0.0.0.0 for LAN.
    #[serde(default = "default_bind_address")]
    pub bind_address: String,
    /// Aether ≥1.6.0: local HTTP CONNECT proxy listen address
    /// (`--http-proxy`), exposed next to the SOCKS5 one for clients that
    /// can't speak SOCKS. `None` omits the flag (no HTTP proxy). Only
    /// forwarded when parseable, like `bind_address`.
    #[serde(default)]
    pub http_proxy_address: Option<String>,
    /// Aether ≥1.7.0: dial out through another proxy already on the machine
    /// (`--upstream`), chaining Aether behind e.g. a VPN or proxy app.
    /// Accepts socks5://host:port, http://host:port, or bare host:port
    /// (SOCKS5), with optional user:pass@ credentials. A SOCKS5 upstream
    /// with UDP associate carries every transport; an HTTP upstream only
    /// carries the MASQUE HTTP/2 carrier. `None`/empty omits the flag.
    #[serde(default)]
    pub upstream_proxy: Option<String>,
    /// Aether ≥1.9.0: manual WARP-in-WARP hop endpoints for gool
    /// (`--wiw-peers "outer:port,inner:port"`). Giving one hop lets the
    /// scan find the other; the port is required. `None`/empty omits the
    /// flag so both hops are scanned, which stays Aether's default. Only
    /// forwarded when the protocol is gool and every entry parses as a
    /// full host:port.
    #[serde(default)]
    pub wiw_peers: Option<String>,
    /// Aether ≥1.4.0: log verbosity. Passed as `--log-level <value>`.
    /// `info` stays quiet; `debug` adds tunnel internals; `trace` adds full
    /// per-packet detail. When `None`, the flag is omitted (Aether defaults
    /// to info).
    #[serde(default)]
    pub log_level: Option<LogLevel>,
    /// Aether ≥1.4.0: resource scaling override. Passed as `--perf <value>`.
    /// When `None`, Aether auto-detects CPU/RAM at startup and scales
    /// scan concurrency, socket buffers, and queue sizes accordingly.
    #[serde(default)]
    pub perf: Option<PerfLevel>,
    /// How traffic is captured: system proxy only, TUN adapter only, or both.
    #[serde(default = "default_capture_mode")]
    pub capture_mode: CaptureMode,
    /// How DNS is resolved when TUN mode is active.
    #[serde(default = "default_dns_mode")]
    pub dns_mode: DnsMode,
    /// TUN adapter IP address in CIDR notation (e.g. "10.0.0.2/24").
    #[serde(default = "default_tun_address")]
    pub tun_address: String,
    /// DNS server to use when TUN mode is active (e.g. "8.8.8.8").
    #[serde(default = "default_tun_dns")]
    pub tun_dns: String,
    /// Aether ≥1.5.0: resolvers used inside the tunnel (`--dns`), e.g.
    /// "1.1.1.1,1.0.0.1". When `None`, the flag is omitted (Aether defaults to
    /// 1.1.1.1,1.0.0.1).
    #[serde(default)]
    pub dns_servers: Option<String>,
    /// Aether ≥1.5.0: destinations refused outright (`--route-block`). An
    /// empty list omits the flag so the tunnel handles everything.
    #[serde(default)]
    pub route_block: Vec<String>,
    /// Aether ≥1.5.0: destinations sent straight out, bypassing the tunnel
    /// (`--route-direct`). An empty list omits the flag.
    #[serde(default)]
    pub route_direct: Vec<String>,
    /// Aether ≥1.7.0: sniff the TLS SNI / HTTP Host of each flow's first
    /// bytes so domain-based --route-block/--route-direct rules also match
    /// behind a TUN front end (which otherwise resolves names itself and
    /// hands the core only an address). Default on; `false` sets
    /// AETHER_ROUTE_SNIFF=0.
    #[serde(default = "default_true")]
    pub route_sniff: bool,
    /// Aether ≥1.7.0: how long to wait for the sniffed name, in ms
    /// (AETHER_ROUTE_SNIFF_MS). `None` omits the env var (Aether's default).
    #[serde(default)]
    pub route_sniff_ms: Option<u32>,
    /// Aether ≥1.7.0: when Cloudflare refuses the saved identity at startup,
    /// say so and register a fresh device automatically. Only an account-API
    /// rejection counts — being offline or rate-limited never discards a good
    /// identity. Default on; `false` sets AETHER_REPROVISION=0 (report only).
    #[serde(default = "default_true")]
    pub auto_reprovision: bool,
    /// Aether ≥1.5.0: Zero Trust organization team name (`--team`). When
    /// `None`, no Zero Trust enrolment is attempted.
    #[serde(default)]
    pub zt_team: Option<String>,
    /// Aether ≥1.5.0: Zero Trust enrolment email (`--access-email`) — Aether
    /// emails a one-time code and prompts for it.
    #[serde(default)]
    pub zt_access_email: Option<String>,
    /// Aether ≥1.5.0: Zero Trust service-token client id (`--access-id`) for
    /// headless enrolment.
    #[serde(default)]
    pub zt_access_id: Option<String>,
    /// Aether ≥1.5.0: Zero Trust service-token client secret
    /// (`--access-secret`) for headless enrolment.
    #[serde(default)]
    pub zt_access_secret: Option<String>,
    /// Aether ≥1.5.0: an enrolment token already obtained from
    /// https://<team>.cloudflareaccess.com/warp (`--access-token`).
    #[serde(default)]
    pub zt_access_token: Option<String>,
    /// Aether ≥1.5.0: route HTTP/HTTPS through the organization's Gateway
    /// proxy (`--gateway`).
    #[serde(default)]
    pub zt_gateway: bool,
    // ── Aether ≥2.0.0 ──────────────────────────────────────────────
    /// Two MASQUE hops (like gool for MASQUE). `--mim` flag, gated to Auto/Masque.
    #[serde(default)]
    pub mim: bool,
    /// `--mim-peers outer:port,inner:port` or `auto`. One hop alone OK (scan finds other).
    #[serde(default)]
    pub mim_peers: Option<String>,
    /// QUIC v2 opener probe before HTTP/3. Default on; false emits `--no-quic-v2` / AETHER_QUIC_V2=0. Ignored when MASQUE uses H2.
    #[serde(default = "default_true")]
    pub quic_v2: bool,
    /// Firewall mark (`--mark`/`AETHER_MARK`) — Linux/Android only, SO_MARK, needs CAP_NET_ADMIN. Decimal or 0x hex.
    #[serde(default)]
    pub fw_mark: Option<String>,
    /// Built-in Tor (arti) mode. Disabled omits all --tor* flags. See EngineTorMode doc.
    #[serde(default)]
    pub engine_tor_mode: EngineTorMode,
    #[serde(default)]
    pub engine_tor_bind: Option<String>,
    #[serde(default)]
    pub engine_tor_dir: Option<String>,
    #[serde(default)]
    pub engine_tor_bridges: Vec<String>,
    /// Force automatic bridges immediately (`--tor-bridges`, no value).
    #[serde(default)]
    pub engine_tor_force_bridges: bool,
    /// Legacy unsupported path. Retained only to report an explicit migration error.
    /// Never read this path or forward it to the engine.
    #[serde(default)]
    pub engine_tor_bridges_file: Option<String>,
    #[serde(default)]
    pub engine_tor_no_bridges: bool,
    #[serde(default)]
    pub engine_tor_pt: Option<String>,
    #[serde(default)]
    pub engine_tor_pt_dir: Option<String>,
    #[serde(default)]
    pub engine_tor_country: Option<String>,
    #[serde(default)]
    pub engine_tor_direct_secs: Option<u32>,
    #[serde(default)]
    pub engine_tor_stall_secs: Option<u32>,
    // Env-only proxy tuning (no flag)
    #[serde(default)]
    pub max_clients: Option<u32>,
    #[serde(default)]
    pub half_close_secs: Option<u32>,
    #[serde(default)]
    pub tcp_keepalive_secs: Option<u32>,
    #[serde(default)]
    pub tcp_connect_secs: Option<u32>,
}

fn default_true() -> bool {
    true
}

fn default_masque_noize() -> MasqueNoize {
    MasqueNoize::Firewall
}

fn default_wg_noize() -> WgNoize {
    WgNoize::Balanced
}

fn default_bind_address() -> String {
    "127.0.0.1:1819".into()
}

fn default_capture_mode() -> CaptureMode {
    CaptureMode::Proxy
}

fn default_dns_mode() -> DnsMode {
    DnsMode::Forward
}

fn default_tun_address() -> String {
    "10.0.0.2/24".into()
}

fn default_tun_dns() -> String {
    "8.8.8.8".into()
}

impl ConnectionProfile {
    /// CLI flags for Aether ≥1.1.1 — the whole profile is passed up front so
    /// the interactive prompts never appear (the PTY prompt-answering in
    /// pty.rs stays as a fallback). One of the two quick-reconnect flags is
    /// ALWAYS passed: without either, 1.1.1 asks its own interactive
    /// "reconnect with last gateway?" question, which the GUI must never
    /// leave unanswered.
    pub fn as_args(&self) -> Vec<String> {
        let mut args = Vec::with_capacity(24);
        match self.protocol {
            Protocol::Auto => {}
            Protocol::Masque => args.push("--masque".into()),
            Protocol::Wireguard => args.push("--wg".into()),
            Protocol::Gool => args.push("--gool".into()),
        }
        args.push(match self.scan_mode {
            ScanMode::Turbo => "--turbo".into(),
            ScanMode::Balanced => "--balanced".into(),
            ScanMode::Thorough => "--thorough".into(),
            ScanMode::Stealth => "--stealth".into(),
            ScanMode::Ironclad => "--ironclad".into(),
        });
        args.push(match self.ip_version {
            IpVersion::V4 => "-4".into(),
            IpVersion::V6 => "-6".into(),
            IpVersion::Both => "--dual".into(),
        });
        args.push(if self.quick_reconnect {
            "--quick-reconnect".into()
        } else {
            "--no-quick-reconnect".into()
        });
        // Noize profile — pick the value matching the active protocol family.
        args.push("--noize".into());
        args.push(
            match self.protocol {
                Protocol::Auto | Protocol::Masque => self.masque_noize.as_flag(),
                Protocol::Wireguard | Protocol::Gool => self.wg_noize.as_flag(),
            }
            .into(),
        );
        // Only forward --bind when non-default and parseable.
        if self.bind_address.trim() != default_bind_address()
            && socket_address(&self.bind_address, "bind_address").is_ok()
        {
            args.push("--bind".into());
            args.push(self.bind_address.trim().into());
        }
        // Aether ≥1.6.0: HTTP CONNECT proxy next to the SOCKS5 one. Only
        // forwarded when parseable, so a half-typed address can't reach the
        // binary as a mangled flag.
        if let Some(ref addr) = self.http_proxy_address {
            if !addr.trim().is_empty() && socket_address(addr, "http_proxy_address").is_ok() {
                args.push("--http-proxy".into());
                args.push(addr.trim().into());
            }
        }
        // Aether ≥1.7.0: upstream proxy chaining. The value is scheme+URL
        // shaped (socks5://user:pass@host:port, http://host:port, host:port),
        // so unlike --bind it can't be SocketAddr-validated — only forwarded
        // when non-whitespace.
        if let Some(ref up) = self.upstream_proxy {
            let up = up.trim();
            if !up.is_empty() {
                args.push("--upstream".into());
                args.push(up.into());
            }
        }
        // Aether ≥1.9.0: manual WARP-in-WARP endpoints, gool only. One hop
        // may be given alone (the scan finds the other); every entry must
        // carry a port (SocketAddr parsing enforces it) or the flag is
        // dropped whole, mirroring the --bind/--http-proxy guardrails.
        if self.protocol == Protocol::Gool {
            if let Some(ref wiw) = self.wiw_peers {
                let entries: Vec<&str> = wiw
                    .split(',')
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .collect();
                if !wiw.trim().is_empty() && peer_list(wiw, "wiw_peers").is_ok() {
                    args.push("--wiw-peers".into());
                    args.push(entries.join(","));
                }
            }
        }
        // Aether ≥1.4.0: log level override.
        if let Some(ref level) = self.log_level {
            args.push("--log-level".into());
            args.push(level.as_flag().into());
        }
        // Aether ≥1.4.0: resource scaling override.
        if let Some(ref perf) = self.perf {
            args.push("--perf".into());
            args.push(perf.as_flag().into());
        }
        // Aether ≥1.5.0: in-tunnel DNS resolvers.
        if let Some(ref dns) = self.dns_servers {
            if !dns.trim().is_empty() {
                args.push("--dns".into());
                args.push(dns.trim().into());
            }
        }
        // Aether ≥1.5.0: routing rules. Entries are joined with commas, which
        // is the same list syntax Aether's --route-block/--route-direct accept
        // (comma or newline separated).
        if !self.route_block.is_empty() {
            args.push("--route-block".into());
            args.push(self.route_block.join(","));
        }
        if !self.route_direct.is_empty() {
            args.push("--route-direct".into());
            args.push(self.route_direct.join(","));
        }
        // Aether ≥1.5.0: Zero Trust (WARP for organizations) enrolment.
        if let Some(ref team) = self.zt_team {
            if !team.trim().is_empty() {
                args.push("--team".into());
                args.push(team.trim().into());
            }
        }
        if let Some(ref id) = self.zt_access_id {
            if !id.trim().is_empty() {
                args.push("--access-id".into());
                args.push(id.trim().into());
            }
        }
        if let Some(ref secret) = self.zt_access_secret {
            if !secret.trim().is_empty() {
                args.push("--access-secret".into());
                args.push(secret.trim().into());
            }
        }
        if let Some(ref email) = self.zt_access_email {
            if !email.trim().is_empty() {
                args.push("--access-email".into());
                args.push(email.trim().into());
            }
        }
        if let Some(ref token) = self.zt_access_token {
            if !token.trim().is_empty() {
                args.push("--access-token".into());
                args.push(token.trim().into());
            }
        }
        if self.zt_gateway {
            args.push("--gateway".into());
        }
        // ── Aether ≥2.0.0 ─────────────────────────────────────
        // MASQUE-in-MASQUE: gated to Auto/Masque, like wiw_peers is gool-only.
        if self.mim && matches!(self.protocol, Protocol::Auto | Protocol::Masque) {
            args.push("--mim".into());
            if let Some(ref peers) = self.mim_peers {
                let v = peers.trim();
                if !v.is_empty() {
                    if v.eq_ignore_ascii_case("auto") {
                        args.push("--mim-peers".into());
                        args.push("auto".into());
                    } else {
                        let entries: Vec<&str> = v
                            .split(',')
                            .map(str::trim)
                            .filter(|s| !s.is_empty())
                            .collect();
                        if peer_list(v, "mim_peers").is_ok() {
                            args.push("--mim-peers".into());
                            args.push(entries.join(","));
                        }
                    }
                }
            }
        }
        // QUIC v2: default on, omitted when true; false emits --no-quic-v2. Skipped when H2 (TCP) active.
        if !self.quic_v2
            && !self.masque_http2
            && matches!(self.protocol, Protocol::Auto | Protocol::Masque)
            && !matches!(
                self.engine_tor_mode,
                EngineTorMode::TorReverse | EngineTorMode::TorOnly
            )
        {
            args.push("--no-quic-v2".into());
        }
        // --mark: Linux/Android only.
        #[cfg(any(target_os = "linux", target_os = "android"))]
        {
            if let Some(ref m) = self.fw_mark {
                let t = m.trim();
                if !t.is_empty() && validate_mark(t).is_ok() {
                    args.push("--mark".into());
                    args.push(t.into());
                }
            }
        }
        // Built-in Tor (arti) — isolated from ip_changer Tor (9050).
        if let Some(flag) = self.engine_tor_mode.as_flag() {
            args.push(flag.into());
            if let Some(ref b) = self.engine_tor_bind {
                let t = b.trim();
                if self.engine_tor_mode != EngineTorMode::TorOnly
                    && !t.is_empty()
                    && t.parse::<std::net::SocketAddr>().is_ok()
                {
                    args.push("--tor-bind".into());
                    args.push(t.into());
                }
            }
            if let Some(ref d) = self.engine_tor_dir {
                let t = d.trim();
                if !t.is_empty() {
                    args.push("--tor-dir".into());
                    args.push(t.into());
                }
            }
            for bridge in &self.engine_tor_bridges {
                let t = bridge.trim();
                if !t.is_empty() {
                    args.push("--tor-bridge".into());
                    args.push(t.into());
                }
            }
            if self.engine_tor_force_bridges {
                args.push("--tor-bridges".into());
            }
            if self.engine_tor_no_bridges {
                args.push("--no-tor-bridges".into());
            }
            if let Some(ref pt) = self.engine_tor_pt {
                let t = pt.trim();
                if !t.is_empty() {
                    args.push("--tor-pt".into());
                    args.push(t.into());
                }
            }
            if let Some(ref d) = self.engine_tor_pt_dir {
                let t = d.trim();
                if !t.is_empty() {
                    args.push("--tor-pt-dir".into());
                    args.push(t.into());
                }
            }
        }
        args
    }

    /// Environment variables shared by the desktop PTY spawn and the Android
    /// pipe spawn — one source of truth so the two platforms can't drift.
    /// Absent keys mean "use Aether's default" for every variable here.
    pub fn environment(&self) -> Vec<(String, String)> {
        let mut env: Vec<(String, String)> = Vec::new();
        let mut set = |k: &str, v: String| {
            if !env.iter().any(|(existing, _)| existing == k) {
                env.push((k.to_string(), v));
            }
        };
        // Aether ≥1.2.0 "MASQUE transport" prompt suppressor; truthy = HTTP/2.
        set(
            "AETHER_MASQUE_HTTP2",
            if self.masque_http2 { "1" } else { "0" }.to_string(),
        );
        // Aether ≥1.7.0 opt-outs — only set when the user turned the behavior
        // off or overrode its timing.
        if !self.route_sniff {
            set("AETHER_ROUTE_SNIFF", "0".into());
        }
        if let Some(ms) = self.route_sniff_ms {
            set("AETHER_ROUTE_SNIFF_MS", ms.to_string());
        }
        if !self.auto_reprovision {
            set("AETHER_REPROVISION", "0".into());
        }
        // Aether ≥2.0.0 — QUIC v2, fw mark, proxy tuning, engine Tor tuning.
        if !self.quic_v2 {
            set("AETHER_QUIC_V2", "0".into());
        }
        if let Some(ref m) = self.fw_mark {
            let t = m.trim();
            if !t.is_empty() {
                set("AETHER_MARK", t.to_string());
            }
        }
        if let Some(v) = self.max_clients {
            set("AETHER_MAX_CLIENTS", v.to_string());
        }
        if let Some(v) = self.half_close_secs {
            set("AETHER_HALF_CLOSE_SECS", v.to_string());
        }
        if let Some(v) = self.tcp_keepalive_secs {
            set("AETHER_TCP_KEEPALIVE_SECS", v.to_string());
        }
        if let Some(v) = self.tcp_connect_secs {
            set("AETHER_TCP_CONNECT_SECS", v.to_string());
        }
        if self.engine_tor_mode != EngineTorMode::Disabled {
            if let Some(ref cc) = self.engine_tor_country {
                let t = cc.trim();
                if !t.is_empty() {
                    set("AETHER_TOR_COUNTRY", t.to_string());
                }
            }
            if let Some(v) = self.engine_tor_direct_secs {
                set("AETHER_TOR_DIRECT_SECS", v.to_string());
            }
            if let Some(v) = self.engine_tor_stall_secs {
                set("AETHER_TOR_STALL_SECS", v.to_string());
            }
        }
        env
    }
}

#[cfg(any(target_os = "linux", target_os = "android", test))]
fn validate_mark(s: &str) -> Result<u32, String> {
    let t = s.trim();
    if t.is_empty() {
        return Err("empty mark".into());
    }
    if let Some(hex) = t.strip_prefix("0x").or_else(|| t.strip_prefix("0X")) {
        u32::from_str_radix(hex, 16).map_err(|_| format!("invalid fw_mark hex: {s}"))
    } else {
        t.parse::<u32>()
            .map_err(|_| format!("invalid fw_mark: {s}"))
    }
}

impl Default for ConnectionProfile {
    fn default() -> Self {
        // Mirrors Aether's own defaults.
        Self {
            protocol: Protocol::Auto,
            // GUI default: fast first-connect (Aether's own default is
            // Balanced; users can pick a slower, stealthier mode anytime).
            scan_mode: ScanMode::Turbo,
            ip_version: IpVersion::V4,
            quick_reconnect: true,
            masque_http2: false,
            masque_noize: MasqueNoize::Firewall,
            wg_noize: WgNoize::Balanced,
            bind_address: default_bind_address(),
            http_proxy_address: None,
            upstream_proxy: None,
            wiw_peers: None,
            log_level: None,
            perf: None,
            capture_mode: CaptureMode::Proxy,
            dns_mode: DnsMode::Forward,
            tun_address: default_tun_address(),
            tun_dns: default_tun_dns(),
            dns_servers: None,
            route_block: Vec::new(),
            route_direct: Vec::new(),
            route_sniff: true,
            route_sniff_ms: None,
            auto_reprovision: true,
            zt_team: None,
            zt_access_email: None,
            zt_access_id: None,
            zt_access_secret: None,
            zt_access_token: None,
            zt_gateway: false,
            mim: false,
            mim_peers: None,
            quic_v2: true,
            fw_mark: None,
            engine_tor_mode: EngineTorMode::Disabled,
            engine_tor_bind: None,
            engine_tor_dir: None,
            engine_tor_bridges: Vec::new(),
            engine_tor_force_bridges: false,
            engine_tor_bridges_file: None,
            engine_tor_no_bridges: false,
            engine_tor_pt: None,
            engine_tor_pt_dir: None,
            engine_tor_country: None,
            engine_tor_direct_secs: None,
            engine_tor_stall_secs: None,
            max_clients: None,
            half_close_secs: None,
            tcp_keepalive_secs: None,
            tcp_connect_secs: None,
        }
    }
}

const STORE_FILE: &str = "profile.json";
const STORE_KEY: &str = "last_successful_profile";

/// Loads the last profile that reached `Connected`, or the hardcoded default
/// on first run. Only ever written by `save()` at the moment a connection
/// actually succeeds (see aether/mod.rs) — never on a mere attempt, so a bad
/// guess can't poison future one-click connects.
pub fn load(app: &tauri::AppHandle) -> ConnectionProfile {
    use tauri_plugin_store::StoreExt;
    app.store(STORE_FILE)
        .ok()
        .and_then(|s| s.get(STORE_KEY))
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

fn socket_address(value: &str, field: &str) -> Result<std::net::SocketAddr, String> {
    let addr = value
        .trim()
        .parse::<std::net::SocketAddr>()
        .map_err(|_| format!("{field}: use a numeric IP:port (bracket IPv6), port 1–65535"))?;
    // Zone IDs are not accepted by the frontend numeric-address contract.
    if addr.port() == 0 || value.contains('%') {
        return Err(format!(
            "{field}: use a numeric IP:port (bracket IPv6), port 1–65535"
        ));
    }
    Ok(addr)
}

fn peer_list(value: &str, field: &str) -> Result<(), String> {
    let entries = value.split(',').map(str::trim).collect::<Vec<_>>();
    if entries.is_empty() || entries.len() > 2 {
        return Err(format!(
            "{field}: provide at most two distinct numeric IP:port endpoints"
        ));
    }
    let mut ips = Vec::new();
    for entry in entries {
        let ip = socket_address(entry, field)?.ip().to_canonical();
        if ips.contains(&ip) {
            return Err(format!(
                "{field}: the two hops must use different IP addresses"
            ));
        }
        ips.push(ip);
    }
    Ok(())
}

fn listeners_collide(a: std::net::SocketAddr, b: std::net::SocketAddr) -> bool {
    let (a_ip, b_ip) = (a.ip().to_canonical(), b.ip().to_canonical());
    a.port() == b.port()
        && (a_ip == b_ip
        || (a_ip.is_ipv4() == b_ip.is_ipv4() && (a_ip.is_unspecified() || b_ip.is_unspecified()))
        // IPv6 wildcard listeners may also claim IPv4 on dual-stack systems.
        || a.ip() == std::net::Ipv6Addr::UNSPECIFIED
        || b.ip() == std::net::Ipv6Addr::UNSPECIFIED)
}

pub fn validate(p: &ConnectionProfile) -> Result<(), String> {
    use std::net::IpAddr;
    if p.engine_tor_bridges_file
        .as_deref()
        .is_some_and(|s| !s.trim().is_empty())
    {
        return Err("Legacy Tor bridges-file setting is unsupported. Paste bridge lines into Manual bridges, then clear the legacy file setting. No file has been read.".into());
    }
    let mut listeners = vec![(
        "bind_address",
        socket_address(&p.bind_address, "bind_address")?,
    )];
    if let Some(a) = p
        .http_proxy_address
        .as_deref()
        .filter(|s| !s.trim().is_empty())
    {
        listeners.push((
            "http_proxy_address",
            socket_address(a, "http_proxy_address")?,
        ));
    }
    if matches!(
        p.engine_tor_mode,
        EngineTorMode::Tor | EngineTorMode::TorReverse
    ) {
        let bind = p
            .engine_tor_bind
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or("127.0.0.1:1820");
        listeners.push(("engine_tor_bind", socket_address(bind, "engine_tor_bind")?));
    }
    for (i, (name, addr)) in listeners.iter().enumerate() {
        for (other_name, other) in &listeners[..i] {
            if listeners_collide(*addr, *other) {
                return Err(format!(
                    "{name} conflicts with {other_name}; choose separate listener addresses/ports"
                ));
            }
        }
    }
    if p.engine_tor_mode == EngineTorMode::TorReverse
        && matches!(p.protocol, Protocol::Wireguard | Protocol::Gool)
    {
        return Err(
            "tor-reverse requires MASQUE (forces HTTP/2, incompatible with WireGuard/gool)".into(),
        );
    }
    let warp_active = p.engine_tor_mode != EngineTorMode::TorOnly;
    if warp_active && p.protocol == Protocol::Gool {
        if let Some(w) = p.wiw_peers.as_deref().filter(|s| !s.trim().is_empty()) {
            peer_list(w, "wiw_peers")?;
        }
    }
    if warp_active && p.mim && matches!(p.protocol, Protocol::Auto | Protocol::Masque) {
        if let Some(m) = p
            .mim_peers
            .as_deref()
            .filter(|s| !s.trim().is_empty() && !s.trim().eq_ignore_ascii_case("auto"))
        {
            peer_list(m, "mim_peers")?;
        }
    }
    if p.capture_mode != CaptureMode::Proxy {
        let (ip, prefix) = p
            .tun_address
            .split_once('/')
            .ok_or("tun_address: use IP/prefix")?;
        let ip = ip
            .parse::<IpAddr>()
            .map_err(|_| "tun_address: invalid IP")?;
        let prefix = prefix
            .parse::<u8>()
            .map_err(|_| "tun_address: invalid prefix")?;
        if prefix > if ip.is_ipv4() { 32 } else { 128 } {
            return Err("tun_address: invalid prefix".into());
        }
        p.tun_dns
            .parse::<IpAddr>()
            .map_err(|_| "tun_dns: invalid IP")?;
    }
    if p.route_sniff && p.route_sniff_ms.is_some_and(|n| n > 10_000) {
        return Err("route_sniff_ms: must be an integer from 0 to 10000".into());
    }
    #[cfg(any(target_os = "linux", target_os = "android"))]
    if let Some(mark) = p.fw_mark.as_deref().filter(|s| !s.trim().is_empty()) {
        validate_mark(mark)?;
    }
    if p.engine_tor_mode != EngineTorMode::Disabled {
        let manual = p.engine_tor_bridges.iter().any(|s| !s.trim().is_empty());
        if (p.engine_tor_force_bridges && (manual || p.engine_tor_no_bridges))
            || (manual && p.engine_tor_no_bridges)
        {
            return Err("Tor bridge policies conflict: choose automatic fallback, force automatic, manual lines, or disabled".into());
        }
        if let Some(country) = p
            .engine_tor_country
            .as_deref()
            .filter(|s| !s.trim().is_empty())
        {
            if country.trim().len() != 2 || !country.trim().bytes().all(|b| b.is_ascii_alphabetic())
            {
                return Err("engine_tor_country: use a two-letter country code".into());
            }
        }
    }
    // All tuning fields deserialize as u32: fractional, negative and overflowing
    // JSON values are rejected by serde. Zero remains valid (upstream accepts it).
    Ok(())
}

pub fn save(app: &tauri::AppHandle, profile: &ConnectionProfile) {
    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app.store(STORE_FILE) {
        if let Ok(value) = serde_json::to_value(profile) {
            store.set(STORE_KEY, value);
            let _ = store.save();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_omits_bind_flag() {
        let p = ConnectionProfile::default();
        let args = p.as_args();
        assert!(!args.iter().any(|a| a == "--bind"), "args={args:?}");
    }

    #[test]
    fn custom_port_emits_bind() {
        let p = ConnectionProfile {
            bind_address: "127.0.0.1:1919".into(),
            ..ConnectionProfile::default()
        };
        let args = p.as_args();
        let i = args
            .iter()
            .position(|a| a == "--bind")
            .expect("missing --bind");
        assert_eq!(args.get(i + 1).map(String::as_str), Some("127.0.0.1:1919"));
    }

    #[test]
    fn lan_bind_emits_bind() {
        let p = ConnectionProfile {
            bind_address: "0.0.0.0:1819".into(),
            ..ConnectionProfile::default()
        };
        let args = p.as_args();
        let i = args
            .iter()
            .position(|a| a == "--bind")
            .expect("missing --bind");
        assert_eq!(args.get(i + 1).map(String::as_str), Some("0.0.0.0:1819"));
    }

    #[test]
    fn lan_with_custom_port_emits_bind() {
        let p = ConnectionProfile {
            bind_address: "0.0.0.0:9999".into(),
            ..ConnectionProfile::default()
        };
        let args = p.as_args();
        let i = args
            .iter()
            .position(|a| a == "--bind")
            .expect("missing --bind");
        assert_eq!(args.get(i + 1).map(String::as_str), Some("0.0.0.0:9999"));
    }

    #[test]
    fn invalid_bind_is_not_forwarded() {
        let p = ConnectionProfile {
            bind_address: "127.0.0.1:".into(),
            ..ConnectionProfile::default()
        };
        let args = p.as_args();
        assert!(!args.iter().any(|a| a == "--bind"), "args={args:?}");
    }

    #[test]
    fn old_profile_json_gets_defaults() {
        let json = r#"{"protocol":"auto","scan_mode":"balanced","ip_version":"v4","quick_reconnect":true,"masque_http2":false}"#;
        let p: ConnectionProfile = serde_json::from_str(json).unwrap();
        assert_eq!(p.bind_address, "127.0.0.1:1819");
        assert_eq!(p.masque_noize, MasqueNoize::Firewall);
        // New TUN fields get defaults when absent from old profiles
        assert_eq!(p.capture_mode, CaptureMode::Proxy);
        assert_eq!(p.dns_mode, DnsMode::Forward);
        assert_eq!(p.tun_address, "10.0.0.2/24");
        assert_eq!(p.tun_dns, "8.8.8.8");
        // Aether ≥1.7.0 opt-outs default to the core's own behavior
        assert!(p.route_sniff);
        assert!(p.auto_reprovision);
        assert_eq!(p.route_sniff_ms, None);
    }

    #[test]
    fn default_omits_v15_flags() {
        let p = ConnectionProfile::default();
        let args = p.as_args();
        for flag in [
            "--dns",
            "--route-block",
            "--route-direct",
            "--team",
            "--access-id",
            "--access-secret",
            "--access-email",
            "--access-token",
            "--gateway",
            "--http-proxy",
        ] {
            assert!(
                !args.iter().any(|a| a == flag),
                "unexpected {flag} in {args:?}"
            );
        }
    }

    #[test]
    fn v15_flags_emitted_when_set() {
        let mut p = ConnectionProfile {
            dns_servers: Some("1.1.1.1,1.0.0.1".into()),
            ..ConnectionProfile::default()
        };
        p.route_block = vec!["blocked.example".into(), "10.0.0.0/8".into()];
        p.route_direct = vec!["full:bank.example".into()];
        p.zt_team = Some("my-org".into());
        p.zt_access_email = Some("me@example.com".into());
        p.zt_gateway = true;
        let args = p.as_args();

        let get = |flag: &str| -> Option<String> {
            args.iter()
                .position(|a| a == flag)
                .map(|i| args[i + 1].clone())
        };
        assert_eq!(get("--dns").as_deref(), Some("1.1.1.1,1.0.0.1"));
        assert_eq!(
            get("--route-block").as_deref(),
            Some("blocked.example,10.0.0.0/8")
        );
        assert_eq!(get("--route-direct").as_deref(), Some("full:bank.example"));
        assert_eq!(get("--team").as_deref(), Some("my-org"));
        assert_eq!(get("--access-email").as_deref(), Some("me@example.com"));
        assert!(args.iter().any(|a| a == "--gateway"));
    }

    #[test]
    fn default_emits_noize() {
        let p = ConnectionProfile::default();
        let args = p.as_args();
        let i = args
            .iter()
            .position(|a| a == "--noize")
            .expect("missing --noize");
        assert_eq!(args.get(i + 1).map(String::as_str), Some("firewall"));
    }

    #[test]
    fn valid_http_proxy_emits_flag() {
        let p = ConnectionProfile {
            http_proxy_address: Some("127.0.0.1:1818".into()),
            ..ConnectionProfile::default()
        };
        let args = p.as_args();
        let i = args
            .iter()
            .position(|a| a == "--http-proxy")
            .expect("missing --http-proxy");
        assert_eq!(args.get(i + 1).map(String::as_str), Some("127.0.0.1:1818"));
    }

    #[test]
    fn invalid_http_proxy_is_not_forwarded() {
        let p = ConnectionProfile {
            http_proxy_address: Some("127.0.0.1:".into()),
            ..ConnectionProfile::default()
        };
        let args = p.as_args();
        assert!(!args.iter().any(|a| a == "--http-proxy"), "args={args:?}");
    }

    #[test]
    fn default_omits_upstream() {
        let p = ConnectionProfile::default();
        assert!(!p.as_args().iter().any(|a| a == "--upstream"));
    }

    #[test]
    fn empty_upstream_is_not_forwarded() {
        let p = ConnectionProfile {
            upstream_proxy: Some("   ".into()),
            ..ConnectionProfile::default()
        };
        let args = p.as_args();
        assert!(!args.iter().any(|a| a == "--upstream"), "args={args:?}");
    }

    #[test]
    fn socks_upstream_emits_flag_with_credentials() {
        for v in [
            "socks5://127.0.0.1:1080",
            "socks5://user:pass@127.0.0.1:1080",
            "http://proxy.example:8080",
            "192.168.1.10:1080",
        ] {
            let p = ConnectionProfile {
                upstream_proxy: Some(v.into()),
                ..ConnectionProfile::default()
            };
            let args = p.as_args();
            let i = args
                .iter()
                .position(|a| a == "--upstream")
                .unwrap_or_else(|| panic!("missing --upstream for {v} in {:?}", args));
            assert_eq!(args.get(i + 1).map(String::as_str), Some(v));
        }
    }

    #[test]
    fn default_omits_wiw_peers() {
        let p = ConnectionProfile::default();
        assert!(!p.as_args().iter().any(|a| a == "--wiw-peers"));
    }

    #[test]
    fn wiw_peers_only_for_gool() {
        for proto in [Protocol::Auto, Protocol::Masque, Protocol::Wireguard] {
            let mut p = ConnectionProfile {
                protocol: proto.clone(),
                ..ConnectionProfile::default()
            };
            p.wiw_peers = Some("162.159.192.1:2408".into());
            assert!(
                !p.as_args().iter().any(|a| a == "--wiw-peers"),
                "emitted for {proto:?}"
            );
        }
    }

    #[test]
    fn gool_wiw_peers_emitted_and_normalized() {
        let mut p = ConnectionProfile {
            protocol: Protocol::Gool,
            ..ConnectionProfile::default()
        };
        p.wiw_peers = Some(" 162.159.192.1:2408, 188.114.96.1:2408 ".into());
        let args = p.as_args();
        let i = args
            .iter()
            .position(|a| a == "--wiw-peers")
            .expect("missing --wiw-peers");
        assert_eq!(
            args.get(i + 1).map(String::as_str),
            Some("162.159.192.1:2408,188.114.96.1:2408")
        );
    }

    #[test]
    fn gool_single_wiw_hop_emitted() {
        let mut p = ConnectionProfile {
            protocol: Protocol::Gool,
            ..ConnectionProfile::default()
        };
        p.wiw_peers = Some("162.159.192.1:2408".into());
        let args = p.as_args();
        let i = args
            .iter()
            .position(|a| a == "--wiw-peers")
            .expect("missing --wiw-peers");
        assert_eq!(
            args.get(i + 1).map(String::as_str),
            Some("162.159.192.1:2408")
        );
    }

    #[test]
    fn gool_wiw_peer_without_port_is_dropped() {
        let mut p = ConnectionProfile {
            protocol: Protocol::Gool,
            ..ConnectionProfile::default()
        };
        p.wiw_peers = Some("162.159.192.1:2408,188.114.96.1".into());
        assert!(!p.as_args().iter().any(|a| a == "--wiw-peers"));
    }

    // ── Aether ≥2.0.0 ──────────────────────────────────────────
    #[test]
    fn default_omits_new_flags() {
        let args = ConnectionProfile::default().as_args();
        for f in [
            "--mim",
            "--mim-peers",
            "--no-quic-v2",
            "--tor",
            "--tor-reverse",
            "--tor-only",
            "--mark",
        ] {
            assert!(!args.iter().any(|a| a == f), "unexpected {f} in {args:?}");
        }
    }

    #[test]
    fn mim_emits_and_omits_when_not_masque() {
        let mut p = ConnectionProfile {
            mim: true,
            ..ConnectionProfile::default()
        };
        // Auto/Masque emit
        assert!(p.as_args().iter().any(|a| a == "--mim"));
        p.protocol = Protocol::Masque;
        assert!(p.as_args().iter().any(|a| a == "--mim"));
        p.protocol = Protocol::Wireguard;
        assert!(
            !p.as_args().iter().any(|a| a == "--mim"),
            "mim leaked for wg"
        );
        p.protocol = Protocol::Gool;
        assert!(
            !p.as_args().iter().any(|a| a == "--mim"),
            "mim leaked for gool"
        );
    }

    #[test]
    fn mim_peers_auto_and_list() {
        let mut p = ConnectionProfile {
            mim: true,
            ..ConnectionProfile::default()
        };
        p.mim_peers = Some("auto".into());
        let args = p.as_args();
        let i = args
            .iter()
            .position(|a| a == "--mim-peers")
            .expect("missing --mim-peers for auto");
        assert_eq!(args[i + 1], "auto");
        p.mim_peers = Some(" 162.159.192.1:2408, 188.114.96.1:2408 ".into());
        let args = p.as_args();
        let i = args.iter().position(|a| a == "--mim-peers").unwrap();
        assert_eq!(args[i + 1], "162.159.192.1:2408,188.114.96.1:2408");
        p.mim_peers = Some("162.159.192.1:2408".into());
        assert!(p.as_args().iter().any(|a| a == "--mim-peers"));
        // without port dropped
        p.mim_peers = Some("162.159.192.1".into());
        assert!(!p.as_args().iter().any(|a| a == "--mim-peers"));
    }

    #[test]
    fn quic_v2_default_omits_flag() {
        let p = ConnectionProfile::default();
        assert!(p.quic_v2);
        assert!(!p.as_args().iter().any(|a| a == "--no-quic-v2"));
    }

    #[test]
    fn quic_v2_false_emits_no_quic() {
        let mut p = ConnectionProfile {
            quic_v2: false,
            ..ConnectionProfile::default()
        };
        assert!(p.as_args().iter().any(|a| a == "--no-quic-v2"));
        // when H2 active, probe is irrelevant — no flag
        p.masque_http2 = true;
        assert!(!p.as_args().iter().any(|a| a == "--no-quic-v2"));
    }

    #[test]
    fn fw_mark_validate() {
        assert!(validate_mark("100").is_ok());
        assert!(validate_mark("0x64").is_ok());
        assert!(validate_mark("0XFF").is_ok());
        assert!(validate_mark("abc").is_err());
        assert!(validate_mark("").is_err());
    }

    #[test]
    fn engine_tor_mode_json_round_trip() {
        for (mode, name) in [
            (EngineTorMode::Disabled, "disabled"),
            (EngineTorMode::Tor, "tor"),
            (EngineTorMode::TorReverse, "tor-reverse"),
            (EngineTorMode::TorOnly, "tor-only"),
        ] {
            let json = serde_json::to_value(&mode).unwrap();
            assert_eq!(json, serde_json::json!(name));
            assert_eq!(serde_json::from_value::<EngineTorMode>(json).unwrap(), mode);
            let profile = ConnectionProfile {
                engine_tor_mode: mode.clone(),
                ..ConnectionProfile::default()
            };
            let json = serde_json::to_value(&profile).unwrap();
            assert_eq!(json["engine_tor_mode"], name);
            assert_eq!(
                serde_json::from_value::<ConnectionProfile>(json).unwrap(),
                profile
            );
        }
    }

    #[test]
    fn engine_tor_mode_legacy_aliases_serialize_canonically() {
        for (legacy, canonical) in [("tor_reverse", "tor-reverse"), ("tor_only", "tor-only")] {
            let mut json = serde_json::to_value(ConnectionProfile::default()).unwrap();
            json["engine_tor_mode"] = serde_json::json!(legacy);
            let profile: ConnectionProfile = serde_json::from_value(json).unwrap();
            assert_eq!(
                serde_json::to_value(profile).unwrap()["engine_tor_mode"],
                canonical
            );
        }
    }

    #[test]
    fn engine_tor_modes_emit_correct_flag() {
        let mut p = ConnectionProfile::default();
        for (mode, flag) in [
            (EngineTorMode::Tor, "--tor"),
            (EngineTorMode::TorReverse, "--tor-reverse"),
            (EngineTorMode::TorOnly, "--tor-only"),
        ] {
            p.engine_tor_mode = mode;
            assert!(p.as_args().iter().any(|a| a == flag), "missing {flag}");
        }
        p.engine_tor_mode = EngineTorMode::Disabled;
        assert!(!p.as_args().iter().any(|a| a == "--tor"));
        assert!(!p.as_args().iter().any(|a| a == "--tor-reverse"));
        assert!(!p.as_args().iter().any(|a| a == "--tor-only"));
    }

    #[test]
    fn tor_reverse_rejects_wg() {
        let mut p = ConnectionProfile {
            engine_tor_mode: EngineTorMode::TorReverse,
            ..ConnectionProfile::default()
        };
        p.protocol = Protocol::Wireguard;
        assert!(validate(&p).is_err());
        p.protocol = Protocol::Gool;
        assert!(validate(&p).is_err());
        p.protocol = Protocol::Masque;
        assert!(validate(&p).is_ok());
    }

    #[test]
    fn bridge_policies_emit_supported_cli_forms() {
        let mut p = ConnectionProfile {
            engine_tor_mode: EngineTorMode::Tor,
            ..ConnectionProfile::default()
        };
        let baseline = p.as_args();
        assert!(!baseline
            .iter()
            .any(|a| a == "--tor-bridges" || a == "--tor-bridge" || a == "--no-tor-bridges"));
        p.engine_tor_force_bridges = true;
        assert!(validate(&p).is_ok());
        let args = p.as_args();
        assert_eq!(
            args.len(),
            baseline.len() + 1,
            "force auto must be valueless"
        );
        assert!(args.contains(&"--tor-bridges".into()));
        p.engine_tor_force_bridges = false;
        p.engine_tor_bridges = vec![" line one ".into(), "".into(), "line two".into()];
        assert!(validate(&p).is_ok());
        let args = p.as_args();
        let lines: Vec<_> = args
            .windows(2)
            .filter(|w| w[0] == "--tor-bridge")
            .map(|w| w[1].as_str())
            .collect();
        assert_eq!(lines, ["line one", "line two"]);
        p.engine_tor_bridges.clear();
        p.engine_tor_no_bridges = true;
        assert!(validate(&p).is_ok());
        assert!(p.as_args().contains(&"--no-tor-bridges".into()));
    }

    #[test]
    fn bridge_conflicts_and_legacy_paths_block_validation() {
        let mut p = ConnectionProfile {
            engine_tor_bridges_file: Some("C:/legacy/bridges.txt".into()),
            ..ConnectionProfile::default()
        };
        assert!(validate(&p).unwrap_err().contains("No file has been read"));
        assert!(!p.as_args().contains(&"C:/legacy/bridges.txt".into()));
        p.engine_tor_bridges_file = Some("  ".into());
        assert!(validate(&p).is_ok());
        p.engine_tor_mode = EngineTorMode::Tor;
        p.engine_tor_force_bridges = true;
        p.engine_tor_no_bridges = true;
        assert!(validate(&p).is_err());
        p.engine_tor_no_bridges = false;
        p.engine_tor_bridges = vec!["manual line".into()];
        assert!(validate(&p).is_err());
        p.engine_tor_force_bridges = false;
        p.engine_tor_no_bridges = true;
        assert!(validate(&p).is_err());
    }

    #[test]
    fn active_listeners_require_numeric_distinct_sockets() {
        let mut p = ConnectionProfile::default();
        for bind in [
            "localhost:1819",
            "127.0.0.1:0",
            "[fe80::1%3]:1819",
            "127.0.0.1:65536",
        ] {
            p.bind_address = bind.into();
            assert!(validate(&p).is_err(), "{bind}");
        }
        p.bind_address = "127.0.0.1:1819".into();
        for bind in [
            "127.0.0.1:1819",
            "0.0.0.0:1819",
            "[::]:1819",
            "[::ffff:127.0.0.1]:1819",
        ] {
            p.http_proxy_address = Some(bind.into());
            assert!(validate(&p).is_err(), "collision {bind}");
        }
        p.http_proxy_address = Some("127.0.0.2:1819".into());
        assert!(validate(&p).is_ok());
        p.engine_tor_mode = EngineTorMode::Tor;
        p.engine_tor_bind = Some("127.0.0.1:1819".into());
        assert!(validate(&p).is_err());
        p.engine_tor_mode = EngineTorMode::TorOnly;
        assert!(validate(&p).is_ok());
        assert!(!p.as_args().contains(&"--tor-bind".into()));
    }

    #[test]
    fn peer_validation_limits_two_distinct_numeric_ips_when_active() {
        let mut p = ConnectionProfile {
            mim: true,
            ..ConnectionProfile::default()
        };
        for peers in [
            "example.com:443",
            "1.1.1.1:443,2.2.2.2:443,3.3.3.3:443",
            "1.1.1.1:443,1.1.1.1:8443",
            "1.1.1.1:443,[::ffff:1.1.1.1]:443",
            "[::1]:443,[0:0:0:0:0:0:0:1]:444",
            "1.1.1.1:443,",
        ] {
            p.mim_peers = Some(peers.into());
            assert!(validate(&p).is_err(), "{peers}");
            p.protocol = Protocol::Gool;
            p.wiw_peers = Some(peers.into());
            assert!(validate(&p).is_err(), "{peers}");
            p.protocol = Protocol::Auto;
        }
        for peers in ["auto", "1.1.1.1:443", "[::1]:443,[::2]:443"] {
            p.mim_peers = Some(peers.into());
            assert!(validate(&p).is_ok(), "{peers}");
        }
        p.mim_peers = Some("invalid saved choice".into());
        p.engine_tor_mode = EngineTorMode::TorOnly;
        assert!(validate(&p).is_ok());
    }

    #[test]
    fn inactive_transport_controls_preserve_saved_choices() {
        let mut p = ConnectionProfile {
            quic_v2: false,
            ..ConnectionProfile::default()
        };
        for mode in [EngineTorMode::TorReverse, EngineTorMode::TorOnly] {
            p.engine_tor_mode = mode;
            assert!(!p.as_args().contains(&"--no-quic-v2".into()));
            assert!(!p.quic_v2);
        }
        p.tun_address = "invalid".into();
        p.tun_dns = "invalid".into();
        assert!(validate(&p).is_ok());
        p.capture_mode = CaptureMode::Tun;
        assert!(validate(&p).is_err());
    }

    #[test]
    fn numeric_tuning_serde_requires_uint32() {
        for field in [
            "route_sniff_ms",
            "engine_tor_direct_secs",
            "engine_tor_stall_secs",
            "max_clients",
            "half_close_secs",
            "tcp_keepalive_secs",
            "tcp_connect_secs",
        ] {
            for value in [
                serde_json::json!(-1),
                serde_json::json!(0.5),
                serde_json::json!(4294967296u64),
            ] {
                let mut json = serde_json::to_value(ConnectionProfile::default()).unwrap();
                json[field] = value;
                assert!(
                    serde_json::from_value::<ConnectionProfile>(json).is_err(),
                    "{field}"
                );
            }
        }
        let mut p = ConnectionProfile {
            route_sniff_ms: Some(10001),
            ..ConnectionProfile::default()
        };
        assert!(validate(&p).is_err());
        p.route_sniff = false;
        assert!(validate(&p).is_ok());
    }

    #[test]
    fn old_profile_json_gets_new_defaults() {
        let json = r#"{"protocol":"auto","scan_mode":"turbo","ip_version":"v4","quick_reconnect":true,"masque_http2":false}"#;
        let p: ConnectionProfile = serde_json::from_str(json).unwrap();
        assert!(!p.mim);
        assert_eq!(p.mim_peers, None);
        assert!(p.quic_v2);
        assert_eq!(p.fw_mark, None);
        assert_eq!(p.engine_tor_mode, EngineTorMode::Disabled);
        assert_eq!(p.engine_tor_bridges, Vec::<String>::new());
        assert_eq!(p.max_clients, None);
    }
}
