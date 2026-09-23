
export type ConnectionStatus =
  | { state: "Idle" }
  | { state: "Launching" }
  | { state: "Connecting" }
  | { state: "Connected"; socks_addr: string; bridge_addr: string; connected_at_ms: number }
  | { state: "Reconnecting"; attempt: number; max_attempts: number }
  | { state: "Disconnecting" }
  | { state: "Error"; message: string; phase: string };

export type Protocol = "auto" | "masque" | "wireguard" | "gool";
export type ScanMode = "turbo" | "balanced" | "thorough" | "verified" | "ironclad";
export type IpVersion = "v4" | "v6" | "both";
export type MasqueNoize = "firewall" | "gfw" | "light" | "off";
export type WgNoize = "balanced" | "aggressive" | "light" | "off";
export type LogLevel = "error" | "warn" | "info" | "debug" | "trace";
export type PerfLevel = "low" | "medium" | "high";
export type CaptureMode = "proxy" | "tun" | "both";
export type DnsMode = "forward" | "direct";

export type EngineTorMode = "disabled" | "tor" | "tor-reverse" | "tor-only";
export type EnginePsiphonMode = "disabled" | "psiphon" | "psiphon-reverse" | "psiphon-only";
export type PsiphonShape = "auto" | "cdn" | "direct";

export interface ConnectionProfile {
  protocol: Protocol;
  scan_mode: ScanMode;
  ip_version: IpVersion;
  quick_reconnect: boolean;
  masque_http2: boolean;
  masque_noize: MasqueNoize;
  wg_noize: WgNoize;
  bind_address: string;
  http_proxy_address: string | null;
  upstream_proxy: string | null;
  wiw_peers: string | null;
  log_level: LogLevel | null;
  perf: PerfLevel | null;
  capture_mode: CaptureMode;
  dns_mode: DnsMode;
  tun_address: string;
  tun_dns: string;
  dns_servers: string | null;
  route_block: string[];
  route_direct: string[];
  route_sniff: boolean;
  route_sniff_ms: number | null;
  auto_reprovision: boolean;
  zt_team: string | null;
  zt_access_email: string | null;
  zt_access_id: string | null;
  zt_access_secret: string | null;
  zt_access_token: string | null;
  zt_gateway: boolean;
  mim: boolean;
  mim_peers: string | null;
  quic_v2: boolean;
  fw_mark: string | null;
  engine_tor_mode: EngineTorMode;
  engine_tor_bind: string | null;
  engine_tor_dir: string | null;
  engine_tor_bridges: string[];
  engine_tor_force_bridges: boolean;
  engine_tor_bridges_file: string | null;
  engine_tor_no_bridges: boolean;
  engine_tor_pt: string | null;
  engine_tor_pt_dir: string | null;
  engine_tor_country: string | null;
  engine_tor_direct_secs: number | null;
  engine_tor_stall_secs: number | null;
  engine_psiphon_mode: EnginePsiphonMode;
  engine_psiphon_bind: string | null;
  psiphon_shape: PsiphonShape;
  psiphon_region: string | null;
  engine_tor_relays: string | null;
  engine_tor_relay_ports: "web" | "any" | null;
  exit_loc: string | null;
  exit_loc_secs: number | null;
  stats: boolean;
  stats_secs: number | null;
  max_clients: number | null;
  half_close_secs: number | null;
  tcp_keepalive_secs: number | null;
  tcp_connect_secs: number | null;
}

export interface EngineTorStatus {
  enabled: boolean;
  ready: boolean;
  address: string | null;
}

export type EnginePsiphonStatus = EngineTorStatus;

export interface LogLine {
  line: string;
  timestamp: number;
}

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
