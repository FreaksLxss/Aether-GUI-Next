import { ChevronRight, Zap, Shield, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
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
          <Button
            key={p.label}
            variant={active ? "default" : "outline"}
            size="sm"
            onClick={() => setScanMode(p.scanMode)}
            disabled={locked}
            title={p.description}
            className={`flex h-auto flex-col gap-0.5 px-3 py-2 text-[10px] transition-all duration-200 ease-out ${
              active
                ? "bg-primary/20 text-primary ring-primary/40 hover:bg-primary/25 shadow-sm shadow-primary/10"
                : ""
            }`}
          >
            <Icon size={12} />
            {p.label}
          </Button>
        );
      })}
      <Button
        variant="outline"
        size="icon"
        onClick={onMoreOptions}
        disabled={locked}
        title="More options"
        className="h-auto w-auto px-2 py-2"
      >
        <ChevronRight size={12} />
      </Button>
    </div>
  );
}
