import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConnectionStore } from "@/state/connectionStore";
import type { Protocol } from "@/types/connection";

const LABELS: Record<Protocol, string> = {
  auto: "Auto",
  masque: "MASQUE",
  wireguard: "WireGuard",
  gool: "WARP-in-WARP",
};

const DESCRIPTIONS: Record<Protocol, string> = {
  auto: "Recommended — lets Aether pick the best protocol",
  masque: "Disguises traffic as HTTPS — best against strict censorship",
  wireguard: "Lighter and faster, good for less restrictive networks",
  gool: "Double WireGuard tunnel for extra security at a speed cost",
};

/**
 * Defaults to "Auto" rather than a bare protocol choice: Aether's own
 * scan-mode already performs multi-route discovery internally (confirmed by
 * running the real binary), so protocol selection is a fallback/advanced
 * option here, not the primary decision a user makes every session.
 * Disabled outside Idle/Error since Aether can't switch protocol mid-session
 * — changing it requires a full disconnect/reconnect.
 */
export function ProtocolSelect() {
  const status = useConnectionStore((s) => s.status);
  const protocol = useConnectionStore((s) => s.profile.protocol);
  const setProtocol = useConnectionStore((s) => s.setProtocol);

  const locked = status.state !== "Idle" && status.state !== "Error";

  return (
    <Select
      value={protocol}
      onValueChange={(v) => setProtocol(v as Protocol)}
      disabled={locked}
    >
      <SelectTrigger
        size="sm"
        className="w-full rounded-lg bg-surface-3 px-3 py-2 text-[10px] text-foreground ring-1 ring-inset ring-white/5 transition-all duration-150 hover:bg-surface-4 focus-visible:ring-primary disabled:opacity-50"
        aria-label="Protocol"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="rounded-lg bg-surface-2 ring-1 ring-white/10">
        {(Object.keys(LABELS) as Protocol[]).map((p) => (
          <SelectItem
            key={p}
            value={p}
            className="rounded-md text-xs focus:bg-primary/20 focus:text-foreground"
          >
            <div className="flex flex-col">
              <span>{LABELS[p]}</span>
              <span className="text-[9px] text-muted-foreground">{DESCRIPTIONS[p]}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
