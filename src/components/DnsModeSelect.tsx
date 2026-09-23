import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SegIndicator } from "@/components/ui/segment";
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
      className="w-full gap-0.5 rounded-[35px] bg-black/25 p-1 ring-1 ring-inset ring-white/[0.06] light:bg-black/[0.04] light:ring-black/[0.06]"
    >
      {(Object.keys(LABELS) as DnsMode[]).map((mode) => (
        <Tooltip key={mode}>
          <TooltipTrigger asChild>
            <span className="flex-1">
              <ToggleGroupItem
                value={mode}
                size="sm"
                aria-label={LABELS[mode]}
                className="relative w-full rounded-lg py-1.5 text-[10px] font-medium tracking-wide text-muted-foreground transition-colors duration-150 hover:text-foreground data-[state=on]:font-semibold data-[state=on]:text-primary-foreground"
              >
                <SegIndicator active={mode === dnsMode} groupId="dns-mode" />
                <span className="relative z-10">{LABELS[mode]}</span>
              </ToggleGroupItem>
            </span>
          </TooltipTrigger>
          <TooltipContent>{DESCRIPTIONS[mode]}</TooltipContent>
        </Tooltip>
      ))}
    </ToggleGroup>
  );
}
