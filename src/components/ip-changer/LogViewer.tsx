import { useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIpChangerStore } from "@/stores/ipChangerStore";

const TIME_FMT = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Scrollable, auto-following log of the Tor subprocess. */
export function LogViewer() {
  const logs = useIpChangerStore((s) => s.logs);
  const clearLogs = useIpChangerStore((s) => s.clearLogs);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Auto-follow output; if the user scrolled back manually, let them stay.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          Live log
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={clearLogs}
          disabled={logs.length === 0}
          aria-label="Clear Tor logs"
          title="Clear logs"
        >
          <Trash2 size={12} />
        </Button>
      </div>
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        className="h-28 overflow-y-auto rounded-lg bg-surface-3/70 px-2.5 py-1.5 font-mono text-[10px] leading-[1.45] text-muted-foreground ring-1 ring-inset ring-white/5"
      >
        {logs.length === 0 ? (
          <span className="text-muted-foreground/40 italic">
            Tor output appears here when it starts.
          </span>
        ) : (
          logs.map((l, i) => (
            <div key={i} className="anim-log-in flex gap-1.5 whitespace-pre-wrap break-words">
              <span className="shrink-0 text-muted-foreground/40 tabular-nums">
                {TIME_FMT.format(l.timestamp)}
              </span>
              <span>{l.line}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}