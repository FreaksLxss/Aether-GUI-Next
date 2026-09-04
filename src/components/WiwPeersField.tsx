import { Input } from "@/components/ui/input";
import { useConnectionStore } from "@/state/connectionStore";

/** Aether ≥1.9.0: manual WARP-in-WARP hop endpoints for gool (--wiw-peers),
 * comma-separated "host:port". One hop alone is fine (the scan finds the
 * other); port is required. Empty input stores null so both hops are
 * scanned, Aether's default. */
export function WiwPeersField({ id }: { id?: string }) {
  const wiwPeers = useConnectionStore((s) => s.profile.wiw_peers);
  const setWiwPeers = useConnectionStore((s) => s.setWiwPeers);
  const status = useConnectionStore((s) => s.status);
  const locked = status.state !== "Idle" && status.state !== "Error";

  return (
    <Input
      id={id}
      type="text"
      value={wiwPeers ?? ""}
      disabled={locked}
      onChange={(e) => {
        const v = e.target.value.trim();
        setWiwPeers(v ? v : null);
      }}
      placeholder="162.159.192.1:2408, 188.114.96.1:2408"
      className="h-9 bg-surface-3 text-[10px] font-mono ring-1 ring-inset ring-white/5 focus-visible:ring-primary"
      aria-label="WARP-in-WARP peers"
    />
  );
}
