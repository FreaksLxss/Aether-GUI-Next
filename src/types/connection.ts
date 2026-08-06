// Mirrors src-tauri/src/state.rs::ConnectionState (serde adjacently-tagged
// via `#[serde(tag = "state")]`) and src-tauri/src/aether/profiles.rs.

export type ConnectionStatus =
  | { state: "Idle" }
  | { state: "Launching" }
  | { state: "Connecting" }
  | { state: "Connected"; socks_addr: string; connected_at_ms: number }
  | { state: "Reconnecting"; attempt: number; max_attempts: number }
  | { state: "Disconnecting" }
  | { state: "Error"; message: string; phase: string };

export type Protocol = "auto" | "masque" | "wireguard" | "gool";
export type ScanMode = "turbo" | "balanced" | "thorough" | "stealth" | "ironclad";
export type IpVersion = "v4" | "v6" | "both";
export type MasqueNoize = "firewall" | "gfw" | "off";
export type WgNoize = "balanced" | "aggressive" | "light" | "off";
/** Aether ≥1.4.0: log verbosity level. */
export type LogLevel = "error" | "warn" | "info" | "debug" | "trace";
/** Aether ≥1.4.0: resource scaling override. */
export type PerfLevel = "low" | "medium" | "high";
/** How network traffic is captured: system proxy, TUN adapter, or both. */
export type CaptureMode = "proxy" | "tun" | "both";
/** How DNS is resolved when TUN mode is active. */
export type DnsMode = "forward" | "direct";

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
  /** Obfuscation profile for MASQUE (firewall/gfw/off). */
  masque_noize: MasqueNoize;
  /** Obfuscation profile for WireGuard/gool (balanced/aggressive/light/off). */
  wg_noize: WgNoize;
  /** Local SOCKS5 listen address (--bind). Default 127.0.0.1:1819. */
  bind_address: string;
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
}

export interface LogLine {
  line: string;
  timestamp: number;
}

export interface ConnectionHistoryEntry {
  protocol: string;
  scan_mode: string;
  timestamp: number;
  duration_secs: number;
  success: boolean;
}
