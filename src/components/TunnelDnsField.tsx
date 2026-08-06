import { Input } from "@/components/ui/input";
import { useConnectionStore } from "@/state/connectionStore";

/** Aether ≥1.5.0: resolvers used inside the tunnel (--dns), comma-separated.
 * Empty input stores null so Aether's default (1.1.1.1,1.0.0.1) is used. */
export function TunnelDnsField() {
  const dns = useConnectionStore((s) => s.profile.dns_servers);
  const setDns = useConnectionStore((s) => s.setDnsServers);
  const status = useConnectionStore((s) => s.status);
  const locked = status.state !== "Idle" && status.state !== "Error";

  return (
    <Input
      type="text"
      value={dns ?? ""}
      disabled={locked}
      onChange={(e) => {
        const v = e.target.value.trim();
        setDns(v ? v : null);
      }}
      placeholder="1.1.1.1, 1.0.0.1 (default)"
      className="h-9 bg-surface-3 text-[10px] font-mono ring-1 ring-inset ring-white/5 focus-visible:ring-primary"
      aria-label="In-tunnel DNS servers"
    />
  );
}