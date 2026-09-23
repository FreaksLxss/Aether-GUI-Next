import { ChevronRight, Zap, Shield, Gauge, EyeOff } from "lucide-react";
import { motion, type Transition } from "motion/react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConnectionStore } from "@/state/connectionStore";
import { useLocked } from "@/hooks/useLocked";
import { SPRING_FAST } from "@/lib/motion";

const UNDERLINE_SPRING: Transition = { type: "spring", stiffness: 380, damping: 30, mass: 0.7 };

interface QuickPreset {
  label: string;
  icon: typeof Zap;
  protocol: "auto" | "masque" | "wireguard";
  scanMode: "turbo" | "balanced" | "thorough" | "verified";
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
  {
    label: "Verified",
    icon: EyeOff,
    protocol: "auto",
    scanMode: "verified",
    description: "Only measured gateways",
  },
];

const ACTIVE_PRESET: Record<string, string> = {
  turbo: "Fast",
  balanced: "Balanced",
  thorough: "Secure",
  verified: "Verified",
  ironclad: "Secure",
};

export function QuickConnect({ onMoreOptions }: { onMoreOptions: () => void }) {
  const profile = useConnectionStore((s) => s.profile);
  const setScanMode = useConnectionStore((s) => s.setScanMode);
  const locked = useLocked();

  const activePreset = ACTIVE_PRESET[profile.scan_mode] ?? null;
  const isActive = (p: QuickPreset) => activePreset === p.label;

  return (
    <div className="flex w-full max-w-[320px] flex-col gap-1.5">
      <span className="px-1 text-[10px] font-medium tracking-widest text-muted-foreground/60 uppercase">
        Tuning
      </span>
      <div className="flex items-center gap-1 rounded-[35px] bg-surface-2 p-1.5 ring-1 ring-border">
        <div className="flex flex-1 gap-1">
          {PRESETS.map((p) => {
            const Icon = p.icon;
            const active = isActive(p);
            const tip = locked
              ? `Disconnect first — ${p.label}: ${p.description}`
              : active
                ? `${p.label} · active — ${p.description}`
                : `${p.label} — ${p.description}`;
            return (
              <Tooltip key={p.label} delayDuration={80}>
                <TooltipTrigger asChild>
                  <motion.button
                    type="button"
                    onClick={() => setScanMode(p.scanMode)}
                    disabled={locked}
                    aria-pressed={active}
                    aria-label={tip}
                    whileTap={{ scale: 0.97 }}
                    transition={SPRING_FAST}
                    className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-[29px] px-1.5 pb-3 pt-2.5 text-[10px] leading-none outline-none select-none disabled:opacity-50 disabled:pointer-events-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-inset ${
                      active
                        ? "font-semibold text-foreground"
                        : "font-medium text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
                    }`}
                  >
                    <span
                      className={`relative flex size-[20px] shrink-0 items-center justify-center rounded-full transition-colors duration-150 ${
                        active
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-foreground/[0.07] text-muted-foreground"
                      }`}
                      aria-hidden
                    >
                      <Icon size={11} strokeWidth={active ? 2.25 : 1.9} />
                    </span>
                    <span className="relative min-w-0 truncate tracking-wide text-center">
                      {p.label}
                    </span>
                    {}
                    {active && (
                      <motion.span
                        layoutId="quick-connect-underline"
                        transition={UNDERLINE_SPRING}
                        className="pointer-events-none absolute bottom-1 left-2 right-2 h-0.5 rounded-full bg-primary"
                        aria-hidden
                      />
                    )}
                  </motion.button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6} className="max-w-[260px] text-center leading-snug">
                  {tip}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        <span aria-hidden className="h-7 w-px shrink-0 bg-border" />
        <Button
          variant="ghost"
          size="icon"
          onClick={onMoreOptions}
          disabled={locked}
          title="More options"
          aria-label="More tuning options"
          className="size-7 shrink-0 rounded-[14px] text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground active:scale-95"
        >
          <ChevronRight size={13} />
        </Button>
      </div>
    </div>
  );
}
