import { useState } from "react";
import { AppWindow, Hash } from "lucide-react";
import { useConnectionStore } from "@/state/connectionStore";
import { cn } from "@/lib/utils";

export function ActiveConnections({ compact }: { compact?: boolean }) {
  const isConnected = useConnectionStore((s) => s.status.state === "Connected");
  const conns = useConnectionStore((s) => s.activeConns);
  const [expanded, setExpanded] = useState(false);

  const est = conns.filter((c) => c.state === "ESTABLISHED");
  const show = expanded ? conns : est.length ? est : conns;
  const visible = show.slice(0, expanded ? 32 : 6);

  return (
    <div
      className={cn(
        compact
          ? "flex w-full flex-col gap-2"
          : "flex w-full max-w-[320px] flex-col gap-2 rounded-[35px] bg-surface-2 px-3 py-2.5 ring-1 ring-border",
        !compact && !isConnected && "opacity-60",
      )}
      style={{ borderRadius: 35 }}
      role="status"
      aria-label="Active connections"
    >
      {!compact && (
        <div className="flex items-center gap-1.5">
          <AppWindow size={11} className="shrink-0 text-muted-foreground/60" aria-hidden />
          <span className="text-[11px] font-medium tracking-widest uppercase text-muted-foreground/60">
            Active apps
          </span>
          {!isConnected ? (
            <span className="ml-auto text-[11px] text-muted-foreground/40">not connected</span>
          ) : (
            <span className="ml-auto text-[11px] tabular-nums text-muted-foreground/50">
              {conns.length} conns
            </span>
          )}
        </div>
      )}

      {!isConnected ? (
        <p className="text-[11px] text-muted-foreground/50">Connect to see per-app connections.</p>
      ) : visible.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/50">No active connections.</p>
      ) : (
        <div className={cn("flex flex-col gap-1", compact && "max-h-[42vh] overflow-y-auto pr-1")}>
          {visible.map((c, i) => (
            <div
              key={`${c.pid}-${c.local}-${c.remote}-${i}`}
              className="flex items-center gap-2 rounded-lg bg-surface-3 px-2 py-1.5 light:bg-black/[0.04]"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] tabular-nums text-foreground/80">
                {c.exe || "unknown"}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded bg-surface-4 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground light:bg-black/10">
                <Hash size={8} aria-hidden /> {c.pid}
              </span>
              <span className="hidden shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground sm:inline">
                {c.proto} {c.state || "—"}
              </span>
            </div>
          ))}
          {show.length > visible.length && (
            <span className="text-[11px] text-muted-foreground/50">+{show.length - visible.length} more</span>
          )}
        </div>
      )}

      {isConnected && conns.length > 6 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="self-start text-[11px] underline decoration-dotted underline-offset-2 text-muted-foreground hover:text-foreground"
        >
          {expanded ? "Show less" : "Show all"}
        </button>
      )}
    </div>
  );
}
