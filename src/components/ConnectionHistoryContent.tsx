import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Clock, Download, History, Trash2, X } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { useConnectionStore } from "@/state/connectionStore";
import { SPRING_FAST } from "@/lib/motion";
import type { ConnectionHistoryEntry } from "@/types/connection";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

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

function HistorySparkline({ entries }: { entries: ConnectionHistoryEntry[] }) {
  if (entries.length < 2) return null;
  const chrono = [...entries].reverse();
  const vals = chrono.map((e) => e.duration_secs);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const w = 100, h = 28, pad = 3;
  const points = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * (w - pad * 2) + pad;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <div className="rounded-xl bg-black/10 px-2.5 py-2 ring-1 ring-white/[0.04] light:bg-black/[0.02] light:ring-black/[0.04]">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground/60">Duration sparkline</span>
        <span className="text-[11px] tabular-nums text-muted-foreground/40">{min}s – {max}s</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-full" preserveAspectRatio="none" role="img" aria-label="Duration sparkline">
        <polyline fill="none" stroke="var(--chart-1)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" points={points} opacity="0.9" />
        {chrono.map((e, i) => {
          const v = vals[i]!;
          const x = (i / (vals.length - 1)) * (w - pad * 2) + pad;
          const y = h - pad - ((v - min) / range) * (h - pad * 2);
          return <circle key={i} cx={x} cy={y} r={e.success ? 1.8 : 1.2} fill={e.success ? "var(--chart-2)" : "var(--destructive)"} opacity={0.9}><title>{`${e.protocol} ${e.scan_mode} — ${v}s — ${formatTime(e.timestamp)}`}</title></circle>;
        })}
      </svg>
    </div>
  );
}

function HistoryEntry({ entry, index }: { entry: ConnectionHistoryEntry; index: number }) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING_FAST, delay: Math.min(index * 0.04, 0.24) }}
      className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.04] bg-black/15 px-3 py-2.5 ring-1 ring-white/[0.03] light:border-black/[0.04] light:bg-black/[0.02] light:ring-black/[0.04]"
      aria-label={`${entry.success ? "Connected" : "Failed"} via ${entry.protocol}, ${entry.scan_mode} mode, lasted ${formatDuration(entry.duration_secs)}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full ring-1 ${
            entry.success ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/20" : "bg-red-500/15 text-red-400 ring-red-500/20"
          }`}
        >
          {entry.success ? <Check size={10} strokeWidth={3} /> : <X size={10} strokeWidth={3} />}
        </span>
        <span className="shrink-0 text-xs font-medium capitalize text-foreground">{entry.protocol}</span>
        <span className="shrink-0 text-muted-foreground/40">·</span>
        <span className="truncate text-xs capitalize text-muted-foreground">{entry.scan_mode}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
        <span className="flex items-center gap-1 text-[11px]">
          <Clock size={10} />
          {formatDuration(entry.duration_secs)}
        </span>
        <span className="hidden text-[11px] text-muted-foreground/60 sm:inline">{formatTime(entry.timestamp)}</span>
      </div>
    </motion.li>
  );
}

