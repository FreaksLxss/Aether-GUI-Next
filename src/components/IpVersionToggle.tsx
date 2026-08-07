import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useConnectionStore } from "@/state/connectionStore";
import type { IpVersion } from "@/types/connection";

const LABELS: Record<IpVersion, string> = {
  v4: "IPv4",
  v6: "IPv6",
  both: "Both",
};

/** Locked outside Idle/Error, mirroring ProtocolSelect. */
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
      className="w-full gap-0.5 rounded-lg bg-surface-3 p-0.5 ring-1 ring-inset ring-white/5"
    >
      {(Object.keys(LABELS) as IpVersion[]).map((v) => (
        <ToggleGroupItem
          key={v}
          value={v}
          size="sm"
          aria-label={LABELS[v]}
          className="flex-1 rounded-md text-[10px] text-muted-foreground transition-all duration-150 hover:text-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm data-[state=on]:shadow-primary/20 data-[state=on]:ring-1 data-[state=on]:ring-inset data-[state=on]:ring-primary-foreground/80"
        >
          {LABELS[v]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
