import { ChevronRight, Zap, Shield, Gauge } from "lucide-react";
import { useConnectionStore } from "@/state/connectionStore";

interface QuickPreset {
  label: string;
  icon: typeof Zap;
  protocol: "auto" | "masque" | "wireguard";
  scanMode: "turbo" | "balanced" | "thorough";
  description: string;
}

const PRESETS: QuickPreset[] = [
  {
    label: "Fast",
    icon: Zap,
    protocol: "auto",
    scanMode: "turbo",
    description: "Fastest connection",
  },
  {
    label: "Balanced",
    icon: Gauge,
    protocol: "auto",
    scanMode: "balanced",
    description: "Default settings",
  },
  {
    label: "Secure",
    icon: Shield,
    protocol: "auto",
    scanMode: "thorough",
    description: "Maximum security",
  },
];

export function QuickConnect({ onMoreOptions }: { onMoreOptions: () => void }) {
  const profile = useConnectionStore((s) => s.profile);
  const setScanMode = useConnectionStore((s) => s.setScanMode);
  const status = useConnectionStore((s) => s.status);
  const locked = status.state !== "Idle" && status.state !== "Error";

  const isActive = (p: QuickPreset) =>
    profile.protocol === "auto" && profile.scan_mode === p.scanMode;

  return (
    <div className="flex gap-2">
      {PRESETS.map((p) => {
        const Icon = p.icon;
        const active = isActive(p);
        return (
          <button
            key={p.label}
            onClick={() => setScanMode(p.scanMode)}
            disabled={locked}
            title={p.description}
            className={`flex cursor-pointer flex-col items-center gap-0.5 rounded-md px-3 py-2 text-[10px] ring-1 transition-all disabled:opacity-50 ${
              active
                ? "bg-primary/20 text-primary ring-primary/40"
                : "bg-black/20 text-muted-foreground ring-white/10 hover:bg-black/30 hover:text-foreground"
            }`}
          >
            <Icon size={12} />
            {p.label}
          </button>
        );
      })}
      <button
        onClick={onMoreOptions}
        disabled={locked}
        title="More options"
        className="flex cursor-pointer flex-col items-center justify-center rounded-md px-2 py-2 text-[10px] ring-1 transition-all disabled:opacity-50 bg-black/20 text-muted-foreground ring-white/10 hover:bg-black/30 hover:text-foreground"
      >
        <ChevronRight size={12} />
      </button>
    </div>
  );
}
