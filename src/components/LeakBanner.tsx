import { motion } from "motion/react";
import { RefreshCw, ShieldAlert, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConnectionStore } from "@/state/connectionStore";
import { SPRING_FAST } from "@/lib/motion";

/**
 * The loudest event the window can produce: the tunnel is up but the exit IP
 * matches the real IP, so the user is visible. Full-surface red banner with
 * one clear action — disconnect now. Rendered by App only while connected.
 */
export function LeakBanner() {
  const disconnect = useConnectionStore((s) => s.disconnect);
  const runPublicIpCheck = useConnectionStore((s) => s.runPublicIpCheck);
  const loading = useConnectionStore((s) => s.publicIpLoading);

  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: -12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={SPRING_FAST}
      className="glass-strong flex w-full items-start gap-2.5 rounded-xl bg-status-error/10 px-3 py-2.5 shadow-glass ring-1 ring-inset ring-status-error/50"
    >
      <ShieldAlert size={16} className="mt-0.5 shrink-0 text-status-error" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-status-error">
          Leak detected — your real IP is visible
        </p>
        <p className="mt-0.5 text-[12px] text-foreground/80">
          The tunnel isn&apos;t masking your traffic. Disconnect now so nothing
          else goes out directly.
        </p>
        <div className="mt-2 flex items-center gap-1.5">
          <Button
            size="sm"
            onClick={() => void disconnect()}
            className="h-6 gap-1.5 bg-status-error px-2.5 text-[10px] text-white hover:opacity-85"
          >
            <Unplug size={10} />
            Disconnect now
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void runPublicIpCheck()}
            disabled={loading}
            className="h-6 gap-1 px-2 text-[10px] text-foreground/80 hover:text-foreground"
          >
            <RefreshCw size={10} className={loading ? "anim-spin" : ""} />
            Re-check
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
