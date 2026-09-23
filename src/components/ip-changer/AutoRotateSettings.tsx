import { RefreshCcw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useIpChangerStore } from "@/stores/ipChangerStore";
import { cn } from "@/lib/utils";

const MINUTE_OPTIONS = [1, 2, 5, 10, 15, 30, 60];

export function AutoRotateSettings() {
  const status = useIpChangerStore((s) => s.status);
  const enabled = useIpChangerStore((s) => s.autoRotateEnabled);
  const intervalSecs = useIpChangerStore((s) => s.autoRotateIntervalSecs);
  const setAutoRotate = useIpChangerStore((s) => s.setAutoRotate);

  const running = status === "running";

  const minuteValue = MINUTE_OPTIONS.includes(intervalSecs / 60)
    ? Math.round(intervalSecs / 60)
    : 5;

  const setEnabled = (on: boolean) => void setAutoRotate(on, intervalSecs);

  const setMinutes = (mins: number) =>
    void setAutoRotate(enabled, Math.round(mins * 60));

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          "flex w-full items-center justify-between rounded-lg bg-black/15 px-3 py-2.5 ring-1 ring-white/[0.04] transition-colors light:bg-black/[0.03] light:ring-black/[0.05]",
          !running && "opacity-60",
        )}
        title={running ? undefined : "Start Tor to enable auto-rotation"}
      >
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground/80">
          <RefreshCcw size={13} className="text-muted-foreground" />
          Auto-rotate
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          disabled={!running}
          aria-label="Auto-rotate Tor identity"
        />
      </div>

      {enabled && running && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-black/20 px-3 py-2 ring-1 ring-white/[0.06] light:bg-black/[0.03] light:ring-black/5">
          <span className="text-[11px] font-medium text-muted-foreground">every</span>
          <Select value={String(minuteValue)} onValueChange={(v) => setMinutes(Number(v))}>
            <SelectTrigger size="sm" className="h-7 rounded-lg bg-black/20 text-xs ring-white/[0.07] light:bg-white light:ring-black/10" aria-label="Rotation interval">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MINUTE_OPTIONS.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {m} minute{m === 1 ? "" : "s"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
