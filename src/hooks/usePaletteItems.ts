import { useMemo } from "react";
import {
  Bookmark,
  Clock,
  Cloud,
  Copy,
  Download,
  ExternalLink,
  EyeOff,
  Globe,
  Gauge,
  HardDrive,
  Layers,
  Link,
  MapPin,
  Monitor,
  Network,
  Palette,
  Pin,
  Power,
  RefreshCw,
  Rocket,
  Settings,
  Settings2,
  Shield,
  Shuffle,
  Sparkles,
  SunMoon,
  Upload,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useConnectionStore } from "@/state/connectionStore";
import { useIpChangerStore } from "@/stores/ipChangerStore";
import { openLogWindow } from "@/lib/log-window";
import type { PaletteItem } from "@/components/CommandPalette";
import type { PanelId } from "@/components/AppMenu";

type Setter = (v: PanelId | null) => void;

function scrollToField(id: string) {
  requestAnimationFrame(() => {
    setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  });
}

const RECENT_KEY = "aether:palette:recent";
const PINNED_KEY = "aether:palette:pinned";

function getRecentIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}
export function recordPaletteRecent(id: string) {
  if (typeof window === "undefined") return;
  try {
    const cur = getRecentIds().filter((x) => x !== id);
    cur.unshift(id);
    localStorage.setItem(RECENT_KEY, JSON.stringify(cur.slice(0, 3)));
  } catch {
    // Recent actions are optional when local storage is unavailable.
  }
}
function getPinnedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch { return new Set(); }
}

function wrapRun(id: string, fn: () => void): () => void {
  return () => {
    recordPaletteRecent(id);
    fn();
  };
}

