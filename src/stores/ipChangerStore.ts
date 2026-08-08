import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { LogLine, PublicInfo } from "@/types/connection";
import type { AutoRotateConfig, TorSocksAddr, TorStatus } from "@/types/ipChanger";

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

/** Parse Tor's own bootstrap progress out of its stdout ("Bootstrapped 30%
 * (loading_status): ..."). Returns null for non-bootstrap lines. */
function bootstrapFromLine(line: string): { percent: number; phase: string } | null {
  const m = BOOT_RE.exec(line);
  if (!m) return null;
  return { percent: Number(m[1]), phase: m[2] };
}

interface IpChangerState {
  status: "stopped" | "starting" | "running" | "stopping" | "error";
  error: string | null;
  /** Current egress IP seen through Tor's SOCKS5 proxy (null while stopped
   * or before the first successful lookup). */
  currentIp: PublicInfo | null;
  /** Tor's reported bootstrap progress, parsed live from its log. null when
   * not running or fully bootstrapped. */
  bootstrapPercent: number | null;
  /** Human phase name of the current bootstrap step. */
  bootstrapPhase: string | null;
  /** Last probe-diagnosis string we emitted, so repeated identical failures
   * don't spam the log on every poll. */
  _lastProbeNote: string | null;
  ipChecking: boolean;
  binaryAvailable: boolean;
  logs: LogLine[];
  /** True while the NEWNYM command is in flight. */
  rotating: boolean;
  /** True while a start/stop command blocks the backend worker. */
  transitioning: boolean;
  /** ms epoch of the last successful IP rotation, or null before any. */
  lastRotatedAt: number | null;
  /** Cumulative NEWNYM count this session, for the little rotation counter. */
  rotationCount: number;
  autoRotateEnabled: boolean;
  autoRotateIntervalSecs: number;
  /** Effective SOCKS host+port shown in the copyable chip. */
  socksAddr: TorSocksAddr;
  /** Bind the SOCKS listener to all interfaces (LAN access) vs loopback. */
  lanEnabled: boolean;
  /** True when the IP-changer owns the Windows system proxy right now. */
  ipProxyEnabled: boolean;
  logLine: (line: string) => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  rotate: () => Promise<void>;
  refreshIp: () => Promise<void>;
  setAutoRotate: (enabled: boolean, intervalSecs?: number) => Promise<void>;
  setLan: (enabled: boolean) => Promise<void>;
  /** Turn the system proxy on/off for the IP-changeer. Returns the error
   * message on conflict (another proxy already owned) so the UI can warn. */
  setIpProxy: (enabled: boolean) => Promise<string | null>;
  /** Re-read status + config from the backend the first time the section is
   * opened, and resolve the bundled Tor binary. */
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
      // NEWNYM takes a few seconds to complete — poll the new exit IP after
      // a short delay so the displayed address actually changes.
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
        // Successful — the exit is reachable. Clear the generic hint.
        set({ currentIp: info, error: null, _lastProbeNote: null });
      } else {
        // No exit IP yet: Tor is almost certainly still bootstrapping or the
        // probe raced a NEWNYM. Surface a log line *once per distinct
        // diagnosis* (not every 10s poll) so the user sees what's blocking.
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
      // Transient (API hiccup) — keep last value; poller retries.
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

  refreshAll: async () => {
    try {
      const [status, auto, binary, socks, lan, proxy] = await Promise.all([
        invoke<TorStatus>("get_tor_status"),
        invoke<AutoRotateConfig>("get_auto_rotate"),
        invoke<boolean>("tor_binary_exists"),
        invoke<TorSocksAddr>("get_socks_addr"),
        invoke<boolean>("get_tor_lan"),
        invoke<{ enabled: boolean; owner: string } | null>("get_system_proxy_state").catch(
          () => null,
        ),
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
      });
      await get().refreshIp();
    } catch (e) {
      console.error("Failed to load IP changer state:", e);
    }
  },

  clearLogs: () => set({ logs: [] }),
}));

/** Subscribes to the backend's Tor status + log events for the app's whole
 * life (the events don't depend on the panel being open). */
export async function initIpChangerListeners(): Promise<() => void> {
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
        // Progress line from Tor itself — mirror it into the state so the
        // panel can render a live bootstrap bar.
        ...(boot ? { bootstrapPercent: boot.percent, bootstrapPhase: boot.phase } : {}),
        // With bootstrap handshake/guard steps reported by Tor, the exit IP
        // probe competing against them should hang tight and just poll.
        ...(boot ? { _lastProbeNote: null } : {}),
      });
      // The moment Tor flips to 100%, an exit circuit is usable — kick a
      // probe right away instead of waiting the whole poll interval.
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