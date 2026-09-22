// Mirrors src-tauri/src/state.rs::ConnectionState (serde adjacently-tagged
// via `#[serde(tag = "state")]`) and src-tauri/src/aether/profiles.rs.

export type ConnectionStatus =
  | { state: "Idle" }
  | { state: "Launching" }
  | { state: "Connecting" }
  | { state: "Connected"; socks_addr: string; bridge_addr: string; connected_at_ms: number }
  | { state: "Reconnecting"; attempt: number; max_attempts: number }
  | { state: "Disconnecting" }
  | { state: "Error"; message: string; phase: string };

export type Protocol = "auto" | "masque" | "wireguard" | "gool";
/** Aether ≥2.1.0 renamed stealth → verified (engine still accepts "stealth"). */
export type ScanMode = "turbo" | "balanced" | "thorough" | "verified" | "ironclad";
export type IpVersion = "v4" | "v6" | "both";
/** Aether ≥1.6.0: "light" added as a gentler MASQUE obfuscation profile. */
export type MasqueNoize = "firewall" | "gfw" | "light" | "off";
export type WgNoize = "balanced" | "aggressive" | "light" | "off";
/** Aether ≥1.4.0: log verbosity level. */
export type LogLevel = "error" | "warn" | "info" | "debug" | "trace";
/** Aether ≥1.4.0: resource scaling override. */
export type PerfLevel = "low" | "medium" | "high";
/** How network traffic is captured: system proxy, TUN adapter, or both. */
export type CaptureMode = "proxy" | "tun" | "both";
/** How DNS is resolved when TUN mode is active. */
export type DnsMode = "forward" | "direct";

/** Aether ≥2.0.0: built-in Tor (arti) mode — separate from IP Changer Tor (9050). */
export type EngineTorMode = "disabled" | "tor" | "tor-reverse" | "tor-only";
/** Aether ≥2.1.0: built-in Psiphon mode — separate from engine Tor (1820) and IP Changer (9050). */
export type EnginePsiphonMode = "disabled" | "psiphon" | "psiphon-reverse" | "psiphon-only";
/** --psiphon-mode <shape> transport; "auto" omits the flag. */
export type PsiphonShape = "auto" | "cdn" | "direct";

