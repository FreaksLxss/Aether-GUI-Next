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
  setLogLevel: (log_level: LogLevel | null) => void;
  setPerf: (perf: PerfLevel | null) => void;
  setCaptureMode: (capture_mode: CaptureMode) => void;
  setDnsMode: (dns_mode: DnsMode) => void;
  setTunAddress: (tun_address: string) => void;
  setTunDns: (tun_dns: string) => void;
  setDnsServers: (dns_servers: string | null) => void;
  setRouteBlock: (route_block: string[]) => void;
  setRouteDirect: (route_direct: string[]) => void;
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

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  status: { state: "Idle" },
  profile: {
    protocol: "auto",
    scan_mode: "balanced",
    ip_version: "v4",
    quick_reconnect: true,
    masque_http2: false,
    masque_noize: "firewall",
    wg_noize: "balanced",
    bind_address: "127.0.0.1:1819",
    http_proxy_address: null,
    log_level: null,
    perf: null,
    capture_mode: "proxy",
    dns_mode: "forward",
    tun_address: "10.0.0.2/24",
    tun_dns: "8.8.8.8",
    dns_servers: null,
    route_block: [],
    route_direct: [],
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
  leakStatus: "unavailable",

  connect: async () => {
    try {
      await invoke("connect", { profileOverride: get().profile });
    } catch (e) {
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
      // Backend rejects disconnect() when there's nothing to stop (already
      // Idle) — nothing for the UI to do since status already reflects that.
    }
  },

  setProtocol: (protocol) =>
    set((s) => ({ profile: { ...s.profile, protocol } })),

  setScanMode: (scan_mode) =>
    set((s) => ({ profile: { ...s.profile, scan_mode } })),

  setIpVersion: (ip_version) =>
    set((s) => ({ profile: { ...s.profile, ip_version } })),

  setQuickReconnect: (quick_reconnect) =>
    set((s) => ({ profile: { ...s.profile, quick_reconnect } })),

  setMasqueHttp2: (masque_http2) =>
    set((s) => ({ profile: { ...s.profile, masque_http2 } })),

  setMasqueNoize: (masque_noize) =>
    set((s) => ({ profile: { ...s.profile, masque_noize } })),

  setWgNoize: (wg_noize) =>
    set((s) => ({ profile: { ...s.profile, wg_noize } })),

  setBindAddress: (bind_address) =>
    set((s) => ({ profile: { ...s.profile, bind_address } })),

  setHttpProxyAddress: (http_proxy_address) =>
    set((s) => ({ profile: { ...s.profile, http_proxy_address } })),

  setLogLevel: (log_level) =>
    set((s) => ({ profile: { ...s.profile, log_level } })),

  setPerf: (perf) =>
    set((s) => ({ profile: { ...s.profile, perf } })),

  setCaptureMode: (capture_mode) =>
    set((s) => ({ profile: { ...s.profile, capture_mode } })),

  setDnsMode: (dns_mode) =>
    set((s) => ({ profile: { ...s.profile, dns_mode } })),

  setTunAddress: (tun_address) =>
    set((s) => ({ profile: { ...s.profile, tun_address } })),

  setTunDns: (tun_dns) =>
    set((s) => ({ profile: { ...s.profile, tun_dns } })),

  setDnsServers: (dns_servers) =>
    set((s) => ({ profile: { ...s.profile, dns_servers } })),

  setRouteBlock: (route_block) =>
    set((s) => ({ profile: { ...s.profile, route_block } })),

  setRouteDirect: (route_direct) =>
    set((s) => ({ profile: { ...s.profile, route_direct } })),

  setZtTeam: (zt_team) =>
    set((s) => ({ profile: { ...s.profile, zt_team } })),

  setZtAccessEmail: (zt_access_email) =>
    set((s) => ({ profile: { ...s.profile, zt_access_email } })),

  setZtAccessId: (zt_access_id) =>
    set((s) => ({ profile: { ...s.profile, zt_access_id } })),

  setZtAccessSecret: (zt_access_secret) =>
    set((s) => ({ profile: { ...s.profile, zt_access_secret } })),

  setZtAccessToken: (zt_access_token) =>
    set((s) => ({ profile: { ...s.profile, zt_access_token } })),

  setZtGateway: (zt_gateway) =>
    set((s) => ({ profile: { ...s.profile, zt_gateway } })),

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
    const connected = get().status.state === "Connected";
    set({ publicIpLoading: true });
    const [tunnel, direct] = await Promise.all([
      invoke<PublicInfo | null>("get_public_ip", {
        throughTunnel: connected,
      }).catch(() => null),
      invoke<PublicInfo | null>("get_public_ip", {
        throughTunnel: false,
      }).catch(() => null),
    ]);

    let leakStatus: "none" | "leak" | "unavailable" = "unavailable";
    if (connected && tunnel) {
      if (direct) {
        // If a remote host sees the same address with and without the proxy,
        // the tunnel isn't masking this traffic.
        leakStatus = tunnel.ip === direct.ip ? "leak" : "none";
      } else {
        // Exit resolved but the direct baseline failed — can't compare, but
        // the tunnel is demonstrably working so don't alarm the user.
        leakStatus = "none";
      }
    }

    set({ publicIp: tunnel, directIp: direct, publicIpLoading: false, leakStatus });
  },

  reloadProfile: async () => {
    const profile = await invoke<ConnectionProfile>("get_default_profile");
    set({ profile });
  },
}));

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
