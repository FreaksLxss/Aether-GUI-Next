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
  EnginePsiphonMode,
  EnginePsiphonStatus,
  PsiphonShape,
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
  }
}

interface ConnectionState {
  status: ConnectionStatus;
  engineTorStatus: EngineTorStatus;
  enginePsiphonStatus: EnginePsiphonStatus;
  profile: ConnectionProfile;
  logs: LogLine[];
  sidecarError: string | null;
  scanBudgetSecs: number | null;
  history: ConnectionHistoryEntry[];
  publicIp: PublicInfo | null;
  directIp: PublicInfo | null;
  publicIpLoading: boolean;
  publicIpLatencyMs: number | null;
  publicIpHistory: number[];
  leakStatus: "none" | "leak" | "unavailable";
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
  setEngineTorRelays: (engine_tor_relays: string | null) => void;
  setEngineTorRelayPorts: (engine_tor_relay_ports: "web" | "any" | null) => void;
  setEnginePsiphonMode: (engine_psiphon_mode: EnginePsiphonMode) => void;
  setEnginePsiphonBind: (engine_psiphon_bind: string | null) => void;
  setPsiphonShape: (psiphon_shape: PsiphonShape) => void;
  setPsiphonRegion: (psiphon_region: string | null) => void;
  setExitLoc: (exit_loc: string | null) => void;
  setExitLocSecs: (exit_loc_secs: number | null) => void;
  setStats: (stats: boolean) => void;
  setStatsSecs: (stats_secs: number | null) => void;
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
  runPublicIpCheck: () => Promise<void>;
  refreshActiveConns: () => Promise<void>;
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
  enginePsiphonStatus: { enabled: false, ready: false, address: null },
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
      const message = String(e);
      if (/binary not found|engine incompatible|engine_incompatible/i.test(message)) {
        set({ sidecarError: message });
      } else if (/already running/i.test(message)) {
      } else {
        set({ status: { state: "Error", message, phase: "launching" } });
      }
    }
  },

  disconnect: async () => {
    try {
      await invoke("disconnect");
    } catch {
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
  setEngineTorRelays: (engine_tor_relays) => { set((s) => ({ profile: { ...s.profile, engine_tor_relays } })); schedulePersist(); },
  setEngineTorRelayPorts: createPersistSetter("engine_tor_relay_ports"),
  setEnginePsiphonMode: createPersistSetter("engine_psiphon_mode"),
  setEnginePsiphonBind: (engine_psiphon_bind) => { set((s) => ({ profile: { ...s.profile, engine_psiphon_bind } })); schedulePersist(); },
  setPsiphonShape: createPersistSetter("psiphon_shape"),
  setPsiphonRegion: (psiphon_region) => { set((s) => ({ profile: { ...s.profile, psiphon_region } })); schedulePersist(); },
  setExitLoc: (exit_loc) => { set((s) => ({ profile: { ...s.profile, exit_loc } })); schedulePersist(); },
  setExitLocSecs: (exit_loc_secs) => { set((s) => ({ profile: { ...s.profile, exit_loc_secs } })); schedulePersist(); },
  setStats: createPersistSetter("stats"),
  setStatsSecs: (stats_secs) => { set((s) => ({ profile: { ...s.profile, stats_secs } })); schedulePersist(); },
  setEngineTorPt: (engine_tor_pt) => { set((s) => ({ profile: { ...s.profile, engine_tor_pt } })); schedulePersist(); },
  setEngineTorPtDir: (engine_tor_pt_dir) => { set((s) => ({ profile: { ...s.profile, engine_tor_pt_dir } })); schedulePersist(); },
  setEngineTorCountry: (engine_tor_country) => { set((s) => ({ profile: { ...s.profile, engine_tor_country } })); schedulePersist(); },
  setEngineTorDirectSecs: (engine_tor_direct_secs) => { set((s) => ({ profile: { ...s.profile, engine_tor_direct_secs } })); schedulePersist(); },
  setEngineTorStallSecs: (engine_tor_stall_secs) => { set((s) => ({ profile: { ...s.profile, engine_tor_stall_secs } })); schedulePersist(); },
  setMaxClients: (max_clients) => { set((s) => ({ profile: { ...s.profile, max_clients } })); schedulePersist(); },
  setHalfCloseSecs: (half_close_secs) => { set((s) => ({ profile: { ...s.profile, half_close_secs } })); schedulePersist(); },
  setTcpKeepaliveSecs: (tcp_keepalive_secs) => { set((s) => ({ profile: { ...s.profile, tcp_keepalive_secs } })); schedulePersist(); },
  setTcpConnectSecs: (tcp_connect_secs) => { set((s) => ({ profile: { ...s.profile, tcp_connect_secs } })); schedulePersist(); },

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

if (import.meta.env.DEV) {
  (window as unknown as { __conn?: typeof useConnectionStore }).__conn = useConnectionStore;
}

const BUDGET_RE = /budget=(\d+)s/;

export async function initConnectionListeners(): Promise<() => void> {
  if (!isTauriEnvStore()) return () => {};
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

  let lastNotifiedState: string | null = useConnectionStore.getState().status.state;

  let torStatusReceived = false;
  let psiphonStatusReceived = false;
  const [unlistenStatus, unlistenLog, unlistenTraffic, unlistenTorStatus, unlistenPsiphonStatus] = await Promise.all([
    listen<ConnectionStatus>("aether://status", (e) => {
      const newState = e.payload.state;
      useConnectionStore.setState({
        status: e.payload,
        ...(e.payload.state === "Launching" ? { scanBudgetSecs: null, traffic: null, activeConns: [] } : {}),
        ...(e.payload.state === "Idle" || e.payload.state === "Error" ? { traffic: null, activeConns: [] } : {}),
      });

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
    listen<EnginePsiphonStatus>("aether://psiphon-status", (e) => {
      psiphonStatusReceived = true;
      useConnectionStore.setState({ enginePsiphonStatus: e.payload });
    }),
  ]);

  try {
    const [status, profile, traffic, engineTorStatus, enginePsiphonStatus] = await Promise.all([
      invoke<ConnectionStatus>("get_status"),
      invoke<ConnectionProfile>("get_default_profile"),
      invoke<TrafficStats>("get_traffic_stats").catch(() => null as TrafficStats | null),
      invoke<EngineTorStatus>("get_engine_tor_status").catch(() => null),
      invoke<EnginePsiphonStatus>("get_engine_psiphon_status").catch(() => null),
    ]);
    useConnectionStore.setState({
      status,
      profile: connectionProfileSchema.parse(profile),
      ...(traffic ? { traffic } : {}),
      ...(!torStatusReceived && engineTorStatus ? { engineTorStatus } : {}),
      ...(!psiphonStatusReceived && enginePsiphonStatus ? { enginePsiphonStatus } : {}),
    });
  } catch (e) {
    console.error("Failed to load initial connection state:", e);
  }

  return () => {
    unlistenStatus();
    unlistenLog();
    unlistenTraffic();
    unlistenTorStatus();
    unlistenPsiphonStatus();
    if (flushTimer !== null) clearTimeout(flushTimer);
  };
}