export interface ConnectionProfile {
  protocol: Protocol;
  scan_mode: ScanMode;
  ip_version: IpVersion;
  /** Aether ≥1.1.1: reuse the last known-working gateway with a quick
   * recheck instead of a full scan. */
  quick_reconnect: boolean;
  /** Aether ≥1.2.0: run MASQUE over HTTP/2 (TCP) instead of the default
   * HTTP/3 (QUIC) — for networks that block or throttle UDP. */
  masque_http2: boolean;
  /** Obfuscation profile for MASQUE (firewall/gfw/light/off). "light" is Aether ≥1.6.0. */
  masque_noize: MasqueNoize;
  /** Obfuscation profile for WireGuard/gool (balanced/aggressive/light/off). */
  wg_noize: WgNoize;
  /** Local SOCKS5 listen address (--bind). Default 127.0.0.1:1819. */
  bind_address: string;
  /** Aether ≥1.6.0: local HTTP CONNECT proxy listen address, next to the
   * SOCKS5 one for clients that can't speak SOCKS. null = door off. */
  http_proxy_address: string | null;
  /** Aether ≥1.7.0: dial out through another proxy already on the machine
   * (--upstream), chaining Aether behind it. socks5://host:port,
   * http://host:port, or bare host:port (SOCKS5); optional user:pass@ creds.
   * An HTTP upstream only carries the MASQUE HTTP/2 carrier. null = omit flag. */
  upstream_proxy: string | null;
  /** Aether ≥1.9.0: manual WARP-in-WARP hop endpoints for gool (--wiw-peers),
   * comma-separated "host:port". One hop alone is fine (the scan finds the
   * other). null = omit flag (both hops scanned). */
  wiw_peers: string | null;
  /** Aether ≥1.4.0: log verbosity (error/warn/info/debug/trace). null = omit flag (Aether defaults to info). */
  log_level: LogLevel | null;
  /** Aether ≥1.4.0: resource scaling override (low/medium/high). null = omit flag (Aether auto-detects). */
  perf: PerfLevel | null;
  /** How traffic is captured: system proxy only, TUN adapter only, or both. */
  capture_mode: CaptureMode;
  /** How DNS is resolved when TUN mode is active. */
  dns_mode: DnsMode;
  /** TUN adapter IP address in CIDR notation (e.g. "10.0.0.2/24"). */
  tun_address: string;
  /** DNS server to use when TUN mode is active (e.g. "8.8.8.8"). */
  tun_dns: string;
  /** Aether ≥1.5.0: resolvers used inside the tunnel (--dns), comma-separated.
   * null = omit flag (Aether defaults to 1.1.1.1,1.0.0.1). */
  dns_servers: string | null;
  /** Aether ≥1.5.0: destinations refused outright (--route-block). */
  route_block: string[];
  /** Aether ≥1.5.0: destinations sent straight out, bypassing the tunnel (--route-direct). */
  route_direct: string[];
  /** Aether ≥1.7.0: sniff TLS SNI / HTTP Host so domain rules also match
   * behind a TUN front end. false = AETHER_ROUTE_SNIFF=0. */
  route_sniff: boolean;
  /** Aether ≥1.7.0: sniff wait in ms (AETHER_ROUTE_SNIFF_MS). null = core default. */
  route_sniff_ms: number | null;
  /** Aether ≥1.7.0: auto-register a fresh device when Cloudflare rejects the
   * saved identity. false = AETHER_REPROVISION=0 (report only). */
  auto_reprovision: boolean;
  /** Aether ≥1.5.0: Zero Trust organization team name (--team). null = no enrolment. */
  zt_team: string | null;
  /** Aether ≥1.5.0: Zero Trust one-time-code sign-in email (--access-email). */
  zt_access_email: string | null;
  /** Aether ≥1.5.0: Zero Trust service-token client id (--access-id). */
  zt_access_id: string | null;
  /** Aether ≥1.5.0: Zero Trust service-token client secret (--access-secret). */
  zt_access_secret: string | null;
  /** Aether ≥1.5.0: an enrolment token obtained from <team>.cloudflareaccess.com/warp (--access-token). */
  zt_access_token: string | null;
  /** Aether ≥1.5.0: route HTTP/HTTPS through the organization's Gateway proxy (--gateway). */
  zt_gateway: boolean;
  /** Aether ≥2.0.0: two MASQUE hops (like gool for MASQUE). --mim */
  mim: boolean;
  /** Aether ≥2.0.0: --mim-peers outer:port,inner:port or auto. null = scan both. */
  mim_peers: string | null;
  /** Aether ≥2.0.0: QUIC v2 probe before HTTP/3. Default true (on). false = --no-quic-v2. */
  quic_v2: boolean;
  /** Aether ≥2.0.0: firewall mark --mark / AETHER_MARK, Linux/Android only, SO_MARK, needs CAP_NET_ADMIN. */
  fw_mark: string | null;
  /** Aether ≥2.0.0: built-in Tor (arti) mode — port 1820, separate from IP Changer Tor (9050). */
  engine_tor_mode: EngineTorMode;
  engine_tor_bind: string | null;
  engine_tor_dir: string | null;
  engine_tor_bridges: string[];
  /** Force automatic bridges now (--tor-bridges, no value). */
  engine_tor_force_bridges: boolean;
  /** Aether ≥2.1.0: obfs4 bridge lines from a file (--tor-bridge-file). The
   * engine reads it; the GUI never opens the path. */
  engine_tor_bridges_file: string | null;
  engine_tor_no_bridges: boolean;
  engine_tor_pt: string | null;
  engine_tor_pt_dir: string | null;
  engine_tor_country: string | null;
  engine_tor_direct_secs: number | null;
  engine_tor_stall_secs: number | null;
  /** Aether ≥2.1.0: built-in Psiphon mode — port 1821, separate from engine Tor and IP Changer. */
  engine_psiphon_mode: EnginePsiphonMode;
  /** Chain/reverse secondary bind (--psiphon-bind). null → default 127.0.0.1:1821. */
  engine_psiphon_bind: string | null;
  /** --psiphon-mode <shape>: cdn fronting vs direct; "auto" omits the flag. */
  psiphon_shape: PsiphonShape;
  /** Two-letter exit country (--psiphon-region). */
  psiphon_region: string | null;
  /** --tor-relays: auto | only | off | <count>. null = engine default. */
  engine_tor_relays: string | null;
  /** --tor-relay-ports: web | any. null = engine default (web). */
  engine_tor_relay_ports: "web" | "any" | null;
  /** --exit-loc: comma-separated two-letter codes, optional leading ! (e.g. "DE,SE,!IR"). */
  exit_loc: string | null;
  /** --exit-loc-secs: recheck interval for exit-loc. */
  exit_loc_secs: number | null;
  /** --stats: periodic stats logging. */
  stats: boolean;
  /** --stats-secs: stats interval. */
  stats_secs: number | null;
  /** Aether ≥2.0.0: env-only proxy tuning (no flag) */
  max_clients: number | null;
  half_close_secs: number | null;
  tcp_keepalive_secs: number | null;
  tcp_connect_secs: number | null;
}

/** Engine Tor chain listener readiness; not IP Changer Tor or primary status. */
export interface EngineTorStatus {
  enabled: boolean;
  ready: boolean;
  address: string | null;
}

/** Engine Psiphon chain listener readiness; same shape as EngineTorStatus. */
export type EnginePsiphonStatus = EngineTorStatus;

export interface LogLine {
  line: string;
  timestamp: number;
}

/** Public egress IP/location for the GUI's leak-check (src-tauri/src/net.rs,
 * mirrored from its `PublicInfo`). */
export interface PublicInfo {
  ip: string;
  ip_version: "IPv4" | "IPv6";
  country_code: string | null;
  city: string | null;
  org: string | null;
}

export interface ConnectionHistoryEntry {
  protocol: string;
  scan_mode: string;
  timestamp: number;
  duration_secs: number;
  success: boolean;
}

export interface ActiveConn {
  pid: number;
  exe: string;
  local: string;
  remote: string;
  state: string;
  proto: string;
}

export interface TrafficStats {
  tx_bytes: number;
  rx_bytes: number;
  tx_rate: number;
  rx_rate: number;
}
