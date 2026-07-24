import { Zap, Shield, Gauge } from "lucide-react";
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
    protocol: "masque",
    scanMode: "thorough",
    description: "Maximum security",
  },
];

export function QuickConnect() {
  const profile = useConnectionStore((s) => s.profile);
  const setProtocol = useConnectionStore((s) => s.setProtocol);
  const setScanMode = useConnectionStore((s) => s.setScanMode);
  const status = useConnectionStore((s) => s.status);
  const locked = status.state !== "Idle" && status.state !== "Error";

  const isActive = (p: QuickPreset) =>
    profile.protocol === p.protocol && profile.scan_mode === p.scanMode;

  return (
    <div className="flex gap-2">
      {PRESETS.map((p) => {
        const Icon = p.icon;
        const active = isActive(p);
        return (
          <button
            key={p.label}
            onClick={() => {
              setProtocol(p.protocol);
              setScanMode(p.scanMode);
            }}
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
    </div>
  );
}
