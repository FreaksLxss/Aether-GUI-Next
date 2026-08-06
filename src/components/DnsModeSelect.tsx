import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConnectionStore } from "@/state/connectionStore";
import type { DnsMode } from "@/types/connection";

const LABELS: Record<DnsMode, string> = {
  forward: "Forward",
  direct: "Direct",
};

const DESCRIPTIONS: Record<DnsMode, string> = {
  forward:
    "Routes DNS queries through the SOCKS5 proxy. Best for privacy — hides DNS lookups from the local network.",
  direct:
    "Uses the system's default DNS resolver. Faster, but DNS queries are visible to the local network.",
};

/** Selects how DNS queries are resolved when TUN mode is active.
 * Locked outside Idle/Error since DNS mode can't change mid-session. */
export function DnsModeSelect() {
  const status = useConnectionStore((s) => s.status);
  const dnsMode = useConnectionStore((s) => s.profile.dns_mode);
  const setDnsMode = useConnectionStore((s) => s.setDnsMode);

  const locked = status.state !== "Idle" && status.state !== "Error";

  return (
    <ToggleGroup
      type="single"
      value={dnsMode}
      onValueChange={(v) => {
        if (v) setDnsMode(v as DnsMode);
      }}
      disabled={locked}
      className="w-full gap-0.5 rounded-lg bg-surface-3 p-0.5 ring-1 ring-inset ring-white/5"
    >
      {(Object.keys(LABELS) as DnsMode[]).map((mode) => (
        <Tooltip key={mode}>
          <TooltipTrigger asChild>
            <span className="flex-1">
              <ToggleGroupItem
                value={mode}
                size="sm"
                aria-label={LABELS[mode]}
                className="w-full rounded-md text-[10px] text-muted-foreground transition-all duration-150 hover:text-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm data-[state=on]:shadow-primary/20 data-[state=on]:ring-1 data-[state=on]:ring-inset data-[state=on]:ring-primary-foreground/80"
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
