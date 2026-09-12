import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
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
} from "@/types/connection";

const MAX_LOG_LINES = 500;

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    try {
      const profile = useConnectionStore.getState().profile;
      await invoke("set_default_profile", { profile });
    } catch {}
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
  retryAfterSidecarError: () => void;
  loadHistory: () => Promise<void>;
  clearHistory: () => Promise<void>;
  /** Fetches both the tunnel-exit and direct public IPs in parallel and works
   * out the leak status. Safe to call any time; leak comparison only applies
   * while connected. */
  runPublicIpCheck: () => Promise<void>;
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
  profile: {
    protocol: "auto",
    scan_mode: "turbo",
    ip_version: "v4",
    quick_reconnect: true,
    masque_http2: false,
    masque_noize: "firewall",
    wg_noize: "balanced",
    bind_address: "127.0.0.1:1819",
    http_proxy_address: null,
    upstream_proxy: null,
    wiw_peers: null,
    log_level: null,
    perf: null,
    capture_mode: "proxy",
    dns_mode: "forward",
    tun_address: "10.0.0.2/24",
    tun_dns: "8.8.8.8",
    dns_servers: null,
    route_block: [],
    route_direct: [],
    route_sniff: true,
    route_sniff_ms: null,
    auto_reprovision: true,
    zt_team: null,
    zt_access_email: null,
    zt_access_id: null,
    zt_access_secret: null,
    zt_access_token: null,
    zt_gateway: false,
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

  connect: async () => {
    try {
      await invoke("connect", { profileOverride: get().profile });
    } catch (e) {
      // TODO(F2): replace String(e) with typed AppError {code,message}
      const message = String(e);
      // "Binary not found" (src-tauri/src/aether/mod.rs::resolve_binary) means
      // the tunnel engine itself can't run at all — structurally different
      // from a normal connection failure, so it routes to the full-screen
      // SidecarErrorScreen instead of the button's own error state.
      if (message.toLowerCase().includes("binary not found")) {
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

  reloadProfile: async () => {
    try {
      const profile = await invoke<ConnectionProfile>("get_default_profile");
      set({ profile });
    } catch (e) {
      // TODO(F2): typed error handling for reloadProfile
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

  const [unlistenStatus, unlistenLog] = await Promise.all([
    listen<ConnectionStatus>("aether://status", (e) => {
      const newState = e.payload.state;
      useConnectionStore.setState({
        status: e.payload,
        // Fresh attempt — last attempt's budget no longer applies.
        ...(e.payload.state === "Launching" ? { scanBudgetSecs: null } : {}),
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
  ]);

  // Reconcile state in case the window reopened mid-session, and load the
  // last-successful profile so the protocol selector reflects it. Neither
  // command touches the Aether binary, so a failure here is an IPC-layer
  // bug, not a sidecar problem — logged rather than shown as sidecarError.
  try {
    const [status, profile] = await Promise.all([
      invoke<ConnectionStatus>("get_status"),
      invoke<ConnectionProfile>("get_default_profile"),
    ]);
    useConnectionStore.setState({ status, profile });
  } catch (e) {
    console.error("Failed to load initial connection state:", e);
  }

  return () => {
    unlistenStatus();
    unlistenLog();
    if (flushTimer !== null) clearTimeout(flushTimer);
  };
}
