import { Cloud, Layers, Sparkles, Zap } from "lucide-react";
import { motion } from "motion/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConnectionStore } from "@/state/connectionStore";
import type { Protocol } from "@/types/connection";
import { SPRING_FAST } from "@/lib/motion";

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

/** Quick protocol switcher — mirrors the QuickConnect pill so the primary
 *  decision (Fast/Balanced/Secure) and the occasionally-needed protocol
 *  override stay visually paired. */
export function QuickProtocol() {
  const protocol = useConnectionStore((s) => s.profile.protocol);
  const setProtocol = useConnectionStore((s) => s.setProtocol);
  const status = useConnectionStore((s) => s.status);
  const locked = status.state !== "Idle" && status.state !== "Error";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="glass-float flex rounded-xl p-0.5 shadow-glass ring-1 ring-white/10">
          {OPTIONS.map((o) => {
            const Icon = o.icon;
            const active = protocol === o.value;
            return (
              <motion.button
                key={o.value}
                type="button"
                onClick={() => setProtocol(o.value)}
                disabled={locked}
                aria-pressed={active}
                title={active ? `${o.description} · active` : o.description}
                whileTap={{ scale: 0.96 }}
                transition={SPRING_FAST}
                className={`relative flex h-auto flex-col items-center justify-center gap-0.5 px-[0.6rem] py-2 text-[10px] outline-none transition-colors duration-150 select-none disabled:opacity-50 disabled:pointer-events-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-inset rounded-lg ${
                  active
                    ? "font-semibold text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="quick-protocol-pill"
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={SPRING_FAST}
                    className="absolute inset-0 rounded-xl bg-primary shadow-md shadow-primary/40"
                  />
                )}
                <Icon size={12} className="relative" aria-hidden />
                <span className="relative">{o.label}</span>
              </motion.button>
            );
          })}
        </div>
      </TooltipTrigger>
      {locked && (
        <TooltipContent side="bottom">
          Disconnect first to change protocol
        </TooltipContent>
      )}
    </Tooltip>
  );
}