export function ConnectionHistoryContent() {
  const history = useConnectionStore((s) => s.history);
  const loadHistory = useConnectionStore((s) => s.loadHistory);
  const clearHistory = useConnectionStore((s) => s.clearHistory);
  const wasConnected = useRef(false);
  const [confirmingClear, setConfirmingClear] = useState(false);

  useEffect(() => {
    void loadHistory();
    const unsub = useConnectionStore.subscribe((state) => {
      const wasConn = wasConnected.current;
      const isIdle = state.status.state === "Idle";
      const isConnected = state.status.state === "Connected";
      wasConnected.current = isConnected;
      if (wasConn && isIdle) void loadHistory();
    });
    return unsub;
  }, [loadHistory]);

  const stats = useMemo(() => {
    if (history.length === 0) return null;
    const success = history.filter((h) => h.success).length;
    const rate = Math.round((success / history.length) * 100);
    const avg = history.reduce((a, h) => a + h.duration_secs, 0) / history.length;
    const counts = new Map<string, number>();
    for (const h of history) counts.set(h.protocol, (counts.get(h.protocol) ?? 0) + 1);
    let top = "", topN = 0;
    for (const [k, v] of counts) if (v > topN) { top = k; topN = v; }
    const topPct = Math.round((topN / history.length) * 100);
    return { rate, avg, top, topPct, success, total: history.length };
  }, [history]);

  const exportCsv = async () => {
    if (history.length === 0) { toast.error("No history to export"); return; }
    const header = "timestamp,protocol,scan_mode,duration_secs,success\n";
    const rows = history.map((h) => `${new Date(h.timestamp).toISOString()},${h.protocol},${h.scan_mode},${h.duration_secs},${h.success}`).join("\n");
    const csv = header + rows;
    try {
      const path = await save({ defaultPath: "aether-history.csv", filters: [{ name: "CSV", extensions: ["csv"] }] });
      if (!path) return;
      await invoke("write_file", { path, contents: csv });
      toast.success("History exported");
    } catch (e) { toast.error(String(e)); }
  };

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border-0 bg-card px-4 py-10 shadow-[0_16px_48px_-20px_rgba(0,0,0,0.75),0_8px_24px_-12px_rgba(0,0,0,0.55),inset_0_1px_0_0_rgba(255,255,255,0.06)] light:border light:border-dashed light:border-black/10 light:shadow-none">
        <span className="flex size-9 items-center justify-center rounded-xl bg-white/[0.04] ring-1 ring-white/[0.05] light:bg-black/[0.04] light:ring-black/5">
          <History size={16} className="opacity-60" />
        </span>
        <p className="text-xs font-medium text-foreground/70">No connections yet</p>
        <p className="max-w-[22ch] text-center text-[11px] leading-relaxed text-muted-foreground/60">Your connection history will appear here once you connect.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {stats && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-card px-2.5 py-2 shadow-[0_8px_24px_-14px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.06)] light:border light:border-black/[0.06] light:shadow-none">
            <p className="text-[11px] tracking-wide text-muted-foreground">Success</p>
            <p className="text-sm font-semibold tabular-nums text-foreground">{stats.rate}%</p>
            <p className="text-[11px] text-muted-foreground/60">{stats.success}/{stats.total}</p>
          </div>
          <div className="rounded-xl bg-card px-2.5 py-2 shadow-[0_8px_24px_-14px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.06)] light:border light:border-black/[0.06] light:shadow-none">
            <p className="text-[11px] tracking-wide text-muted-foreground">Avg time</p>
            <p className="text-sm font-semibold tabular-nums text-foreground">{stats.avg < 60 ? `${stats.avg.toFixed(1)}s` : formatDuration(Math.round(stats.avg))}</p>
            <p className="text-[11px] capitalize text-muted-foreground/60">{stats.total} runs</p>
          </div>
          <div className="rounded-xl bg-card px-2.5 py-2 shadow-[0_8px_24px_-14px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.06)] light:border light:border-black/[0.06] light:shadow-none">
            <p className="text-[11px] tracking-wide text-muted-foreground">Top</p>
            <p className="text-sm font-semibold capitalize text-foreground">{stats.top}</p>
            <p className="text-[11px] text-muted-foreground/60">{stats.topPct}%</p>
          </div>
        </div>
      )}
      {history.length >= 2 && <HistorySparkline entries={history} />}
      <div className="flex flex-col gap-1.5 rounded-2xl border-0 bg-card p-3 shadow-[0_16px_48px_-20px_rgba(0,0,0,0.75),0_8px_24px_-12px_rgba(0,0,0,0.55),inset_0_1px_0_0_rgba(255,255,255,0.06)] light:border light:border-black/[0.08] light:shadow-none">
        <span className="px-1 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground/60 uppercase">Recent · {history.length}</span>
        <ul className="flex flex-col gap-1.5">
          {history.map((entry, i) => (
            <HistoryEntry key={`${entry.timestamp}-${i}`} entry={entry} index={i} />
          ))}
        </ul>
      </div>
      <div className="flex items-center justify-between gap-2 rounded-xl border-0 bg-card px-3 py-2 shadow-[0_8px_24px_-14px_rgba(0,0,0,0.6),0_2px_8px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.06)] light:border light:border-black/[0.06] light:shadow-none">
        {confirmingClear ? (
          <>
            <span className="text-[11px] font-medium text-destructive">Delete all history?</span>
            <div className="flex gap-1">
              <Button variant="destructive" size="sm" onClick={() => { void clearHistory(); setConfirmingClear(false); }} className="h-7 gap-1 rounded-lg text-xs" aria-label="Confirm clear history"><Trash2 size={12} />Yes, clear</Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmingClear(false)} className="h-7 rounded-lg text-xs text-muted-foreground">Cancel</Button>
            </div>
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirmingClear(true)} className="h-7 gap-1 rounded-lg text-xs text-muted-foreground hover:text-destructive" aria-label="Clear history"><Trash2 size={12} />Clear</Button>
            <Button variant="outline" size="sm" onClick={() => void exportCsv()} className="h-7 gap-1 rounded-lg text-xs"><Download size={12} />Export CSV</Button>
          </>
        )}
      </div>
    </div>
  );
}