export function usePaletteItems(setPanel: Setter): PaletteItem[] {
  const status = useConnectionStore((s) => s.status);
  const profile = useConnectionStore((s) => s.profile);
  const logs = useConnectionStore((s) => s.logs);
  const leakStatus = useConnectionStore((s) => s.leakStatus);

  const connect = useConnectionStore((s) => s.connect);
  const disconnect = useConnectionStore((s) => s.disconnect);
  const setProtocol = useConnectionStore((s) => s.setProtocol);
  const setScanMode = useConnectionStore((s) => s.setScanMode);
  const setIpVersion = useConnectionStore((s) => s.setIpVersion);
  const setMasqueHttp2 = useConnectionStore((s) => s.setMasqueHttp2);
  const setMasqueNoize = useConnectionStore((s) => s.setMasqueNoize);
  const setWgNoize = useConnectionStore((s) => s.setWgNoize);
  const setLogLevel = useConnectionStore((s) => s.setLogLevel);
  const setPerf = useConnectionStore((s) => s.setPerf);
  const setQuickReconnect = useConnectionStore((s) => s.setQuickReconnect);
  const setAutoReprovision = useConnectionStore((s) => s.setAutoReprovision);
  const setRouteSniff = useConnectionStore((s) => s.setRouteSniff);
  const setCaptureMode = useConnectionStore((s) => s.setCaptureMode);
  const setDnsMode = useConnectionStore((s) => s.setDnsMode);
  const setZtGateway = useConnectionStore((s) => s.setZtGateway);
  const runPublicIpCheck = useConnectionStore((s) => s.runPublicIpCheck);

  const torStatus = useIpChangerStore((s) => s.status);
  const torStart = useIpChangerStore((s) => s.start);
  const torStop = useIpChangerStore((s) => s.stop);
  const torRotate = useIpChangerStore((s) => s.rotate);
  const torAuto = useIpChangerStore((s) => s.autoRotateEnabled);
  const setTorAuto = useIpChangerStore((s) => s.setAutoRotate);

  const locked = status.state !== "Idle" && status.state !== "Error";
  const connected = status.state === "Connected";
  const torRunning = torStatus === "running";

  return useMemo(() => {
    const items: PaletteItem[] = [];
    const openAdvanced = (fieldId?: string) => {
      setPanel("advanced");
      if (fieldId) scrollToField(fieldId);
    };
    const openSettings = (fieldId?: string) => {
      setPanel("settings");
      if (fieldId) scrollToField(fieldId);
    };

    // ── Panels (top-level nav) ────────────────────────────────────────────
    items.push(
      {
        id: "panel-advanced",
        label: "Advanced",
        hint: "Protocol · Proxy · Routing · Logs",
        keywords: "advanced protocol proxy routing logs behavior zero trust",
        group: "Panels",
        icon: Settings2,
        run: () => setPanel("advanced"),
      },
      {
        id: "panel-presets",
        label: "Presets",
        hint: "Save & apply profiles",
        keywords: "presets profiles save apply",
        group: "Panels",
        icon: Bookmark,
        run: () => setPanel("presets"),
      },
      {
        id: "panel-ipchanger",
        label: "IP Changer",
        hint: "Tor circuit & auto-rotate",
        keywords: "ip changer tor rotate circuit proxy socks",
        group: "Panels",
        icon: Globe,
        run: () => setPanel("ipchanger"),
      },
      {
        id: "panel-history",
        label: "History",
        hint: "Recent connections",
        keywords: "history connections sessions",
        group: "Panels",
        icon: Clock,
        run: () => setPanel("history"),
      },
      {
        id: "panel-settings",
        label: "Settings",
        hint: "System · Network · Appearance",
        keywords: "settings system network appearance theme tray autostart",
        group: "Panels",
        icon: Settings,
        run: () => setPanel("settings"),
      },
    );

    // ── Primary actions ───────────────────────────────────────────────────
    if (connected || status.state === "Connecting" || status.state === "Reconnecting" || status.state === "Launching") {
      items.push({
        id: "action-disconnect",
        label: "Disconnect",
        hint: "Stop the tunnel",
        keywords: "disconnect stop offline",
        group: "Actions",
        icon: Power,
        run: () => void disconnect(),
      });
    } else {
      items.push({
        id: "action-connect",
        label: connected ? "Connected" : "Connect",
        hint: locked ? "Busy…" : "Start the tunnel",
        keywords: "connect start online go tunnel",
        group: "Actions",
        icon: Power,
        run: () => void connect(),
      });
    }

    const socksAddr = connected && "socks_addr" in status ? (status.socks_addr as string) : "127.0.0.1:1819";
    items.push(
      {
        id: "action-copy-socks",
        label: "Copy SOCKS address",
        hint: socksAddr,
        keywords: "copy socks proxy address clipboard",
        group: "Actions",
        icon: Copy,
        run: () => void writeText(socksAddr),
      },
      {
        id: "action-copy-pac",
        label: "Copy PAC URL",
        hint: "Auto-config URL for browsers",
        keywords: "pac url proxy auto config",
        group: "Actions",
        icon: Link,
        run: () => {
          const pac = `function FindProxyForURL(url, host) { if (isInNet(host, "127.0.0.1", "255.0.0.0") || isInNet(host, "10.0.0.0", "255.0.0.0") || isInNet(host, "192.168.0.0", "255.255.0.0")) return "DIRECT"; return "SOCKS5 ${socksAddr}; DIRECT"; }`;
          void writeText(`data:application/x-ns-proxy-autoconfig,${encodeURIComponent(pac)}`);
        },
      },
      {
        id: "action-recheck-ip",
        label: leakStatus === "leak" ? "Re-check IP — leak detected" : "Re-check public IP",
        hint: "Refresh exit & direct IP",
        keywords: "recheck ip location leak public exit refresh",
        group: "Actions",
        icon: MapPin,
        run: () => void runPublicIpCheck(),
      },
      {
        id: "action-open-log",
        label: "Open full log window",
        hint: `${logs.length} lines`,
        keywords: "log window full open external",
        group: "Actions",
        icon: ExternalLink,
        run: () => openLogWindow(),
      },
    );

    // ── Tuning / Protocol (quick) ─────────────────────────────────────────
    const tunings: { id: string; label: string; mode: "turbo" | "balanced" | "thorough" | "stealth"; icon: typeof Zap; hint: string }[] = [
      { id: "turbo", label: "Tuning: Fast", mode: "turbo", icon: Zap, hint: "Scan mode Turbo" },
      { id: "balanced", label: "Tuning: Balanced", mode: "balanced", icon: Gauge, hint: "Scan mode Balanced" },
      { id: "thorough", label: "Tuning: Secure", mode: "thorough", icon: Shield, hint: "Scan mode Thorough" },
      { id: "stealth", label: "Tuning: Stealth", mode: "stealth", icon: EyeOff, hint: "Scan mode Stealth — hardest to fingerprint" },
    ];
    for (const t of tunings) {
      const active = profile.scan_mode === t.mode;
      items.push({
        id: `tuning-${t.id}`,
        label: active ? `${t.label} · active` : t.label,
        hint: t.hint,
        keywords: `tuning scan mode ${t.id} ${t.mode}`,
        group: "Protocol & tuning",
        icon: t.icon,
        run: () => void setScanMode(t.mode),
      });
    }
    // Include Ironclad as stealth-adjacent tuning
    if (profile.scan_mode === "ironclad") {
      items.push({
        id: "tuning-ironclad",
        label: "Tuning: Ironclad · active",
        hint: "Verifies each gateway with a real HTTP request",
        keywords: "tuning scan ironclad",
        group: "Protocol & tuning",
        icon: Shield,
        run: () => {},
      });
    }

    const protocols: { value: "auto" | "masque" | "wireguard" | "gool"; label: string; icon: typeof Sparkles }[] = [
      { value: "auto", label: "Protocol: Auto", icon: Sparkles },
      { value: "masque", label: "Protocol: MASQUE", icon: Cloud },
      { value: "wireguard", label: "Protocol: WireGuard", icon: Zap },
      { value: "gool", label: "Protocol: WARP-in-WARP", icon: Layers },
    ];
    for (const p of protocols) {
      const active = profile.protocol === p.value;
      items.push({
        id: `protocol-${p.value}`,
        label: active ? `${p.label} · active` : p.label,
        hint: p.value === "auto" ? "Aether picks best" : p.value === "masque" ? "Disguised as HTTPS" : p.value === "wireguard" ? "Lighter & faster" : "Double tunnel",
        keywords: `protocol ${p.value} ${p.label}`,
        group: "Protocol & tuning",
        icon: p.icon,
        run: () => void setProtocol(p.value),
      });
    }

    // ── Advanced: granular ────────────────────────────────────────────────
    const ipVersions: { v: "v4" | "v6" | "both"; label: string }[] = [
      { v: "v4", label: "IP version: IPv4" },
      { v: "v6", label: "IP version: IPv6" },
      { v: "both", label: "IP version: Both" },
    ];
    for (const iv of ipVersions) {
      items.push({
        id: `ipver-${iv.v}`,
        label: profile.ip_version === iv.v ? `${iv.label} · active` : iv.label,
        keywords: `ip version ${iv.v} ipv4 ipv6`,
        group: "Advanced",
        icon: Network,
        run: () => {
          if (!locked) void setIpVersion(iv.v); else toast.error("Disconnect first to change IP version");
          openAdvanced();
        },
      });
    }

    items.push(
      {
        id: "masque-http3",
        label: profile.masque_http2 ? "MASQUE: HTTP/3" : "MASQUE: HTTP/3 · active",
        hint: "QUIC over UDP",
        keywords: "masque http3 quic transport",
        group: "Advanced",
        icon: Network,
        run: () => {
          if (!locked) void setMasqueHttp2(false); else toast.error("Disconnect first to change transport");
          openAdvanced();
        },
      },
      {
        id: "masque-http2",
        label: profile.masque_http2 ? "MASQUE: HTTP/2 · active" : "MASQUE: HTTP/2",
        hint: "TCP — looks like ordinary HTTPS",
        keywords: "masque http2 tcp transport",
        group: "Advanced",
        icon: Network,
        run: () => {
          if (!locked) void setMasqueHttp2(true); else toast.error("Disconnect first to change transport");
          openAdvanced();
        },
      },
    );

    const noize = profile.protocol === "auto" || profile.protocol === "masque"
      ? (["firewall", "gfw", "light", "off"] as const).map((n) => ({
          id: `noize-${n}`,
          label: profile.masque_noize === n ? `Obfuscation: ${n} · active` : `Obfuscation: ${n}`,
          hint: n === "firewall" ? "Balanced default" : n === "gfw" ? "Heavier — for strict censors" : n,
          keywords: `noize obfuscation ${n} masque`,
          run: () => {
            if (!locked) void setMasqueNoize(n as typeof profile.masque_noize); else toast.error("Disconnect first to change this setting");
            openAdvanced();
          },
        }))
      : (["balanced", "aggressive", "light", "off"] as const).map((n) => ({
          id: `noize-wg-${n}`,
          label: profile.wg_noize === n ? `Obfuscation: ${n} · active` : `Obfuscation: ${n}`,
          keywords: `noize obfuscation ${n} wireguard`,
          hint: n,
          run: () => {
            if (!locked) void setWgNoize(n as typeof profile.wg_noize); else toast.error("Disconnect first to change this setting");
            openAdvanced();
          },
        }));
    for (const n of noize) {
      items.push({ id: n.id, label: n.label, hint: n.hint, keywords: n.keywords, group: "Advanced", icon: EyeOff, run: n.run });
    }

    items.push(
      {
        id: "field-socks",
        label: "SOCKS5 proxy address",
        hint: profile.bind_address || "127.0.0.1:1819",
        keywords: "socks proxy bind address port lan",
        group: "Network",
        icon: Network,
        run: () => openAdvanced("aether-field-socks-port"),
      },
      {
        id: "field-http-proxy",
        label: profile.http_proxy_address ? `HTTP proxy: ${profile.http_proxy_address}` : "HTTP proxy (disabled)",
        hint: "Optional HTTP CONNECT proxy",
        keywords: "http proxy http-connect",
        group: "Network",
        icon: Network,
        run: () => openAdvanced("aether-field-http-proxy"),
      },
      {
        id: "field-upstream",
        label: profile.upstream_proxy ? `Upstream: ${profile.upstream_proxy}` : "Upstream proxy (direct)",
        hint: "Chain behind another proxy",
        keywords: "upstream proxy chain socks http",
        group: "Network",
        icon: Network,
        run: () => openAdvanced("aether-field-upstream"),
      },
      {
        id: "field-dns",
        label: profile.dns_servers ? `Tunnel DNS: ${profile.dns_servers}` : "Tunnel DNS (default 1.1.1.1)",
        keywords: "dns tunnel resolver 1.1.1.1",
        group: "Network",
        icon: Globe,
        run: () => openAdvanced("aether-field-dns"),
      },
      {
        id: "field-route-block",
        label: "Route: Blocked",
        hint: (profile.route_block ?? []).join(", ") || "Nothing blocked",
        keywords: "route block blocked blacklist",
        group: "Routing",
        icon: Shield,
        run: () => openAdvanced("aether-field-route-block"),
      },
      {
        id: "field-route-direct",
        label: "Route: Direct (bypass tunnel)",
        hint: (profile.route_direct ?? []).join(", ") || "Nothing bypassed",
        keywords: "route direct bypass whitelist split",
        group: "Routing",
        icon: Shield,
        run: () => openAdvanced("aether-field-route-direct"),
      },
      {
        id: "toggle-sniff",
        label: profile.route_sniff ? "Domain sniffing: on" : "Domain sniffing: off",
        hint: "Read SNI/Host for route rules",
        keywords: "domain sniff sni host routing",
        group: "Routing",
        icon: EyeOff,
        run: () => {
          if (!locked) void setRouteSniff(!profile.route_sniff); else toast.error("Disconnect first to change this setting");
        },
      },
      {
        id: "field-sniff-ms",
        label: "Sniff wait",
        hint: profile.route_sniff_ms != null ? `${profile.route_sniff_ms} ms` : "Default",
        keywords: "sniff wait ms timeout",
        group: "Routing",
        icon: Clock,
        run: () => openAdvanced("aether-field-sniff-ms"),
      },
      {
        id: "field-wiw",
        label: profile.wiw_peers ? `WIW peers: ${profile.wiw_peers}` : "WIW endpoints (auto-scan)",
        hint: "WARP-in-WARP manual hops",
        keywords: "wiw warp in warp peers gool endpoints",
        group: "Routing",
        icon: Layers,
        run: () => openAdvanced("aether-field-wiw-peers"),
      },
      {
        id: "field-zt-team",
        label: profile.zt_team ? `Zero Trust team: ${profile.zt_team}` : "Zero Trust team (not enrolled)",
        keywords: "zero trust zt team cloudflare warp gateway",
        group: "Zero Trust",
        icon: Shield,
        run: () => openAdvanced("zt-team"),
      },
      {
        id: "toggle-zt-gateway",
        label: profile.zt_gateway ? "Gateway routing: on" : "Gateway routing: off",
        hint: "Route through Zero Trust Gateway",
        keywords: "gateway zero trust zt",
        group: "Zero Trust",
        icon: Shield,
        run: () => {
          if (!locked) void setZtGateway(!profile.zt_gateway); else toast.error("Disconnect first to change this setting");
        },
      },
    );

    // Zero Trust email/token fields as jumps
    items.push(
      {
        id: "field-zt-email",
        label: profile.zt_access_email ? `Access email: ${profile.zt_access_email}` : "Access email (headless enrolment)",
        keywords: "access email code otp",
        group: "Zero Trust",
        icon: Shield,
        run: () => openAdvanced("zt-email"),
      },
      {
        id: "toggle-quick-reconnect",
        label: profile.quick_reconnect ? "Quick reconnect: on" : "Quick reconnect: off",
        keywords: "quick reconnect remember gateway fast",
        group: "Behavior",
        icon: RefreshCw,
        run: () => {
          if (!locked) void setQuickReconnect(!profile.quick_reconnect); else toast.error("Disconnect first to change this setting");
        },
      },
      {
        id: "toggle-reprovision",
        label: profile.auto_reprovision ? "Auto re-provision: on" : "Auto re-provision: off",
        keywords: "auto reprovision re-provision register device",
        group: "Behavior",
        icon: RefreshCw,
        run: () => {
          if (!locked) void setAutoReprovision(!profile.auto_reprovision); else toast.error("Disconnect first to change this setting");
        },
      },
    );

    const logLevels: { v: string | null; label: string }[] = [
      { v: null, label: "Log level: Auto" },
      { v: "error", label: "Log level: Error" },
      { v: "warn", label: "Log level: Warn" },
      { v: "info", label: "Log level: Info" },
      { v: "debug", label: "Log level: Debug" },
      { v: "trace", label: "Log level: Trace" },
    ];
    for (const ll of logLevels) {
      const active = (profile.log_level ?? null) === ll.v;
      items.push({
        id: `loglevel-${ll.v ?? "auto"}`,
        label: active ? `${ll.label} · active` : ll.label,
        keywords: `log level ${ll.v ?? "auto"} verbosity`,
        group: "Behavior",
        icon: HardDrive,
        run: () => {
          if (!locked) void setLogLevel(ll.v as typeof profile.log_level); else toast.error("Disconnect first to change this setting");
          openAdvanced("aether-field-log-level");
        },
      });
    }

    const perfs: { v: string | null; label: string }[] = [
      { v: null, label: "Performance: Auto" },
      { v: "low", label: "Performance: Low" },
      { v: "medium", label: "Performance: Medium" },
      { v: "high", label: "Performance: High" },
    ];
    for (const pf of perfs) {
      const active = (profile.perf ?? null) === pf.v;
      items.push({
        id: `perf-${pf.v ?? "auto"}`,
        label: active ? `${pf.label} · active` : pf.label,
        keywords: `perf performance ${pf.v ?? "auto"}`,
        group: "Behavior",
        icon: Gauge,
        run: () => {
          if (!locked) void setPerf(pf.v as typeof profile.perf); else toast.error("Disconnect first to change this setting");
          openAdvanced("aether-field-perf");
        },
      });
    }

    // ── Settings ─────────────────────────────────────────────────────────
    const captureModes: { v: "proxy" | "tun" | "both"; label: string }[] = [
      { v: "proxy", label: "Capture: Proxy" },
      { v: "tun", label: "Capture: TUN" },
      { v: "both", label: "Capture: Both" },
    ];
    for (const cm of captureModes) {
      const active = profile.capture_mode === cm.v;
      items.push({
        id: `capture-${cm.v}`,
        label: active ? `${cm.label} · active` : cm.label,
        keywords: `capture mode ${cm.v} proxy tun both`,
        group: "Settings",
        icon: Monitor,
        run: () => {
          if (!locked) void setCaptureMode(cm.v); else toast.error("Disconnect first to change this setting");
          openSettings();
        },
      });
    }

    const dnsModes: { v: "forward" | "direct"; label: string }[] = [
      { v: "forward", label: "DNS: Forward (through proxy)" },
      { v: "direct", label: "DNS: Direct (system resolver)" },
    ];
    for (const dm of dnsModes) {
      const active = profile.dns_mode === dm.v;
      items.push({
        id: `dnsmode-${dm.v}`,
        label: active ? `${dm.label} · active` : dm.label,
        keywords: `dns mode ${dm.v} forward direct`,
        group: "Settings",
        icon: Globe,
        run: () => {
          if (!locked) void setDnsMode(dm.v); else toast.error("Disconnect first to change this setting");
          openSettings();
        },
      });
    }

    items.push(
      {
        id: "settings-always-on-top",
        label: "Always on top",
        hint: "Pin window above others",
        keywords: "always on top pin window overlay",
        group: "Settings",
        icon: Pin,
        run: () => openSettings(),
      },
      {
        id: "settings-autostart",
        label: "Launch at startup",
        hint: "Run when system boots",
        keywords: "autostart launch startup boot",
        group: "Settings",
        icon: Rocket,
        run: () => openSettings(),
      },
      {
        id: "settings-minimize-startup",
        label: "Minimize on startup",
        hint: "Start to tray",
        keywords: "minimize startup tray background",
        group: "Settings",
        icon: Monitor,
        run: () => openSettings(),
      },
      {
        id: "settings-close-tray",
        label: "Close to tray",
        hint: "Hide instead of quitting",
        keywords: "close tray hide quit exit",
        group: "Settings",
        icon: Monitor,
        run: () => openSettings(),
      },
      {
        id: "settings-theme",
        label: "Toggle theme",
        hint: "Switch dark / light",
        keywords: "theme dark light appearance color",
        group: "Settings",
        icon: SunMoon,
        run: () => {
          openSettings();
          // Also toggle immediately for power users
          const key = "aether-theme";
          const cur = localStorage.getItem(key);
          const next = cur === "light" ? "dark" : "light";
          localStorage.setItem(key, next);
          const root = document.documentElement;
          if (next === "dark") {
            root.classList.remove("light");
            root.classList.add("dark");
          } else {
            root.classList.remove("dark");
            root.classList.add("light");
          }
        },
      },
      {
        id: "settings-accent",
        label: "Accent color",
        hint: "Pick primary / secondary",
        keywords: "accent color palette theme primary secondary",
        group: "Settings",
        icon: Palette,
        run: () => openSettings(),
      },
      {
        id: "settings-export",
        label: "Export settings",
        hint: "Save profile & presets to JSON",
        keywords: "export save backup json profile presets",
        group: "Settings",
        icon: Download,
        run: () => openSettings(),
      },
      {
        id: "settings-import",
        label: "Import settings",
        hint: "Restore from JSON file",
        keywords: "import restore load json profile presets",
        group: "Settings",
        icon: Upload,
        run: () => openSettings(),
      },
      {
        id: "settings-update",
        label: "Check for updates",
        hint: "Download latest Aether",
        keywords: "update check version download latest upgrade",
        group: "Settings",
        icon: Download,
        run: () => openSettings(),
      },
    );

    // ── IP Changer ────────────────────────────────────────────────────────
    if (torRunning) {
      items.push(
        {
          id: "tor-stop",
          label: "Stop Tor",
          hint: "Shut down IP Changer",
          keywords: "tor stop ip changer quit",
          group: "IP Changer",
          icon: Power,
          run: () => void torStop(),
        },
        {
          id: "tor-rotate",
          label: "Rotate IP",
          hint: "New Tor circuit",
          keywords: "rotate ip tor circuit newnym shuffle",
          group: "IP Changer",
          icon: Shuffle,
          run: () => void torRotate(),
        },
      );
    } else {
      items.push({
        id: "tor-start",
        label: "Start Tor",
        hint: "Launch IP Changer",
        keywords: "tor start ip changer launch",
        group: "IP Changer",
        icon: Power,
        run: () => void torStart(),
      });
    }
    items.push(
      {
        id: "tor-auto-rotate",
        label: torAuto ? "Auto-rotate: on" : "Auto-rotate: off",
        hint: "Rotate exit IP on a timer",
        keywords: "auto rotate tor interval timer schedule",
        group: "IP Changer",
        icon: RefreshCw,
        run: () => {
          void setTorAuto(!torAuto);
        },
      },
      {
        id: "tor-open-panel",
        label: "IP Changer settings",
        hint: "SOCKS · Proxy · Tor engine",
        keywords: "tor socks proxy lan tor engine source",
        group: "IP Changer",
        icon: Globe,
        run: () => setPanel("ipchanger"),
      },
    );

    // Recents & pinned: surface last-used at top
    try {
      const pinned = getPinnedIds();
      const recents = getRecentIds();
      if (pinned.size > 0 || recents.length > 0) {
        const pinnedItems: typeof items = [];
        const recentItems: typeof items = [];
        const rest: typeof items = [];
        for (const it of items) {
          if (pinned.has(it.id)) pinnedItems.push({ ...it, group: "Pinned" });
          else if (recents.includes(it.id)) recentItems.push({ ...it, group: "Recent" });
          else rest.push(it);
        }
        // keep original order inside each bucket; recents ordered by recency
        recentItems.sort((a, b) => recents.indexOf(a.id) - recents.indexOf(b.id));
        // wrap runs to record recents
        const wrap = (arr: typeof items) => arr.map((it) => ({ ...it, run: wrapRun(it.id, it.run) }));
        const wrappedRest = wrap(rest);
        const wrappedRecent = wrap(recentItems);
        const wrappedPinned = wrap(pinnedItems);
        return [...wrappedPinned, ...wrappedRecent, ...wrappedRest];
      }
      // even without pinned/recents, wrap runs to record
      for (const it of items) {
        const orig = it.run;
        it.run = wrapRun(it.id, orig);
      }
    } catch {
      // Keep the default items when stored pins or recents cannot be applied.
    }

    // Sorting: Panels + Actions first, then the rest alphabetically by group.
    // Filtering already handles keyword matching; order here is the default view.
    return items;
  }, [
    status,
    profile,
    logs.length,
    leakStatus,
    torAuto,
    connect,
    disconnect,
    setProtocol,
    setScanMode,
    setIpVersion,
    setMasqueHttp2,
    setMasqueNoize,
    setWgNoize,
    setLogLevel,
    setPerf,
    setQuickReconnect,
    setAutoReprovision,
    setRouteSniff,
    setCaptureMode,
    setDnsMode,
    setZtGateway,
    runPublicIpCheck,
    torStart,
    torStop,
    torRotate,
    setTorAuto,
    locked,
    connected,
    torRunning,
    setPanel,
  ]);
}
