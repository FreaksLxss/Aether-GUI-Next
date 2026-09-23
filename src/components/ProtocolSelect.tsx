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

export function ProtocolSelect({ id }: { id?: string }) {
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
        id={id}
        className="w-full justify-start gap-2 rounded-[35px] bg-black/20 px-3 py-5 text-xs font-medium text-foreground ring-1 ring-white/[0.07] transition-all duration-150 hover:bg-black/30 hover:ring-white/10 focus-visible:ring-primary disabled:opacity-50 [&>span]:flex-1 [&>span]:text-left [&>svg]:ml-auto"
        aria-label="Protocol"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="rounded-[35px] [--select-item-radius:31px] bg-surface-2 p-1 ring-1 ring-white/10">
        {OPTIONS.map((opt) => (
          <SelectItem
            key={opt.value}
            value={opt.value}
            className="cursor-pointer rounded-[31px] px-2.5 py-2 text-xs outline-none transition-colors focus:bg-primary/15 focus:text-foreground data-[highlighted]:bg-primary/15"
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">{opt.label}</span>
              <span className="text-[10px] text-muted-foreground">{opt.desc}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
