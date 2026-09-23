import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SegIndicator } from "@/components/ui/segment";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConnectionStore } from "@/state/connectionStore";
import { cue } from "@/lib/sound";
import type { ScanMode } from "@/types/connection";

const LABELS: Record<ScanMode, string> = {
  turbo: "Turbo",
  balanced: "Balanced",
  thorough: "Thorough",
  verified: "Verified",
  ironclad: "Ironclad",
};

const DESCRIPTIONS: Record<ScanMode, string> = {
  turbo:
    "Fastest route discovery, but the most probe traffic — an easier pattern for a censor to notice.",
  balanced: "Good default — reasonable speed without excessive probing.",
  thorough: "Slower, more exhaustive search for working routes.",
  verified:
    "Dials only gateways measured to answer connect-ip — never a guessed neighbour. On gool/MiM it keeps the two hops in separate ranges (Aether ≥2.1.0; was Stealth).",
  ironclad:
    "Opens a real tunnel through each candidate and sends a real HTTP request before trusting it. Slowest, but guarantees the gateway actually works.",
};

export function ScanModeToggle() {
  const status = useConnectionStore((s) => s.status);
  const scanMode = useConnectionStore((s) => s.profile.scan_mode);
  const setScanMode = useConnectionStore((s) => s.setScanMode);

  const locked = status.state !== "Idle" && status.state !== "Error";

  return (
    <div className="w-full overflow-x-auto">
      <ToggleGroup
        type="single"
        value={scanMode}
        onValueChange={(v) => {
          if (v) {
            cue("scan");
            setScanMode(v as ScanMode);
          }
        }}
        disabled={locked}
        aria-label="Scan mode"
        className="w-max min-w-full gap-0.5 rounded-[35px] bg-black/25 p-1 ring-1 ring-white/[0.06]"
      >
        {(Object.keys(LABELS) as ScanMode[]).map((mode) => (
          <Tooltip key={mode}>
              <TooltipTrigger asChild>
                <span className="min-w-max flex-1">
                  <ToggleGroupItem
                    value={mode}
                    size="sm"
                    aria-label={LABELS[mode]}
                    className="relative w-full rounded-[31px] py-1.5 text-[10px] font-medium text-muted-foreground/80 transition-colors duration-150 hover:text-foreground data-[state=on]:font-semibold data-[state=on]:text-primary-foreground"
                  >
                    <SegIndicator active={mode === scanMode} groupId="scan-mode" />
                    <span className="relative z-10 tracking-wide">{LABELS[mode]}</span>
                  </ToggleGroupItem>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-[240px] leading-relaxed">{DESCRIPTIONS[mode]}</TooltipContent>
            </Tooltip>
        ))}
      </ToggleGroup>
    </div>
  );
}
