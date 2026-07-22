import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { useConnectionStore } from "@/state/connectionStore";

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

/**
 * Compact connection info bar shown when connected — displays protocol,
 * address, and uptime.
 */
export function ConnectionInfo() {
  const status = useConnectionStore((s) => s.status);
  const profile = useConnectionStore((s) => s.profile);

  const connectedAt = status.state === "Connected" ? status.connected_at_ms : null;
  const uptime = useElapsed(connectedAt);

  if (status.state !== "Connected") return null;

  const addr = "socks_addr" in status ? status.socks_addr : "127.0.0.1:1819";
  const protocol = profile.protocol === "auto" ? "MASQUE" : profile.protocol.toUpperCase();

  return (
    <div className="flex items-center gap-3 rounded-md bg-black/20 px-3 py-1.5 text-[10px] font-mono text-muted-foreground ring-1 ring-white/10">
      <span className="flex items-center gap-1">
        <Activity size={10} className="text-status-connected" />
        {addr}
      </span>
      <span className="text-muted-foreground/40">·</span>
      <span>{protocol}</span>
      <span className="text-muted-foreground/40">·</span>
      <span className="text-status-connected">{uptime}</span>
    </div>
  );
}
