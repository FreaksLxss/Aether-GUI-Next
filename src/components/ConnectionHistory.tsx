import { useEffect, useRef, useState } from "react";
import { ChevronDown, Clock, Trash2 } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
          className={`inline-block size-1.5 rounded-full ${
            entry.success ? "bg-status-connected" : "bg-status-error"
          }`}
        />
        <span className="capitalize text-foreground">{entry.protocol}</span>
        <span className="text-muted-foreground">·</span>
        <span className="capitalize text-muted-foreground">{entry.scan_mode}</span>
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock size={10} />
          {formatDuration(entry.duration_secs)}
        </span>
        <span className="text-[10px]">{formatTime(entry.timestamp)}</span>
      </div>
    </li>
  );
}

export function ConnectionHistory() {
  const history = useConnectionStore((s) => s.history);
  const loadHistory = useConnectionStore((s) => s.loadHistory);
  const clearHistory = useConnectionStore((s) => s.clearHistory);
  const [open, setOpen] = useState(false);
  const wasConnected = useRef(false);

  // Auto-refresh history when a connection session ends (Connected -> Idle)
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
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary rounded-md">
          <Clock size={14} />
          History
          <span className="text-[10px] text-muted-foreground/60">
            ({history.length})
          </span>
          <ChevronDown
            size={14}
            className="transition-transform duration-150 data-[state=open]:rotate-180"
            data-state={open ? "open" : "closed"}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-1 data-[state=open]:duration-150 data-[state=open]:[animation-timing-function:cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-1 data-[state=closed]:duration-100">
          <div className="flex flex-col gap-1.5 pb-2">
            {history.length === 0 ? (
              <p className="py-2 text-center text-xs text-status-idle">
                No connections yet.
              </p>
            ) : (
              <>
                <ul className="flex flex-col gap-1.5">
                  {history.map((entry, i) => (
                    <HistoryEntry key={`${entry.timestamp}-${i}`} entry={entry} />
                  ))}
                </ul>
                <button
                  onClick={() => void clearHistory()}
                  className="flex min-h-7 cursor-pointer items-center justify-center gap-1 rounded py-1.5 text-xs text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Trash2 size={12} />
                  Clear history
                </button>
              </>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
