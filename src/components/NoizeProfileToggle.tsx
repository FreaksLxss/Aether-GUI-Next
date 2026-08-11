import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConnectionStore } from "@/state/connectionStore";
import type { MasqueNoize, WgNoize } from "@/types/connection";

const MASQUE_LABELS: Record<MasqueNoize, string> = {
  firewall: "Firewall",
  gfw: "GFW",
  light: "Light",
  off: "Off",
};

const MASQUE_DESCRIPTIONS: Record<MasqueNoize, string> = {
  firewall:
    "Balanced obfuscation — gets through most filtered networks without much speed cost. Recommended default.",
  gfw:
    "Heavier obfuscation with more decoy traffic. Try this when Firewall can't get through.",
  light: "Aether ≥1.6.0: gentlest obfuscation — for networks that only need a nudge.",
  off: "No obfuscation. Only for open networks or testing.",
};

const WG_LABELS: Record<WgNoize, string> = {
  balanced: "Balanced",
  aggressive: "Aggressive",
  light: "Light",
  off: "Off",
};

const WG_DESCRIPTIONS: Record<WgNoize, string> = {
  balanced:
    "Default — a good balance between stealth and speed for WireGuard traffic.",
  aggressive:
    "Heaviest obfuscation with the most decoy packets. For very strict networks.",
  light: "Minimal obfuscation with the least overhead.",
  off: "No obfuscation. Only for open networks or testing.",
};

/** Shows MASQUE or WireGuard/gool obfuscation profiles based on the selected
 * protocol. Locked outside Idle/Error like every other profile control. */
export function NoizeProfileToggle() {
  const status = useConnectionStore((s) => s.status);
  const protocol = useConnectionStore((s) => s.profile.protocol);
  const masqueNoize = useConnectionStore((s) => s.profile.masque_noize);
  const wgNoize = useConnectionStore((s) => s.profile.wg_noize);
  const setMasqueNoize = useConnectionStore((s) => s.setMasqueNoize);
  const setWgNoize = useConnectionStore((s) => s.setWgNoize);

  const locked = status.state !== "Idle" && status.state !== "Error";
  const isMasque = protocol === "auto" || protocol === "masque";

  if (isMasque) {
    return (
      <ToggleGroup
        type="single"
        value={masqueNoize}
        onValueChange={(v) => {
          if (v) setMasqueNoize(v as MasqueNoize);
        }}
        disabled={locked}
        aria-label="Obfuscation"
        className="w-full gap-0.5 rounded-lg bg-surface-3 p-0.5 ring-1 ring-inset ring-white/5"
      >
        {(Object.keys(MASQUE_LABELS) as MasqueNoize[]).map((n) => (
          <Tooltip key={n}>
            <TooltipTrigger asChild>
              <span className="flex-1">
                <ToggleGroupItem
                  value={n}
                  size="sm"
                  aria-label={MASQUE_LABELS[n]}
                  className="w-full rounded-md text-[10px] text-muted-foreground transition-all duration-150 hover:text-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm data-[state=on]:shadow-primary/20 data-[state=on]:ring-1 data-[state=on]:ring-inset data-[state=on]:ring-primary-foreground/80"
                >
                  {MASQUE_LABELS[n]}
                </ToggleGroupItem>
              </span>
            </TooltipTrigger>
            <TooltipContent>{MASQUE_DESCRIPTIONS[n]}</TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>
    );
  }

  return (
    <ToggleGroup
      type="single"
      value={wgNoize}
      onValueChange={(v) => {
        if (v) setWgNoize(v as WgNoize);
      }}
      disabled={locked}
      aria-label="Obfuscation"
      className="w-full gap-0.5 rounded-lg bg-surface-3 p-0.5 ring-1 ring-inset ring-white/5"
    >
      {(Object.keys(WG_LABELS) as WgNoize[]).map((n) => (
        <Tooltip key={n}>
          <TooltipTrigger asChild>
            <span className="flex-1">
              <ToggleGroupItem
                value={n}
                size="sm"
                aria-label={WG_LABELS[n]}
                className="w-full rounded-md text-[10px] text-muted-foreground transition-all duration-150 hover:text-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm data-[state=on]:shadow-primary/20 data-[state=on]:ring-1 data-[state=on]:ring-inset data-[state=on]:ring-primary-foreground/80"
              >
                {WG_LABELS[n]}
              </ToggleGroupItem>
            </span>
          </TooltipTrigger>
          <TooltipContent>{WG_DESCRIPTIONS[n]}</TooltipContent>
        </Tooltip>
      ))}
    </ToggleGroup>
  );
}
