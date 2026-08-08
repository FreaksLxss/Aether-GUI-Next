import { RefreshCcw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useIpChangerStore } from "@/stores/ipChangerStore";
import { cn } from "@/lib/utils";

const MINUTE_OPTIONS = [1, 2, 5, 10, 15, 30, 60];

/** Auto-rotation toggle + interval picker. Interval lives server-side in
 * seconds (min 60); the UI edits it in minutes and converts on the way. */
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
    <div className="flex flex-col gap-1.5">
      <div
        className={cn(
          "flex w-full items-center justify-between rounded-md px-1.5 py-1 transition-colors duration-150",
          !running && "opacity-60",
        )}
        title={running ? undefined : "Start Tor to enable auto-rotation"}
      >
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCcw size={12} />
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
        <div className="flex items-center justify-between gap-2 pl-1.5 pr-1">
          <span className="text-[10px] text-muted-foreground/80">every</span>
          <Select value={String(minuteValue)} onValueChange={(v) => setMinutes(Number(v))}>
            <SelectTrigger size="sm" className="h-7 text-[11px]" aria-label="Rotation interval">
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