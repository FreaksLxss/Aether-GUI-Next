import { useEffect, useRef } from "react";
import { ChevronDown, Clock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useConnectionStore } from "@/state/connectionStore";
import { cn } from "@/lib/utils";
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
      <Collapsible open={open} onOpenChange={onToggle}>
        <div
          className={cn(
            "rounded-lg transition-all duration-200 ease-out",
            open
              ? "bg-surface-2 ring-1 ring-white/5 shadow-sm shadow-black/10"
              : "bg-surface-2 hover:bg-surface-3 hover:shadow-sm hover:shadow-black/5",
          )}
        >
          <CollapsibleTrigger
            className={cn(
              "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-xs outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
              open
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Clock size={13} />
            History
            <span className="text-[10px] text-muted-foreground/60">
              ({history.length})
            </span>
            <ChevronDown
              size={13}
              className="ml-auto transition-transform duration-150 data-[state=open]:rotate-180"
              data-state={open ? "open" : "closed"}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1 data-[state=open]:duration-200 data-[state=open]:[animation-timing-function:cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-1 data-[state=closed]:duration-150">
            <Separator className="bg-white/5" />
            <div className="flex flex-col gap-1.5 px-3 pt-2 pb-2.5">
              {history.length === 0 ? (
                <div className="flex flex-col items-center gap-1.5 py-3 text-status-idle">
                  <Clock size={16} className="opacity-40" />
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
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
}
