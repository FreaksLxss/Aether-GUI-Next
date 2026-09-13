import { ArrowDown, ArrowUp, Activity, AppWindow } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConnectionStore } from "@/state/connectionStore";
import { formatBytes, formatRate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSquircleClip } from "@/hooks/useSquircleMask";

// Always rendered (so MainScreen scroll stays stable). Shows — when idle,
// live rates + total when connected. iOS/macOS "squircle" — continuous
// curvature via useSquircleClip, not a circular border-radius. Reference card
// for whether the superellipse reads as native iOS on this surface.
export function TrafficStats({ onOpenActive }: { onOpenActive?: () => void }) {
  const traffic = useConnectionStore((s) => s.traffic);
  const isConnected = useConnectionStore((s) => s.status.state === "Connected");
  const activeCount = useConnectionStore((s) => s.activeConns.length);
  const squircleRef = useSquircleClip(35);

  const txBytes = traffic?.tx_bytes ?? 0;
  const rxBytes = traffic?.rx_bytes ?? 0;
  const total = txBytes + rxBytes;
  const txRate = traffic?.tx_rate ?? 0;
  const rxRate = traffic?.rx_rate ?? 0;
  const hasTraffic = total > 0;

  return (
    <div
      ref={squircleRef}
      style={{ borderRadius: 35 }}
      className={cn(
        "flex w-full max-w-[320px] flex-col gap-2 bg-surface-2 px-3 py-2.5 ring-1 ring-border",
        // Squircle clip needs overflow hidden so inner content respects the
        // superellipse; ring is clipped to the path on fallback browsers.
        "overflow-hidden",
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
      <div className="flex items-center gap-1.5">
        <Activity size={11} className="shrink-0 text-muted-foreground/60" aria-hidden />
        <span className="text-[11px] font-medium tracking-widest uppercase text-muted-foreground/60">
          Network
        </span>
        {!isConnected ? (
          <span className="ml-auto text-[11px] text-muted-foreground/40">not connected</span>
        ) : (
          activeCount > 0 && (
            <span className="ml-auto text-[11px] tabular-nums text-muted-foreground/40">
              {activeCount} apps
            </span>
          )
        )}
        {onOpenActive && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onOpenActive}
                aria-label="Show active apps"
                className={cn(
                  "inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.10] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring light:bg-black/[0.06] light:ring-black/5 light:hover:bg-black/10",
                  !isConnected && activeCount === 0 ? "ml-2" : "ml-1.5",
                )}
              >
                <AppWindow size={12} className="text-muted-foreground" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent>Active apps — per-app connections</TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 font-mono text-[11px] tabular-nums">
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <ArrowUp size={10} className="shrink-0" aria-hidden /> {isConnected ? formatRate(txRate) : "—"}
        </span>
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <ArrowDown size={10} className="shrink-0" aria-hidden /> {isConnected ? formatRate(rxRate) : "—"}
        </span>
        <span className={cn("inline-flex items-center gap-1", hasTraffic ? "text-foreground/90" : "text-muted-foreground/60")}>
          Σ {isConnected ? formatBytes(total) : "—"}
        </span>
      </div>
    </div>
  );
}
