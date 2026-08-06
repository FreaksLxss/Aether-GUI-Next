import { Input } from "@/components/ui/input";
import { useConnectionStore } from "@/state/connectionStore";

/** Aether ≥1.5.0: one of the routing-rule lists (block/direct) as a
 * comma-or-newline separated field. Entries are stored as an array and joined
 * back into a single string for editing; an empty string clears the list. */
export function RouteRulesField({ kind }: { kind: "block" | "direct" }) {
  const block = useConnectionStore((s) => s.profile.route_block);
  const direct = useConnectionStore((s) => s.profile.route_direct);
  const setBlock = useConnectionStore((s) => s.setRouteBlock);
  const setDirect = useConnectionStore((s) => s.setRouteDirect);
  const status = useConnectionStore((s) => s.status);
  const locked = status.state !== "Idle" && status.state !== "Error";

  const value = kind === "block" ? block.join(", ") : direct.join(", ");
  const onChange = kind === "block" ? setBlock : setDirect;

  return (
    <Input
      type="text"
      value={value}
      disabled={locked}
      onChange={(e) =>
        onChange(
          e.target.value
            .split(/[,;\n]/)
            .map((s) => s.trim())
            .filter(Boolean),
        )
      }
      placeholder={
        kind === "block"
          ? "blocked.example.com, 10.0.0.0/8, port:25"
          : "full:bank.example.com, private"
      }
      className="h-9 bg-surface-3 text-[10px] font-mono ring-1 ring-inset ring-white/5 focus-visible:ring-primary"
      aria-label={kind === "block" ? "Route block list" : "Route direct list"}
    />
  );
}
