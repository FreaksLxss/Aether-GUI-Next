import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

function isTauriEnvStore(): boolean {
  try {
    const w = window as unknown as Record<string, unknown>;
    return !!w.__TAURI_INTERNALS__ || !!w.__TAURI__ || !!w.__TAURI_IPC__;
  } catch { return false; }
}
import { listen } from "@tauri-apps/api/event";
import type { LogLine, PublicInfo } from "@/types/connection";
import type { AutoRotateConfig, TorSourceInfo, TorSocksAddr, TorStatus } from "@/types/ipChanger";

const MAX_LOG_LINES = 400;

function mapStatus(s: TorStatus): {
  status: "stopped" | "starting" | "running" | "stopping" | "error";
  error: string | null;
} {
  switch (s.state) {
    case "Running":
      return { status: "running", error: null };
    case "Starting":
      return { status: "starting", error: null };
    case "Stopping":
      return { status: "stopping", error: null };
    case "Stopped":
      return { status: "stopped", error: null };
    case "Error":
      return { status: "error", error: s.message };
  }
}

const BOOT_RE = /Bootstrapped (\d+)% \((\w+)(?::|\))/;

function bootstrapFromLine(line: string): { percent: number; phase: string } | null {
  const m = BOOT_RE.exec(line);
  if (!m) return null;
  return { percent: Number(m[1]), phase: m[2] };
}

interface IpChangerState {
  status: "stopped" | "starting" | "running" | "stopping" | "error";
  error: string | null;
  currentIp: PublicInfo | null;
  bootstrapPercent: number | null;
  bootstrapPhase: string | null;
  _lastProbeNote: string | null;
  ipChecking: boolean;
  binaryAvailable: boolean;
  logs: LogLine[];
  rotating: boolean;
  transitioning: boolean;
  lastRotatedAt: number | null;
  rotationCount: number;
  autoRotateEnabled: boolean;
  autoRotateIntervalSecs: number;
  socksAddr: TorSocksAddr;
  lanEnabled: boolean;
  ipProxyEnabled: boolean;
  torEngine: TorSourceInfo;
  logLine: (line: string) => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  rotate: () => Promise<void>;
  refreshIp: () => Promise<void>;
  setAutoRotate: (enabled: boolean, intervalSecs?: number) => Promise<void>;
  setLan: (enabled: boolean) => Promise<void>;
  setIpProxy: (enabled: boolean) => Promise<string | null>;
  setTorEngine: (useSystem: boolean) => Promise<string | null>;
  refreshAll: () => Promise<void>;
  clearLogs: () => void;
}

