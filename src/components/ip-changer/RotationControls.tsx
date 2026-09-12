import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Loader2, Power, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIpChangerStore } from "@/stores/ipChangerStore";

/** Start/stop + rotate buttons for the Tor subprocess. */
export function RotationControls() {
  const status = useIpChangerStore((s) => s.status);
  const transitioning = useIpChangerStore((s) => s.transitioning);
  const rotating = useIpChangerStore((s) => s.rotating);
  const binaryAvailable = useIpChangerStore((s) => s.binaryAvailable);
  const error = useIpChangerStore((s) => s.error);
  const start = useIpChangerStore((s) => s.start);
  const stop = useIpChangerStore((s) => s.stop);
  const rotate = useIpChangerStore((s) => s.rotate);

  const running = status === "running";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {running ? (
          <>
            <Button
              variant="secondary"
              size="default"
              onClick={() => void stop()}
              disabled={transitioning}
              aria-label="Stop Tor"
              className="flex-1 rounded-xl bg-white/[0.06] ring-1 ring-white/[0.06] hover:bg-white/[0.10] light:bg-black/[0.06] light:ring-black/5 light:hover:bg-black/10"
            >
              <Power size={13} />
              Stop
            </Button>
            <motion.div className="flex-1" initial={false} animate={{ opacity: 1 }}>
              <Button
                size="default"
                onClick={() => void rotate()}
                disabled={rotating}
                aria-label="Rotate IP address"
                className="w-full rounded-xl shadow-[0_2px_10px_-4px_rgba(234,88,12,0.4)]"
              >
                {rotating ? <Loader2 size={13} className="anim-spin" /> : <Shuffle size={13} />}
                {rotating ? "Rotating…" : "Rotate IP"}
              </Button>
            </motion.div>
          </>
        ) : (
          <Button
            size="default"
            onClick={() => void start()}
            disabled={transitioning || !binaryAvailable}
            aria-label="Start Tor"
            className="flex-1 rounded-xl shadow-[0_2px_10px_-4px_rgba(234,88,12,0.4)]"
          >
            {transitioning ? <Loader2 size={13} className="anim-spin" /> : <Power size={13} />}
            {transitioning ? "Starting…" : "Start Tor"}
          </Button>
        )}
      </div>

      <AnimatePresence>
        {error && status === "error" && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-2.5 py-2 text-[11px] leading-relaxed text-red-400 ring-1 ring-red-500/15"
          >
            <AlertTriangle size={11} className="shrink-0" />
            <span className="min-w-0 break-words">{error}</span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
