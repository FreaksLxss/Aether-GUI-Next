import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { useConnectionStore } from "@/state/connectionStore";
import type { ScanMode, IpVersion, MasqueNoize, WgNoize } from "@/types/connection";

function useElapsed(sinceMs: number | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (sinceMs == null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sinceMs]);
  if (sinceMs == null) return "";
  const total = Math.max(0, Math.floor((now - sinceMs) / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

const SCAN_LABELS: Record<ScanMode, string> = {
  turbo: "Turbo",
  balanced: "Balanced",
  thorough: "Thorough",
  stealth: "Stealth",
  ironclad: "Ironclad",
};

const IP_LABELS: Record<IpVersion, string> = {
  v4: "IPv4",
  v6: "IPv6",
  both: "IPv4+6",
};

function getObfuscationLabel(
  protocol: string,
  masqueNoize: MasqueNoize,
  wgNoize: WgNoize,
): string {
  if (protocol === "wireguard" || protocol === "gool") {
    return wgNoize === "off" ? "None" : wgNoize.charAt(0).toUpperCase() + wgNoize.slice(1);
  }
  return masqueNoize === "off" ? "None" : masqueNoize.toUpperCase();
}

/**
 * Compact connection info bar shown when connected — displays protocol,
 * address, uptime, scan mode, obfuscation, and IP version.
 */
export function ConnectionInfo() {
  const status = useConnectionStore((s) => s.status);
  const profile = useConnectionStore((s) => s.profile);

  const connectedAt = status.state === "Connected" ? status.connected_at_ms : null;
  const uptime = useElapsed(connectedAt);

  if (status.state !== "Connected") return null;

  const addr = "socks_addr" in status ? status.socks_addr : "127.0.0.1:1819";
  const protocol = profile.protocol === "auto" ? "MASQUE" : profile.protocol.toUpperCase();
  const scanMode = SCAN_LABELS[profile.scan_mode];
  const ipVersion = IP_LABELS[profile.ip_version];
  const obfuscation = getObfuscationLabel(profile.protocol, profile.masque_noize, profile.wg_noize);

  return (
    <div className="flex flex-col gap-1.5 rounded-md bg-black/20 px-3 py-1.5 text-[10px] font-mono text-muted-foreground ring-1 ring-white/10">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <Activity size={10} className="text-primary" />
          {addr}
        </span>
        <span className="text-muted-foreground/40">·</span>
        <span>{protocol}</span>
        <span className="text-muted-foreground/40">·</span>
        <span className="text-primary">{uptime}</span>
      </div>
      <div className="h-px bg-white/5" />
      <div className="flex items-center justify-center gap-3 text-muted-foreground/70">
        <span>{scanMode}</span>
        <span className="text-muted-foreground/30">·</span>
        <span>{obfuscation}</span>
        <span className="text-muted-foreground/30">·</span>
        <span>{ipVersion}</span>
      </div>
    </div>
  );
}
