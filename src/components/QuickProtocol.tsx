import { Cloud, Layers, Sparkles, Zap } from "lucide-react";
import { motion, type Transition } from "motion/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConnectionStore } from "@/state/connectionStore";
import { useLocked } from "@/hooks/useLocked";
import type { Protocol } from "@/types/connection";
import { SPRING_FAST } from "@/lib/motion";

const PILL_SPRING: Transition = { type: "spring", stiffness: 240, damping: 32, mass: 1 };

interface QuickProtocolOption {
  value: Protocol;
  label: string;
  icon: typeof Sparkles;
  description: string;
}

const OPTIONS: QuickProtocolOption[] = [
  {
    value: "auto",
    label: "Auto",
    icon: Sparkles,
    description: "Aether picks the best protocol",
  },
  {
    value: "masque",
    label: "MASQUE",
    icon: Cloud,
    description: "Disguised as ordinary HTTPS",
  },
  {
    value: "wireguard",
    label: "WireGuard",
    icon: Zap,
    description: "Lighter and faster",
  },
  {
    value: "gool",
    label: "WARP-in-WARP",
    icon: Layers,
    description: "Double tunnel, maximum security",
  },
];

export function QuickProtocol() {
  const protocol = useConnectionStore((s) => s.profile.protocol);
  const setProtocol = useConnectionStore((s) => s.setProtocol);
  const locked = useLocked();

  return (
    <div className="flex w-full max-w-[320px] flex-col gap-1.5">
      <span className="px-1 text-[10px] font-medium tracking-widest text-muted-foreground/60 uppercase">
        Protocol
      </span>
      <div className="flex gap-1 rounded-[35px] bg-surface-2 p-1.5 ring-1 ring-border">
        {OPTIONS.map((o) => {
          const Icon = o.icon;
          const active = protocol === o.value;
          const tip = locked
            ? `Disconnect first — ${o.label}: ${o.description}`
            : active
              ? `${o.label} · active — ${o.description}`
              : `${o.label} — ${o.description}`;
          return (
            <Tooltip key={o.value} delayDuration={80}>
              <TooltipTrigger asChild>
                <motion.button
                  type="button"
                  onClick={() => setProtocol(o.value)}
                  disabled={locked}
                  aria-pressed={active}
                  aria-label={tip}
                  whileTap={{ scale: 0.97 }}
                  transition={SPRING_FAST}
                  className={`relative flex min-w-0 flex-1 items-center justify-center gap-1 overflow-hidden rounded-[35px] px-1.5 py-2 text-[10px] leading-none outline-none select-none disabled:opacity-50 disabled:pointer-events-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-inset ${
                    active
                      ? "font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="quick-protocol-pill"
                      transition={PILL_SPRING}
                      className="absolute inset-0 overflow-hidden rounded-[35px] bg-card shadow-[0_2px_10px_-6px_rgba(0,0,0,0.45),0_1px_3px_-1px_rgba(0,0,0,0.35),inset_0_1px_0_0_rgba(255,255,255,0.06)] ring-1 ring-border"
                      aria-hidden
                    />
                  )}
                  <span
                    className={`relative flex size-[18px] shrink-0 items-center justify-center rounded-full transition-colors duration-150 ${
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-foreground/[0.07] text-muted-foreground"
                    }`}
                    aria-hidden
                  >
                    <Icon size={10} />
                  </span>
                  <span className="relative min-w-0 flex-1 truncate tracking-wide text-center">
                    {o.label}
                  </span>
                  {active && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute bottom-[5px] left-1/2 h-px w-6 -translate-x-1/2 rounded-full bg-primary/60"
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
    </div>
  );
}