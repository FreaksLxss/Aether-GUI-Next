import { useEffect, useRef } from "react";
import { Check, Clock, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GlassAccordion } from "@/components/GlassAccordion";
import { useConnectionStore } from "@/state/connectionStore";
import type { ConnectionHistoryEntry } from "@/types/connection";

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function HistoryEntry({ entry }: { entry: ConnectionHistoryEntry }) {
  return (
    <li
      className="flex items-center justify-between rounded-md bg-black/10 px-2 py-1.5 text-xs"
      aria-label={`${entry.success ? "Connected" : "Failed"} via ${entry.protocol}, ${entry.scan_mode} mode, lasted ${formatDuration(entry.duration_secs)}`}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`inline-flex size-3.5 items-center justify-center rounded-full ${
            entry.success ? "bg-status-connected/15 text-status-connected" : "bg-status-error/15 text-status-error"
          }`}
        >
          {entry.success ? <Check size={8} strokeWidth={3} /> : <X size={8} strokeWidth={3} />}
        </span>
        <span className="capitalize text-foreground">{entry.protocol}</span>
        <span className="text-muted-foreground">·</span>
        <span className="capitalize text-muted-foreground">{entry.scan_mode}</span>
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock size={10} />
          {formatDuration(entry.duration_secs)}
        </span>
        <span className="text-[10px] text-muted-foreground/80">{formatTime(entry.timestamp)}</span>
      </div>
    </li>
  );
}

export function ConnectionHistory({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  const history = useConnectionStore((s) => s.history);
  const loadHistory = useConnectionStore((s) => s.loadHistory);
  const clearHistory = useConnectionStore((s) => s.clearHistory);
  const wasConnected = useRef(false);

  useEffect(() => {
    const unsub = useConnectionStore.subscribe((state) => {
      const wasConn = wasConnected.current;
      const isIdle = state.status.state === "Idle";
      const isConnected = state.status.state === "Connected";
      wasConnected.current = isConnected;
      if (wasConn && isIdle) loadHistory();
    });
    return unsub;
  }, [loadHistory]);

  useEffect(() => {
    if (open) loadHistory();
  }, [open, loadHistory]);

  return (
    <div className="w-full">
      <GlassAccordion
        icon={Clock}
        label="History"
        open={open}
        onToggle={onToggle}
        count={history.length}
      >
        <div className="flex flex-col gap-1.5">
          {history.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 py-3 text-muted-foreground">
              <Clock size={16} className="opacity-50" />
              <p className="text-xs">No connections yet.</p>
            </div>
          ) : (
            <>
              <ScrollArea className="max-h-48">
                <ul className="flex flex-col gap-1.5">
                  {history.map((entry, i) => (
                    <HistoryEntry key={`${entry.timestamp}-${i}`} entry={entry} />
                  ))}
                </ul>
              </ScrollArea>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void clearHistory()}
                className="mt-1 h-7 gap-1 text-xs text-muted-foreground hover:text-destructive"
              >
                <Trash2 size={12} />
                Clear history
              </Button>
            </>
          )}
        </div>
      </GlassAccordion>
    </div>
  );
}