export const useIpChangerStore = create<IpChangerState>((set, get) => ({
  status: "stopped",
  error: null,
  currentIp: null,
  bootstrapPercent: null,
  bootstrapPhase: null,
  _lastProbeNote: null,
  ipChecking: false,
  binaryAvailable: true,
  logs: [],
  rotating: false,
  transitioning: false,
  lastRotatedAt: null,
  rotationCount: 0,
  autoRotateEnabled: false,
  autoRotateIntervalSecs: 60,
  socksAddr: { host: "127.0.0.1", port: 9050 },
  lanEnabled: false,
  ipProxyEnabled: false,
  torEngine: {
    using_system: false,
    bundled_available: true,
    system_available: false,
    system_path: null,
  },

  logLine: (line) =>
    set((s) => ({
      logs: [
        ...s.logs.slice(-(MAX_LOG_LINES - 1)),
        { line, timestamp: Date.now() },
      ],
    })),

  start: async () => {
    try {
      set({ transitioning: true });
      await invoke("start_tor");
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ transitioning: false });
    }
  },

  stop: async () => {
    try {
      set({ transitioning: true });
      await invoke("stop_tor");
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ transitioning: false });
    }
  },

  rotate: async () => {
    set({ rotating: true });
    try {
      await invoke("rotate_ip");
      set((s) => ({
        lastRotatedAt: Date.now(),
        rotationCount: s.rotationCount + 1,
        error: null,
      }));
      setTimeout(() => void get().refreshIp(), 4000);
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ rotating: false });
    }
  },

  refreshIp: async () => {
    if (get().status !== "running") {
      set({ currentIp: null, ipChecking: false });
      return;
    }
    set({ ipChecking: true });
    try {
      const info = await invoke<PublicInfo | null>("get_current_ip");
      if (info) {
        set({ currentIp: info, error: null, _lastProbeNote: null });
      } else {
        const { bootstrapPercent } = get();
        const note =
          bootstrapPercent !== null && bootstrapPercent < 100
            ? `[tor] exit IP not reachable yet (tor bootstrapping ${bootstrapPercent}%)`
            : "[tor] exit IP lookup: no exit circuit yet — retrying…";
        if (get()._lastProbeNote !== note) {
          get().logLine(note);
          set({ _lastProbeNote: note });
        }
      }
    } catch {
    } finally {
      set({ ipChecking: false });
    }
  },

  setAutoRotate: async (enabled, intervalSecs) => {
    const secs = intervalSecs ?? get().autoRotateIntervalSecs;
    try {
      await invoke("set_auto_rotate", { intervalSecs: secs, enabled });
      set({ autoRotateEnabled: enabled, autoRotateIntervalSecs: secs });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  setLan: async (enabled) => {
    try {
      await invoke("set_tor_lan", { enabled });
      const socks = await invoke<TorSocksAddr>("get_socks_addr");
      set({ lanEnabled: enabled, socksAddr: socks });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  setIpProxy: async (enabled) => {
    try {
      await invoke("set_ip_proxy", { enabled });
      set({ ipProxyEnabled: enabled });
      return null;
    } catch (e) {
      const msg = String(e);
      set({ error: msg });
      return msg;
    }
  },

  setTorEngine: async (useSystem) => {
    try {
      await invoke("set_use_system_tor", { useSystem });
      set({
        torEngine: { ...get().torEngine, using_system: useSystem },
        error: null,
      });
      return null;
    } catch (e) {
      const msg = String(e);
      set({ error: msg });
      return msg;
    }
  },

  refreshAll: async () => {
    try {
      const [status, auto, binary, socks, lan, proxy, engine] = await Promise.all([
        invoke<TorStatus>("get_tor_status"),
        invoke<AutoRotateConfig>("get_auto_rotate"),
        invoke<boolean>("tor_binary_exists"),
        invoke<TorSocksAddr>("get_socks_addr"),
        invoke<boolean>("get_tor_lan"),
        invoke<{ enabled: boolean; owner: string } | null>("get_system_proxy_state").catch(
          () => null,
        ),
        invoke<TorSourceInfo>("get_tor_source").catch(() => null),
      ]);
      const mapped = mapStatus(status);
      set({
        ...mapped,
        binaryAvailable: binary,
        autoRotateEnabled: auto.enabled,
        autoRotateIntervalSecs: auto.interval_secs,
        socksAddr: socks,
        lanEnabled: lan,
        ipProxyEnabled: proxy?.owner === "ip_changer" ? true : false,
        ...(engine ? { torEngine: engine } : {}),
      });
      await get().refreshIp();
    } catch (e) {
      console.error("Failed to load IP changer state:", e);
    }
  },

  clearLogs: () => set({ logs: [] }),
}));

export async function initIpChangerListeners(): Promise<() => void> {
  if (!isTauriEnvStore()) return () => {};
  const [unlistenStatus, unlistenLog] = await Promise.all([
    listen<TorStatus>("ip-changer://status", (e) => {
      const mapped = mapStatus(e.payload);
      const staleIp =
        e.payload.state === "Stopped" || e.payload.state === "Error"
          ? { currentIp: null, bootstrapPercent: null, bootstrapPhase: null, _lastProbeNote: null }
          : {};
      useIpChangerStore.setState({ ...mapped, ...staleIp });
    }),
    listen<LogLine>("ip-changer://log", (e) => {
      const s = useIpChangerStore.getState();
      const boot = bootstrapFromLine(e.payload.line);
      useIpChangerStore.setState({
        logs: [...s.logs, e.payload].slice(-MAX_LOG_LINES),
        ...(boot ? { bootstrapPercent: boot.percent, bootstrapPhase: boot.phase } : {}),
        ...(boot ? { _lastProbeNote: null } : {}),
      });
      if (boot && boot.percent >= 100) {
        const g = useIpChangerStore.getState();
        if (g.status === "running") {
          void g.refreshIp();
        }
      }
    }),
  ]);
  return () => {
    unlistenStatus();
    unlistenLog();
  };
}