import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

function isTauriEnvStore(): boolean {
  try {
    const w = window as unknown as Record<string, unknown>;
    return !!w.__TAURI_INTERNALS__ || !!w.__TAURI__ || !!w.__TAURI_IPC__;
  } catch { return false; }
}
import { listen } from "@tauri-apps/api/event";
import type {
  ConnectionProfile,
  ConnectionStatus,
  ConnectionHistoryEntry,
  LogLine,
  LogLevel,
  MasqueNoize,
  PerfLevel,
  WgNoize,
  CaptureMode,
  DnsMode,
  PublicInfo,
  TrafficStats,
  ActiveConn,
  EngineTorMode,
  EngineTorStatus,
} from "@/types/connection";

import { defaultConnectionProfile } from "@/lib/profile-defaults";
import { connectionProfileSchema, validateActiveProfile } from "@/lib/validators";

const MAX_LOG_LINES = 500;

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    try {
      const profile = useConnectionStore.getState().profile;
      await invoke("set_default_profile", { profile });
    } catch {
      // Debounced best-effort persist; the next edit retries.
    }
  }, 500);
}

let ipCheckAbort: AbortController | null = null;
let ipCheckInFlight: Promise<void> | null = null;

async function sendNotification(title: string, body: string) {
  try {
    const { isPermissionGranted, requestPermission, sendNotification } = await import(
      "@tauri-apps/plugin-notification"
    );
    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === "granted";
    }
    if (granted) {
      sendNotification({ title, body });
    }
  } catch {
    // Notification plugin not available — silently ignore
  }
}

interface ConnectionState {
  status: ConnectionStatus;
  engineTorStatus: EngineTorStatus;
  profile: ConnectionProfile;
  logs: LogLine[];
  sidecarError: string | null;
  /** Aether's own route-probe budget in seconds, parsed live out of its log
   * stream (its prober logs e.g. "...budget=120s" once scanning starts) —
   * lets the UI show real progress instead of an indefinite spinner. Reset
   * on every fresh attempt since it can differ by protocol/scan mode. */
  scanBudgetSecs: number | null;
  history: ConnectionHistoryEntry[];
  /** Egress IP/location seen *through* the tunnel (Aether's exit). null until
   * the last check ran or it failed. */
  publicIp: PublicInfo | null;
  /** The machine's raw ISP IP, fetched without the proxy — the comparison
   * baseline for the leak check. */
  directIp: PublicInfo | null;
  publicIpLoading: boolean;
  /** Milliseconds the last public-IP probe took (tunnel path when connected, else direct). */
  publicIpLatencyMs: number | null;
  /** Last up to 20 probe latencies for a future sparkline. */
  publicIpHistory: number[];
  /** Result of comparing exit IP vs direct IP while connected:
   * "none" (tunnel is masking), "leak" (exit IP == direct IP), or
   * "unavailable" when no comparison was possible. */
  leakStatus: "none" | "leak" | "unavailable";
  /** In-memory traffic totals + live rates; never persisted. Null until first snapshot. */
  traffic: TrafficStats | null;
  activeConns: ActiveConn[];
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  setProtocol: (protocol: ConnectionProfile["protocol"]) => void;
  setScanMode: (scan_mode: ConnectionProfile["scan_mode"]) => void;
  setIpVersion: (ip_version: ConnectionProfile["ip_version"]) => void;
  setQuickReconnect: (quick_reconnect: boolean) => void;
  setMasqueHttp2: (masque_http2: boolean) => void;
  setMasqueNoize: (masque_noize: MasqueNoize) => void;
  setWgNoize: (wg_noize: WgNoize) => void;
  setBindAddress: (bind_address: string) => void;
  setHttpProxyAddress: (http_proxy_address: string | null) => void;
  setUpstreamProxy: (upstream_proxy: string | null) => void;
  setWiwPeers: (wiw_peers: string | null) => void;
  setLogLevel: (log_level: LogLevel | null) => void;
  setPerf: (perf: PerfLevel | null) => void;
  setCaptureMode: (capture_mode: CaptureMode) => void;
  setDnsMode: (dns_mode: DnsMode) => void;
  setTunAddress: (tun_address: string) => void;
  setTunDns: (tun_dns: string) => void;
  setDnsServers: (dns_servers: string | null) => void;
  setRouteBlock: (route_block: string[]) => void;
  setRouteDirect: (route_direct: string[]) => void;
  setRouteSniff: (route_sniff: boolean) => void;
  setRouteSniffMs: (route_sniff_ms: number | null) => void;
  setAutoReprovision: (auto_reprovision: boolean) => void;
  setZtTeam: (zt_team: string | null) => void;
  setZtAccessEmail: (zt_access_email: string | null) => void;
  setZtAccessId: (zt_access_id: string | null) => void;
  setZtAccessSecret: (zt_access_secret: string | null) => void;
  setZtAccessToken: (zt_access_token: string | null) => void;
  setZtGateway: (zt_gateway: boolean) => void;
  setMim: (mim: boolean) => void;
  setMimPeers: (mim_peers: string | null) => void;
  setQuicV2: (quic_v2: boolean) => void;
  setFwMark: (fw_mark: string | null) => void;
  setEngineTorMode: (engine_tor_mode: EngineTorMode) => void;
  setEngineTorBind: (engine_tor_bind: string | null) => void;
  setEngineTorDir: (engine_tor_dir: string | null) => void;
  setEngineTorBridges: (engine_tor_bridges: string[]) => void;
  setEngineTorBridgesFile: (engine_tor_bridges_file: string | null) => void;
  setEngineTorNoBridges: (engine_tor_no_bridges: boolean) => void;
  setEngineTorForceBridges: (engine_tor_force_bridges: boolean) => void;
  /** Atomically replace all fields with a normalized, validated profile. */
  applyProfile: (profile: unknown) => void;
  setEngineTorPt: (engine_tor_pt: string | null) => void;
  setEngineTorPtDir: (engine_tor_pt_dir: string | null) => void;
  setEngineTorCountry: (engine_tor_country: string | null) => void;
  setEngineTorDirectSecs: (engine_tor_direct_secs: number | null) => void;
  setEngineTorStallSecs: (engine_tor_stall_secs: number | null) => void;
  setMaxClients: (max_clients: number | null) => void;
  setHalfCloseSecs: (half_close_secs: number | null) => void;
  setTcpKeepaliveSecs: (tcp_keepalive_secs: number | null) => void;
  setTcpConnectSecs: (tcp_connect_secs: number | null) => void;
  retryAfterSidecarError: () => void;
  loadHistory: () => Promise<void>;
  clearHistory: () => Promise<void>;
  /** Fetches both the tunnel-exit and direct public IPs in parallel and works
   * out the leak status. Safe to call any time; leak comparison only applies
   * while connected. */
  runPublicIpCheck: () => Promise<void>;
  refreshActiveConns: () => Promise<void>;
  /** Re-read the persisted default profile into the store (e.g. after the
   * user imports settings from a file that changed the saved profile). */
  reloadProfile: () => Promise<void>;
}

