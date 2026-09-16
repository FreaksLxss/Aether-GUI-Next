import { ArrowDown, ArrowUp, Activity, Network, AppWindow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConnectionStore } from "@/state/connectionStore";
import { formatBytes, formatRate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ScanMode, IpVersion } from "@/types/connection";

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

/** Premium single card merging traffic stats + connection info. */
export function TrafficStats({ onOpenActive }: { onOpenActive?: () => void }) {
  const traffic = useConnectionStore((s) => s.traffic);
  const status = useConnectionStore((s) => s.status);
  const profile = useConnectionStore((s) => s.profile);
  const activeCount = useConnectionStore((s) => s.activeConns.length);
  const isConnected = status.state === "Connected";

  const txBytes = traffic?.tx_bytes ?? 0;
  const rxBytes = traffic?.rx_bytes ?? 0;
  const total = txBytes + rxBytes;
  const txRate = traffic?.tx_rate ?? 0;
  const rxRate = traffic?.rx_rate ?? 0;
  const hasTraffic = total > 0;

  const addr = isConnected && "socks_addr" in status ? status.socks_addr : "127.0.0.1:1819";
  const protocol = profile.protocol === "auto" ? "MASQUE" : profile.protocol.toUpperCase();
  const scanMode = SCAN_LABELS[profile.scan_mode];
  const ipVersion = IP_LABELS[profile.ip_version];
  const firewallLabel =
    profile.masque_noize.charAt(0).toUpperCase() + profile.masque_noize.slice(1);
  const showTun = profile.capture_mode === "tun" || profile.capture_mode === "both";

  return (
    <div
      style={{ borderRadius: 35 }}
      className={cn(
        "flex w-full max-w-[320px] flex-col gap-3 bg-surface-2 px-5 py-4 ring-1 ring-border overflow-clip",
        !isConnected && "opacity-60",
      )}
      role="status"
      aria-live="polite"
      aria-label={
        isConnected
          ? `Upload ${formatRate(txRate)}, download ${formatRate(rxRate)}, total ${formatBytes(total)}`
          : "Network statistics — not connected"
      }
    >
      {/* ── Stats row ── */}
      <div className="flex items-center gap-4 font-mono text-[11px] tabular-nums">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <ArrowUp size={10} className="shrink-0" aria-hidden />
          <span>{isConnected ? formatRate(txRate) : "—"}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <ArrowDown size={10} className="shrink-0" aria-hidden />
          <span>{isConnected ? formatRate(rxRate) : "—"}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 font-medium border-l border-border/20 pl-4 text-foreground/80">
          <span>Σ</span>
          <span>{isConnected ? formatBytes(total) : "—"}</span>
        </span>
      </div>

      {isConnected ? (
        <>
          {/* ── Connection row ── */}
          <div className="flex flex-wrap items-center gap-2.5 font-mono text-[11px]">
            <span className="flex shrink-0 items-center gap-1.5 text-primary">
              <Activity size={9} className="shrink-0" aria-hidden />
              {addr}
            </span>
            <Badge variant="secondary" className="shrink-0 px-2 py-0.5 text-[11px]">
              {protocol}
            </Badge>
            <span className="shrink-0 text-muted-foreground/60">{scanMode}</span>
            {showTun && (
              <Badge
                variant="outline"
                className="shrink-0 gap-1 border-primary/25 px-2 py-0.5 text-[11px] text-primary"
              >
                <Network size={9} className="shrink-0" aria-hidden />
                TUN
              </Badge>
            )}
          </div>

          {/* ── Metadata + action row ── */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground/50">
              <span>{firewallLabel}</span>
              <span className="h-3 w-px shrink-0 bg-border/30" />
              <span>{ipVersion}</span>
              <span className="h-3 w-px shrink-0 bg-border/30" />
              <span>{activeCount} apps</span>
            </div>
            {onOpenActive && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onOpenActive}
                    aria-label="Show active apps"
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.10] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring light:bg-black/[0.06] light:ring-black/5 light:hover:bg-black/10"
                  >
                    <AppWindow size={12} className="text-muted-foreground" aria-hidden />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Active apps — per-app connections</TooltipContent>
              </Tooltip>
            )}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-1.5">
          <Activity size={11} className="shrink-0 text-muted-foreground/60" aria-hidden />
          <span className="text-[11px] text-muted-foreground/40">not connected</span>
        </div>
      )}
    </div>
  );
}
