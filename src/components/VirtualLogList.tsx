import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "@/lib/toast";
import { Copy, Download, FileText, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LogLine } from "@/types/connection";

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightedLine({ line, query }: { line: string; query: string }) {
  if (!query) return <>{line}</>;
  const re = new RegExp(`(${escapeRegExp(query)})`, "gi");
  const parts = line.split(re);
  const lower = query.toLowerCase();
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === lower ? (
          <mark key={i} className="rounded bg-primary/25 px-0.5 text-inherit">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function levelClass(line: string) {
  const l = line;
  if (/\b(fatal|error)\b/i.test(l) || /\[error\]/i.test(l)) return "text-red-400";
  if (/\bwarn\b/i.test(l) || /\[warn\]/i.test(l)) return "text-amber-400";
  if (/^\s*\[\+\]/.test(l) || /\binfo\b/i.test(l)) return "text-emerald-400/70";
  return "text-zinc-400 light:text-zinc-600";
}

export function VirtualLogList({
  logs,
  filter,
  autoScroll,
  onAutoScrollChange,
}: {
  logs: LogLine[];
  filter: string;
  autoScroll: boolean;
  onAutoScrollChange: (v: boolean) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const baseTs = logs.length ? logs[0]!.timestamp : 0;

  const deferredFilter = filter;

  const rowVirtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 18,
    overscan: 12,
    measureElement:
      typeof window !== "undefined" && navigator.userAgent.indexOf("Firefox") === -1
        ? (el) => el.getBoundingClientRect().height
        : undefined,
  });

  const prevLenRef = useRef(logs.length);
  useEffect(() => {
    if (!autoScroll) {
      prevLenRef.current = logs.length;
      return;
    }
    if (logs.length === prevLenRef.current) return;
    prevLenRef.current = logs.length;
    if (logs.length === 0) return;
    requestAnimationFrame(() => {
      rowVirtualizer.scrollToIndex(logs.length - 1, { align: "end" });
    });
  }, [logs.length, autoScroll, rowVirtualizer]);

  const handleScroll = () => {
    const el = parentRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    onAutoScrollChange(nearBottom);
  };

  const copyLine = async (line: string) => {
    try {
      await writeText(line);
      toast.success("Copied line");
    } catch {
      toast.error("Copy failed");
    }
  };

  const exportLogs = async () => {
    const content = logs.map((l) => l.line).join("\n");
    if (!content) {
      toast.error("No logs to export");
      return;
    }
    try {
      const path = await save({
        defaultPath: "aether.log",
        filters: [{ name: "Log", extensions: ["log", "txt"] }],
      });
      if (!path) return;
      await invoke("write_file", { path, contents: content });
      toast.success("Log exported");
    } catch (e) {
      toast.error(String(e));
    }
  };

  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <div className="flex flex-col gap-1.5">
      {}
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void exportLogs()}
          className="h-6 gap-1 rounded-md px-2 text-[10px] text-muted-foreground hover:text-foreground"
        >
          <Download size={10} /> Export .log
        </Button>
      </div>
      <div className="relative">
        {!autoScroll && logs.length > 0 && (
          <button
            onClick={() => rowVirtualizer.scrollToIndex(logs.length - 1, { align: "end" })}
            className="absolute bottom-2 right-2 z-10 rounded-full bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground shadow-lg hover:bg-primary/90"
          >
            Jump to bottom
          </button>
        )}
        <div
          ref={parentRef}
          onScroll={handleScroll}
          role="log"
          aria-label="Aether connection logs"
          className="max-h-52 overflow-y-auto rounded-b-[35px] p-2.5 font-mono text-[10px] leading-relaxed [scrollbar-width:thin]"
          style={{ scrollbarGutter: "stable" }}
        >
        {logs.length === 0 ? (
          filter ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center" role="status">
              <span className="flex size-9 items-center justify-center rounded-xl bg-white/[0.04] ring-1 ring-white/[0.05]">
                <SearchX size={16} className="opacity-60" />
              </span>
              <p className="text-xs font-medium text-foreground/70">No matching lines</p>
              <p className="max-w-[26ch] text-[11px] leading-relaxed text-muted-foreground/60">
                No lines match &quot;{deferredFilter}&quot;. Try a different keyword or clear the filter.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-6 text-center" role="status">
              <span className="flex size-9 items-center justify-center rounded-xl bg-white/[0.04] ring-1 ring-white/[0.05]">
                <FileText size={16} className="opacity-60" />
              </span>
              <p className="font-mono text-[11px] text-muted-foreground/60">
                <span className="text-primary/60">$</span> aether --connect
              </p>
              <p className="text-[11px] text-muted-foreground/40">No logs yet — connect to see output</p>
            </div>
          )
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualItems.map((vi) => {
              const l = logs[vi.index]!;
              const relMs = l.timestamp - baseTs;
              const s = (relMs / 1000).toFixed(1);
              return (
                <div
                  key={vi.key}
                  data-index={vi.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${vi.start}px)`,
                  }}
                  className="group/row flex items-start gap-1.5 pr-1"
                >
                  <p className={`min-w-0 flex-1 break-all ${levelClass(l.line)}`}>
                    <span className="select-none text-muted-foreground/40">+{s}s </span>
                    <HighlightedLine line={l.line} query={deferredFilter} />
                  </p>
                  <button
                    onClick={() => void copyLine(l.line)}
                    aria-label="Copy line"
                    className="hidden shrink-0 rounded p-1 text-muted-foreground/60 hover:bg-white/5 hover:text-foreground group-hover/row:inline-flex"
                  >
                    <Copy size={10} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