export const useConnectionStore = create<ConnectionState>((set, get) => {
  const createPersistSetter = <K extends keyof ConnectionProfile>(key: K) =>
    (value: ConnectionProfile[K]) => {
      set((st) => ({ profile: { ...st.profile, [key]: value } }));
      schedulePersist();
    };
  return {
  status: { state: "Idle" },
  engineTorStatus: { enabled: false, ready: false, address: null },
  profile: defaultConnectionProfile(),
  applyProfile: (value) => {
    const profile = connectionProfileSchema.parse(value);
    const error = validateActiveProfile(profile);
    if (error) throw new Error(error);
    set({ profile });
    schedulePersist();
  },
  logs: [],
  sidecarError: null,
  scanBudgetSecs: null,
  history: [],
  publicIp: null,
  directIp: null,
  publicIpLoading: false,
  publicIpLatencyMs: null,
  publicIpHistory: [],
  leakStatus: "unavailable",
  traffic: null,
  activeConns: [],

  connect: async () => {
    try {
      const profile = connectionProfileSchema.parse(get().profile);
      const error = validateActiveProfile(profile);
      if (error) {
        set({ status: { state: "Error", message: error, phase: "validation" } });
        return;
      }
      await invoke("connect", { profileOverride: profile });
    } catch (e) {
      // TODO(F2): replace String(e) with typed AppError {code,message}
      const message = String(e);
      // "Binary not found" (src-tauri/src/aether/mod.rs::resolve_binary) means
      // the tunnel engine itself can't run at all — structurally different
      // from a normal connection failure, so it routes to the full-screen
      // SidecarErrorScreen instead of the button's own error state.
      if (/binary not found|engine incompatible|engine_incompatible/i.test(message)) {
        set({ sidecarError: message });
      } else {
        set({ status: { state: "Error", message, phase: "launching" } });
      }
    }
  },

  disconnect: async () => {
    try {
      await invoke("disconnect");
    } catch {
      // TODO(F2): typed error handling — surface typed disconnect errors when backend provides them
      // Backend rejects disconnect() when there's nothing to stop (already
      // Idle) — nothing for the UI to do since status already reflects that.
    }
  },

  setProtocol: createPersistSetter("protocol"),

  setScanMode: createPersistSetter("scan_mode"),

  setIpVersion: createPersistSetter("ip_version"),

  setQuickReconnect: createPersistSetter("quick_reconnect"),

  setMasqueHttp2: createPersistSetter("masque_http2"),

  setMasqueNoize: createPersistSetter("masque_noize"),

  setWgNoize: createPersistSetter("wg_noize"),

  setBindAddress: (bind_address) => {
    set((s) => ({ profile: { ...s.profile, bind_address } }));
    schedulePersist();
  },

  setHttpProxyAddress: (http_proxy_address) => {
    set((s) => ({ profile: { ...s.profile, http_proxy_address } }));
    schedulePersist();
  },

  setUpstreamProxy: (upstream_proxy) => {
    set((s) => ({ profile: { ...s.profile, upstream_proxy } }));
    schedulePersist();
  },

  setWiwPeers: (wiw_peers) => {
    set((s) => ({ profile: { ...s.profile, wiw_peers } }));
    schedulePersist();
  },

  setLogLevel: createPersistSetter("log_level"),

  setPerf: createPersistSetter("perf"),

  setCaptureMode: createPersistSetter("capture_mode"),

  setDnsMode: createPersistSetter("dns_mode"),

  setTunAddress: createPersistSetter("tun_address"),

  setTunDns: createPersistSetter("tun_dns"),

  setDnsServers: (dns_servers) => {
    set((s) => ({ profile: { ...s.profile, dns_servers } }));
    schedulePersist();
  },

  setRouteBlock: (route_block) => {
    set((s) => ({ profile: { ...s.profile, route_block } }));
    schedulePersist();
  },

  setRouteDirect: (route_direct) => {
    set((s) => ({ profile: { ...s.profile, route_direct } }));
    schedulePersist();
  },

  setRouteSniff: createPersistSetter("route_sniff"),

  setRouteSniffMs: (route_sniff_ms) => {
    set((s) => ({ profile: { ...s.profile, route_sniff_ms } }));
    schedulePersist();
  },

  setAutoReprovision: createPersistSetter("auto_reprovision"),

  setZtTeam: (zt_team) => {
    set((s) => ({ profile: { ...s.profile, zt_team } }));
    schedulePersist();
  },

  setZtAccessEmail: (zt_access_email) => {
    set((s) => ({ profile: { ...s.profile, zt_access_email } }));
    schedulePersist();
  },

  setZtAccessId: (zt_access_id) => {
    set((s) => ({ profile: { ...s.profile, zt_access_id } }));
    schedulePersist();
  },

  setZtAccessSecret: (zt_access_secret) => {
    set((s) => ({ profile: { ...s.profile, zt_access_secret } }));
    schedulePersist();
  },

  setZtAccessToken: (zt_access_token) => {
    set((s) => ({ profile: { ...s.profile, zt_access_token } }));
    schedulePersist();
  },

  setZtGateway: createPersistSetter("zt_gateway"),

  setMim: createPersistSetter("mim"),
  setMimPeers: (mim_peers) => { set((s) => ({ profile: { ...s.profile, mim_peers } })); schedulePersist(); },
  setQuicV2: createPersistSetter("quic_v2"),
  setFwMark: (fw_mark) => { set((s) => ({ profile: { ...s.profile, fw_mark } })); schedulePersist(); },
  setEngineTorMode: createPersistSetter("engine_tor_mode"),
  setEngineTorBind: (engine_tor_bind) => { set((s) => ({ profile: { ...s.profile, engine_tor_bind } })); schedulePersist(); },
  setEngineTorDir: (engine_tor_dir) => { set((s) => ({ profile: { ...s.profile, engine_tor_dir } })); schedulePersist(); },
  setEngineTorBridges: (engine_tor_bridges) => { set((s) => ({ profile: { ...s.profile, engine_tor_bridges } })); schedulePersist(); },
  setEngineTorBridgesFile: (engine_tor_bridges_file) => { set((s) => ({ profile: { ...s.profile, engine_tor_bridges_file } })); schedulePersist(); },
  setEngineTorNoBridges: createPersistSetter("engine_tor_no_bridges"),
  setEngineTorForceBridges: createPersistSetter("engine_tor_force_bridges"),
  setEngineTorPt: (engine_tor_pt) => { set((s) => ({ profile: { ...s.profile, engine_tor_pt } })); schedulePersist(); },
  setEngineTorPtDir: (engine_tor_pt_dir) => { set((s) => ({ profile: { ...s.profile, engine_tor_pt_dir } })); schedulePersist(); },
  setEngineTorCountry: (engine_tor_country) => { set((s) => ({ profile: { ...s.profile, engine_tor_country } })); schedulePersist(); },
  setEngineTorDirectSecs: (engine_tor_direct_secs) => { set((s) => ({ profile: { ...s.profile, engine_tor_direct_secs } })); schedulePersist(); },
  setEngineTorStallSecs: (engine_tor_stall_secs) => { set((s) => ({ profile: { ...s.profile, engine_tor_stall_secs } })); schedulePersist(); },
  setMaxClients: (max_clients) => { set((s) => ({ profile: { ...s.profile, max_clients } })); schedulePersist(); },
  setHalfCloseSecs: (half_close_secs) => { set((s) => ({ profile: { ...s.profile, half_close_secs } })); schedulePersist(); },
  setTcpKeepaliveSecs: (tcp_keepalive_secs) => { set((s) => ({ profile: { ...s.profile, tcp_keepalive_secs } })); schedulePersist(); },
  setTcpConnectSecs: (tcp_connect_secs) => { set((s) => ({ profile: { ...s.profile, tcp_connect_secs } })); schedulePersist(); },

  // Clears the fallback screen so the user can attempt Connect again (e.g.
  // after fixing a broken install) — the next connect() call will re-set
  // sidecarError if the binary is still missing.
  retryAfterSidecarError: () => set({ sidecarError: null }),

  loadHistory: async () => {
    const history = await invoke<ConnectionHistoryEntry[]>("get_history");
    set({ history });
  },

  clearHistory: async () => {
    await invoke("clear_history");
    set({ history: [] });
  },

  runPublicIpCheck: async () => {
    if (ipCheckInFlight) return ipCheckInFlight;
    if (ipCheckAbort) ipCheckAbort.abort();
    const controller = new AbortController();
    ipCheckAbort = controller;
    const { signal } = controller;
    const p = (async () => {
      const connected = get().status.state === "Connected";
      if (signal.aborted) return;
      set({ publicIpLoading: true });
      const t0 = performance.now();
      const [tunnel, direct] = await Promise.all([
        invoke<PublicInfo | null>("get_public_ip", { throughTunnel: connected }).catch(() => null),
        invoke<PublicInfo | null>("get_public_ip", { throughTunnel: false }).catch(() => null),
      ]);
      if (signal.aborted) return;
      const latencyMs = Math.round(performance.now() - t0);
      let leakStatus: "none" | "leak" | "unavailable" = "unavailable";
      if (connected && tunnel) {
        leakStatus = direct ? (tunnel.ip === direct.ip ? "leak" : "none") : "none";
      }
      if (signal.aborted) return;
      set((st) => ({
        publicIp: tunnel,
        directIp: direct,
        publicIpLoading: false,
        publicIpLatencyMs: latencyMs,
        publicIpHistory: [...st.publicIpHistory, latencyMs].slice(-20),
        leakStatus,
      }));
    })().finally(() => {
      if (ipCheckInFlight === p) ipCheckInFlight = null;
    });
    ipCheckInFlight = p;
    return p;
  },

  refreshActiveConns: async () => {
    try {
      const conns = await invoke<ActiveConn[]>("get_active_connections");
      set({ activeConns: conns });
    } catch {
      // Polling is advisory; keep the previous snapshot.
    }
  },

  reloadProfile: async () => {
    try {
      const profile = await invoke<ConnectionProfile>("get_default_profile");
      set({ profile: connectionProfileSchema.parse(profile) });
    } catch (e) {
      console.error("Failed to reload profile:", e);
    }
  },
  };
});

