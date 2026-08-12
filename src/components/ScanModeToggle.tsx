import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SegIndicator } from "@/components/ui/segment";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConnectionStore } from "@/state/connectionStore";
import type { ScanMode } from "@/types/connection";

const LABELS: Record<ScanMode, string> = {
  turbo: "Turbo",
  balanced: "Balanced",
  thorough: "Thorough",
  stealth: "Stealth",
  ironclad: "Ironclad",
};

const DESCRIPTIONS: Record<ScanMode, string> = {
  turbo:
    "Fastest route discovery, but the most probe traffic — an easier pattern for a censor to notice.",
  balanced: "Good default — reasonable speed without excessive probing.",
  thorough: "Slower, more exhaustive search for working routes.",
  stealth: "Slowest and most cautious — hardest for a censor to fingerprint.",
  ironclad:
    "Opens a real tunnel through each candidate and sends a real HTTP request before trusting it. Slowest, but guarantees the gateway actually works.",
};

/** Locked outside Idle/Error, mirroring ProtocolSelect — scan mode can't
 * change mid-session either. */
export function ScanModeToggle() {
  const status = useConnectionStore((s) => s.status);
  const scanMode = useConnectionStore((s) => s.profile.scan_mode);
  const setScanMode = useConnectionStore((s) => s.setScanMode);

  const locked = status.state !== "Idle" && status.state !== "Error";

  return (
    <div className="flex w-full flex-col gap-1.5">
      <ToggleGroup
        type="single"
        value={scanMode}
        onValueChange={(v) => {
          if (v) setScanMode(v as ScanMode);
        }}
        disabled={locked}
        aria-label="Scan mode"
        className="w-full gap-0.5 rounded-lg bg-surface-3 p-0.5 ring-1 ring-inset ring-white/5"
      >
        {(Object.keys(LABELS) as ScanMode[]).map((mode) => (
          <Tooltip key={mode}>
              <TooltipTrigger asChild>
                <span className="flex-1">
                  <ToggleGroupItem
                    value={mode}
                    size="sm"
                    aria-label={LABELS[mode]}
                    className="relative w-full rounded-md text-[10px] text-muted-foreground transition-colors duration-150 hover:text-foreground data-[state=on]:text-primary-foreground"
                  >
                    <SegIndicator active={mode === scanMode} groupId="scan-mode" />
                    <span className="relative z-10">{LABELS[mode]}</span>
                  </ToggleGroupItem>
                </span>
              </TooltipTrigger>
              <TooltipContent>{DESCRIPTIONS[mode]}</TooltipContent>
            </Tooltip>
        ))}
      </ToggleGroup>
    </div>
  );
}
