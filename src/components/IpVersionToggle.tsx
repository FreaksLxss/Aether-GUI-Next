import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SegIndicator } from "@/components/ui/segment";
import { useConnectionStore } from "@/state/connectionStore";
import type { IpVersion } from "@/types/connection";

const LABELS: Record<IpVersion, string> = {
  v4: "IPv4",
  v6: "IPv6",
  both: "Both",
};

export function IpVersionToggle() {
  const status = useConnectionStore((s) => s.status);
  const ipVersion = useConnectionStore((s) => s.profile.ip_version);
  const setIpVersion = useConnectionStore((s) => s.setIpVersion);

  const locked = status.state !== "Idle" && status.state !== "Error";

  return (
    <ToggleGroup
      type="single"
      value={ipVersion}
      onValueChange={(v) => {
        if (v) setIpVersion(v as IpVersion);
      }}
      disabled={locked}
      aria-label="IP version"
      className="w-full gap-0.5 rounded-[35px] bg-black/25 p-1 ring-1 ring-white/[0.06]"
    >
      {(Object.keys(LABELS) as IpVersion[]).map((v) => (
        <ToggleGroupItem
          key={v}
          value={v}
          size="sm"
          aria-label={LABELS[v]}
          className="relative flex-1 rounded-[31px] py-1.5 text-[10px] font-medium text-muted-foreground/80 transition-colors duration-150 hover:text-foreground data-[state=on]:font-semibold data-[state=on]:text-primary-foreground"
        >
          <SegIndicator active={v === ipVersion} groupId="ip-version" />
          <span className="relative z-10 tracking-wide">{LABELS[v]}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