// Dev-only: lets the 3D backdrop's per-state moods be driven from the WebView2
// devtools console without a live tunnel, e.g.
//   __conn.setState({ status: { state: "Connecting" } })
// Tree-shaken out of production builds by the import.meta.env.DEV guard.
if (import.meta.env.DEV) {
  (window as unknown as { __conn?: typeof useConnectionStore }).__conn = useConnectionStore;
}

const BUDGET_RE = /budget=(\d+)s/;

/** Call once from App's top-level effect; returns a cleanup function. */
export async function initConnectionListeners(): Promise<() => void> {
  if (!isTauriEnvStore()) return () => {};
  // Log lines arrive fast during route scanning; flushing to the store per
  // line would mean an O(logs) array copy + a re-render each. Coalesce into
  // one store write per ~100ms instead.
  let pendingLogs: LogLine[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const flushLogs = () => {
    flushTimer = null;
    const batch = pendingLogs;
    pendingLogs = [];
    let budget: number | null = null;
    for (const l of batch) {
      const m = BUDGET_RE.exec(l.line);
      if (m) budget = Number(m[1]);
    }
    useConnectionStore.setState((s) => ({
      logs: [...s.logs, ...batch].slice(-MAX_LOG_LINES),
      ...(budget !== null ? { scanBudgetSecs: budget } : {}),
    }));
  };

  // Notification state tracking — seed with current state so the initial
  // emit (Idle) on startup doesn't fire a spurious notification.
  let lastNotifiedState: string | null = useConnectionStore.getState().status.state;

  let torStatusReceived = false;
  const [unlistenStatus, unlistenLog, unlistenTraffic, unlistenTorStatus] = await Promise.all([
    listen<ConnectionStatus>("aether://status", (e) => {
      const newState = e.payload.state;
      useConnectionStore.setState({
        status: e.payload,
        // Fresh attempt — last attempt's budget no longer applies.
        ...(e.payload.state === "Launching" ? { scanBudgetSecs: null, traffic: null, activeConns: [] } : {}),
        ...(e.payload.state === "Idle" || e.payload.state === "Error" ? { traffic: null, activeConns: [] } : {}),
      });

      // Send notifications on significant state changes (frontend-only)
      if (newState !== lastNotifiedState) {
        lastNotifiedState = newState;
        if (newState === "Connected") {
          const captureMode = useConnectionStore.getState().profile.capture_mode;
          const modeLabel = captureMode === "tun" ? " (TUN mode)" : captureMode === "both" ? " (Proxy + TUN)" : "";
          sendNotification("Aether-GUI", `Connected successfully${modeLabel}`);
        } else if (newState === "Error") {
          const msg = "state" in e.payload ? (e.payload as { message?: string }).message : "Unknown error";
          sendNotification("Aether-GUI", `Connection failed: ${msg}`);
        } else if (newState === "Reconnecting") {
          sendNotification("Aether-GUI", "Connection lost, reconnecting...");
        }
      }
    }),
    listen<LogLine>("aether://log", (e) => {
      pendingLogs.push(e.payload);
      flushTimer ??= setTimeout(flushLogs, 100);
    }),
    listen<TrafficStats>("aether://traffic", (e) => {
      useConnectionStore.setState({ traffic: e.payload });
    }),
    listen<EngineTorStatus>("aether://tor-status", (e) => {
      torStatusReceived = true;
      useConnectionStore.setState({ engineTorStatus: e.payload });
    }),
  ]);

  // Reconcile state in case the window reopened mid-session, and load the
  // last-successful profile so the protocol selector reflects it. Neither
  // command touches the Aether binary, so a failure here is an IPC-layer
  // bug, not a sidecar problem — logged rather than shown as sidecarError.
  try {
    const [status, profile, traffic, engineTorStatus] = await Promise.all([
      invoke<ConnectionStatus>("get_status"),
      invoke<ConnectionProfile>("get_default_profile"),
      invoke<TrafficStats>("get_traffic_stats").catch(() => null as TrafficStats | null),
      invoke<EngineTorStatus>("get_engine_tor_status").catch(() => null),
    ]);
    useConnectionStore.setState({
      status,
      profile: connectionProfileSchema.parse(profile),
      ...(traffic ? { traffic } : {}),
      ...(!torStatusReceived && engineTorStatus ? { engineTorStatus } : {}),
    });
  } catch (e) {
    console.error("Failed to load initial connection state:", e);
  }

  return () => {
    unlistenStatus();
    unlistenLog();
    unlistenTraffic();
    unlistenTorStatus();
    if (flushTimer !== null) clearTimeout(flushTimer);
  };
}
