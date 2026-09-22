import type { ConnectionProfile } from "@/types/connection";

/** Mirrors ConnectionProfile::default; never merge a preset with the active profile. */
export function defaultConnectionProfile(): ConnectionProfile {
  return {
    protocol: "auto", scan_mode: "turbo", ip_version: "v4",
    quick_reconnect: true, masque_http2: false, masque_noize: "firewall", wg_noize: "balanced",
    bind_address: "127.0.0.1:1819", http_proxy_address: null, upstream_proxy: null, wiw_peers: null,
    log_level: null, perf: null, capture_mode: "proxy", dns_mode: "forward",
    tun_address: "10.0.0.2/24", tun_dns: "8.8.8.8", dns_servers: null,
    route_block: [], route_direct: [], route_sniff: true, route_sniff_ms: null, auto_reprovision: true,
    zt_team: null, zt_access_email: null, zt_access_id: null, zt_access_secret: null, zt_access_token: null, zt_gateway: false,
    mim: false, mim_peers: null, quic_v2: true, fw_mark: null,
    engine_tor_mode: "disabled", engine_tor_bind: null, engine_tor_dir: null,
    engine_tor_bridges: [], engine_tor_force_bridges: false, engine_tor_bridges_file: null,
    engine_tor_no_bridges: false, engine_tor_pt: null, engine_tor_pt_dir: null,
    engine_tor_country: null, engine_tor_direct_secs: null, engine_tor_stall_secs: null,
    engine_psiphon_mode: "disabled", engine_psiphon_bind: null, psiphon_shape: "auto",
    psiphon_region: null, engine_tor_relays: null, engine_tor_relay_ports: null,
    exit_loc: null, exit_loc_secs: null, stats: false, stats_secs: null,
    max_clients: null, half_close_secs: null, tcp_keepalive_secs: null, tcp_connect_secs: null,
  };
}

/** Desktop webviews report their OS; unknown platforms fail closed for SO_MARK. */
export function supportsFirewallMark(): boolean {
  return typeof navigator !== "undefined"
    && (/linux/i.test(navigator.platform) || /android/i.test(navigator.userAgent));
}
