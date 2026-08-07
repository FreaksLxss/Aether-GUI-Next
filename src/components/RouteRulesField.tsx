import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { useConnectionStore } from "@/state/connectionStore";

/** Aether ≥1.5.0: one of the routing-rule lists (block/direct) as a
 * comma-or-newline separated field. Entries are stored as an array and joined
 * back into a single string for editing; an empty string clears the list. */
export function RouteRulesField({ id, kind }: { id?: string; kind: "block" | "direct" }) {
  const block = useConnectionStore((s) => s.profile.route_block);
  const direct = useConnectionStore((s) => s.profile.route_direct);
  const setBlock = useConnectionStore((s) => s.setRouteBlock);
  const setDirect = useConnectionStore((s) => s.setRouteDirect);
  const status = useConnectionStore((s) => s.status);
  const locked = status.state !== "Idle" && status.state !== "Error";
  const [invalid, setInvalid] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const value = kind === "block" ? block.join(", ") : direct.join(", ");
  const onChange = kind === "block" ? setBlock : setDirect;

  /** A rule must be a single token without whitespace (domains, full:/keyword:/
   *  regexp:/port: prefixes, CIDRs, or the bare `private` keyword). Whitespace
   *  inside an entry is the common typo that silently breaks matching. */
  const validate = (v: string) => {
    const hasBadToken = v
      .split(/[,;\n]/)
      .some((t) => {
        const trimmed = t.trim();
        return trimmed !== "" && /[\s]/.test(trimmed);
      });
    setInvalid(hasBadToken);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setInvalid(false), 2500);
  };

  return (
    <div className="flex flex-col gap-1">
      <Input
        id={id}
        type="text"
        value={value}
        disabled={locked}
        onChange={(e) => {
          const v = e.target.value;
          onChange(
            v
              .split(/[,;\n]/)
              .map((s) => s.trim())
              .filter(Boolean),
          );
          if (invalid) setInvalid(false);
        }}
        onBlur={(e) => validate(e.target.value)}
        placeholder={
          kind === "block"
            ? "blocked.example.com, 10.0.0.0/8, port:25"
            : "full:bank.example.com, private"
        }
        aria-invalid={invalid}
        className={`h-9 bg-surface-3 text-[10px] font-mono ring-1 ring-inset focus-visible:ring-primary ${
          invalid
            ? "ring-status-error focus-visible:ring-status-error"
            : "ring-white/5 focus-visible:ring-primary"
        }`}
        aria-label={kind === "block" ? "Route block list" : "Route direct list"}
      />
      {invalid && (
        <p className="text-[10px] text-status-error">
          Rules can't contain spaces — separate entries with commas or new lines.
        </p>
      )}
    </div>
  );
}
