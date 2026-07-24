import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConnectionStore } from "@/state/connectionStore";
import type { Protocol } from "@/types/connection";

const OPTIONS: { value: Protocol; label: string; desc: string }[] = [
  { value: "auto", label: "Auto", desc: "Recommended — Aether picks the best protocol" },
  { value: "masque", label: "MASQUE", desc: "Disguises traffic as HTTPS" },
  { value: "wireguard", label: "WireGuard", desc: "Lighter and faster" },
  { value: "gool", label: "WARP-in-WARP", desc: "Double tunnel, maximum security" },
];

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
        className="w-full rounded-lg bg-surface-3 px-3 py-2 text-[10px] text-foreground ring-1 ring-inset ring-white/5 transition-all duration-150 hover:bg-surface-4 hover:ring-white/10 focus-visible:ring-primary disabled:opacity-50"
        aria-label="Protocol"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="rounded-lg bg-surface-2 p-1 ring-1 ring-white/10">
        {OPTIONS.map((opt) => (
          <SelectItem
            key={opt.value}
            value={opt.value}
            className="cursor-pointer rounded-md px-2.5 py-2 text-xs outline-none transition-colors focus:bg-primary/15 focus:text-foreground data-[highlighted]:bg-primary/15"
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">{opt.label}</span>
              <span className="text-[9px] text-muted-foreground">{opt.desc}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
