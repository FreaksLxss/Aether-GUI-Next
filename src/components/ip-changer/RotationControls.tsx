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
              className="flex-1"
            >
              <Power size={13} />
              Stop
            </Button>
            <motion.div
              className="flex-1"
              initial={false}
              animate={{ opacity: 1 }}
            >
              <Button
                size="default"
                onClick={() => void rotate()}
                disabled={rotating}
                aria-label="Rotate IP address"
                className="w-full"
              >
                {rotating ? (
                  <Loader2 size={13} className="anim-spin" />
                ) : (
                  <Shuffle size={13} />
                )}
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
            className="flex-1"
          >
            {transitioning ? (
              <Loader2 size={13} className="anim-spin" />
            ) : (
              <Power size={13} />
            )}
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
            className="flex items-center gap-1.5 text-[10px] text-status-error"
          >
            <AlertTriangle size={11} />
            <span className="truncate">{error}</span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}