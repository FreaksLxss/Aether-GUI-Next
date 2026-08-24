import { Input } from "@/components/ui/input";
import { useConnectionStore } from "@/state/connectionStore";

/** Aether ≥1.7.0: how long the core waits to sniff a flow's domain name
 * (TLS SNI / HTTP Host) before applying route rules (AETHER_ROUTE_SNIFF_MS).
 * Empty input stores null so the env var is omitted (Aether's default). */
export function RouteSniffMsField({ id }: { id?: string }) {
  const ms = useConnectionStore((s) => s.profile.route_sniff_ms);
  const setMs = useConnectionStore((s) => s.setRouteSniffMs);
  const status = useConnectionStore((s) => s.status);
  const locked = status.state !== "Idle" && status.state !== "Error";

  return (
    <Input
      id={id}
      type="number"
      min={0}
      value={ms ?? ""}
      disabled={locked}
      onChange={(e) => {
        const v = e.target.value.trim();
        setMs(v ? Number(v) : null);
      }}
      placeholder="auto"
      className="h-9 bg-surface-3 font-mono text-[10px] ring-1 ring-inset ring-white/5 focus-visible:ring-primary"
      aria-label="Route sniff wait in milliseconds"
    />
  );
}
