import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConnectionStore } from "@/state/connectionStore";
import type { CaptureMode } from "@/types/connection";

const LABELS: Record<CaptureMode, string> = {
  proxy: "Proxy",
  tun: "TUN",
  both: "Both",
};

const DESCRIPTIONS: Record<CaptureMode, string> = {
  proxy:
    "Routes traffic via the Windows system proxy. Only apps that respect system proxy settings are captured.",
  tun:
    "Creates a virtual network adapter that captures all PC traffic. Requires admin privileges.",
  both:
    "Enables both system proxy and TUN adapter simultaneously for maximum coverage.",
};

/** Selects how network traffic is captured: system proxy, TUN, or both.
 * Locked outside Idle/Error since capture mode can't change mid-session. */
export function CaptureModeSelect() {
  const status = useConnectionStore((s) => s.status);
  const captureMode = useConnectionStore((s) => s.profile.capture_mode);
  const setCaptureMode = useConnectionStore((s) => s.setCaptureMode);

  const locked = status.state !== "Idle" && status.state !== "Error";

  return (
    <ToggleGroup
      type="single"
      value={captureMode}
      onValueChange={(v) => {
        if (v) setCaptureMode(v as CaptureMode);
      }}
      disabled={locked}
      className="w-full gap-0.5 rounded-lg bg-surface-3 p-0.5 ring-1 ring-inset ring-white/5"
    >
      {(Object.keys(LABELS) as CaptureMode[]).map((mode) => (
        <Tooltip key={mode}>
          <TooltipTrigger asChild>
            <span className="flex-1">
              <ToggleGroupItem
                value={mode}
                size="sm"
                aria-label={LABELS[mode]}
                className="w-full rounded-md text-[10px] text-muted-foreground transition-all duration-150 hover:text-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm data-[state=on]:shadow-primary/20"
              >
                {LABELS[mode]}
              </ToggleGroupItem>
            </span>
          </TooltipTrigger>
          <TooltipContent>{DESCRIPTIONS[mode]}</TooltipContent>
        </Tooltip>
      ))}
    </ToggleGroup>
  );
}
