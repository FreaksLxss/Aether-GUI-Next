import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { SPRING_FAST } from "@/lib/motion";
import { useIpChangerStore } from "@/stores/ipChangerStore";

const DOT: Record<string, { label: string; cls: string; pulse?: boolean }> = {
  stopped: { label: "Stopped", cls: "bg-status-idle" },
  starting: { label: "Starting…", cls: "bg-status-connecting", pulse: true },
  running: { label: "Running", cls: "bg-status-connected" },
  stopping: { label: "Stopping…", cls: "bg-status-connecting", pulse: true },
  error: { label: "Error", cls: "bg-status-error" },
};

/** Small status dot + label for the Tor subprocess, with a soft pulse while
 * a lifecycle transition is in flight. */
export function StatusIndicator() {
  const status = useIpChangerStore((s) => s.status);
  const meta = DOT[status] ?? DOT.stopped;

  return (
    <motion.div
      key={status}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_FAST}
      className="flex items-center gap-2 px-1 text-[12px] text-muted-foreground"
    >
      <span className="relative flex size-2">
        {meta.pulse && (
          <span
            className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", meta.cls)}
          />
        )}
        <span className={cn("relative inline-flex size-2 rounded-full", meta.cls)} />
      </span>
      <span className="font-medium text-foreground/90">{meta.label}</span>
    </motion.div>
  );
}