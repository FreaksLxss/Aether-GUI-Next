import { useEffect, useRef } from "react";
import { Terminal, Trash2, Copy } from "lucide-react";
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

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground">Live log</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => navigator.clipboard?.writeText(logs.map(l => `${TIME_FMT.format(l.timestamp)} ${l.line}`).join("\n"))}
            disabled={logs.length === 0}
            aria-label="Copy all logs"
            title="Copy all logs"
            className="rounded-lg"
          >
            <Copy size={12} />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={clearLogs}
            disabled={logs.length === 0}
            aria-label="Clear Tor logs"
            title="Clear logs"
            className="rounded-lg"
          >
            <Trash2 size={12} />
          </Button>
        </div>
      </div>
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        className="h-36 overflow-y-auto rounded-xl bg-[#0a0a0c] px-3 py-2.5 font-mono text-[11px] leading-[1.45] text-muted-foreground ring-1 ring-white/[0.06] light:bg-[#f6f6f5] light:ring-black/10"
      >
        {logs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center" role="status">
            <span className="flex size-9 items-center justify-center rounded-xl bg-white/[0.04] ring-1 ring-white/[0.05]">
              <Terminal size={16} className="opacity-60" />
            </span>
            <p className="text-xs font-medium text-foreground/70">No output yet</p>
            <p className="max-w-[22ch] text-[11px] leading-relaxed text-muted-foreground/60">Tor output appears here once it starts. Start the engine to see live logs.</p>
          </div>
        ) : (
          logs.map((l, i) => (
            <div key={i} className="anim-log-in flex gap-1.5">
              <span className="shrink-0 text-muted-foreground/40 tabular-nums">
                {TIME_FMT.format(l.timestamp)}
              </span>
              <span className="min-w-0 flex-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{l.line}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
