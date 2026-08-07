import { ChevronRight, Zap, Shield, Gauge } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConnectionStore } from "@/state/connectionStore";
import { SPRING_FAST } from "@/lib/motion";

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

/** Maps every scan mode onto one of the three quick presets so there is
 * always an active indicator, even for modes only reachable via the advanced
 * panel (stealth/ironclad are still "more secure" → Secure). */
const ACTIVE_PRESET: Record<string, string> = {
  turbo: "Fast",
  balanced: "Balanced",
  thorough: "Secure",
  stealth: "Secure",
  ironclad: "Secure",
};

export function QuickConnect({ onMoreOptions }: { onMoreOptions: () => void }) {
  const profile = useConnectionStore((s) => s.profile);
  const setScanMode = useConnectionStore((s) => s.setScanMode);
  const status = useConnectionStore((s) => s.status);
  const locked = status.state !== "Idle" && status.state !== "Error";

  const activePreset = ACTIVE_PRESET[profile.scan_mode] ?? null;

  const isActive = (p: QuickPreset) => activePreset === p.label;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="glass-float flex rounded-xl p-0.5 shadow-glass ring-1 ring-white/10">
          {PRESETS.map((p) => {
            const Icon = p.icon;
            const active = isActive(p);
            return (
              <motion.button
                key={p.label}
                type="button"
                onClick={() => setScanMode(p.scanMode)}
                disabled={locked}
                aria-pressed={active}
                title={active ? `${p.description} · active` : p.description}
                whileTap={{ scale: 0.96 }}
                transition={SPRING_FAST}
                className={`relative flex h-auto flex-col items-center justify-center gap-0.5 px-3 py-2 text-[10px] outline-none transition-colors duration-150 select-none disabled:opacity-50 disabled:pointer-events-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-inset rounded-lg ${
                  active ? "font-semibold text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {active && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={SPRING_FAST}
                    className="absolute inset-0 rounded-lg bg-primary shadow-md shadow-primary/40"
                  />
                )}
                <Icon size={12} className="relative" aria-hidden />
                <span className="relative">{p.label}</span>
              </motion.button>
            );
          })}
          <Button
            variant="ghost"
            size="icon"
            onClick={onMoreOptions}
            disabled={locked}
            title="More options"
            className="h-auto w-auto rounded-lg px-2 py-2 text-muted-foreground hover:bg-white/5 hover:text-foreground active:scale-95 transition"
          >
            <ChevronRight size={12} />
          </Button>
        </div>
      </TooltipTrigger>
      {locked && (
        <TooltipContent side="bottom">
          Disconnect first to change quick settings
        </TooltipContent>
      )}
    </Tooltip>
  );
}
