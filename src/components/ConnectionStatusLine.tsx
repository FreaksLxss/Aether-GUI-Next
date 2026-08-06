import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Progress } from "@/components/ui/progress";
import { useConnectionStore } from "@/state/connectionStore";
import { useWindowFocused } from "@/state/windowFocus";
import { SPRING_FAST } from "@/lib/motion";

const TEXT_TRANSITION = {
  initial: { y: 4, opacity: 0 },
  animate: { y: 0, opacity: 1, transition: SPRING_FAST },
  exit: { y: -4, opacity: 0, transition: { duration: 0.12, ease: "easeIn" as const } },
};

function useElapsed(sinceMs: number | null): { formatted: string; totalSeconds: number } {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (sinceMs == null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sinceMs]);
  if (sinceMs == null) return { formatted: "", totalSeconds: 0 };
  const total = Math.max(0, Math.floor((now - sinceMs) / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return { formatted: `${h}:${m}:${s}`, totalSeconds: total };
}

/** Determinate progress toward Aether's scan budget, or indeterminate sweep. */
function ScanProgressBar({ percent }: { percent: number | null }) {
  const focused = useWindowFocused();
  return (
    <div className="relative h-1 w-40 overflow-hidden rounded-full bg-surface-2">
      {percent == null ? (
        <div
          className="anim-scan-sweep absolute inset-y-0 left-0 w-1/3 rounded-full bg-status-connecting"
          style={{ animationPlayState: focused ? "running" : "paused" }}
        />
      ) : (
        <Progress
          value={percent}
          className="h-full bg-transparent [&>div]:bg-status-connecting"
        />
      )}
    </div>
  );
}

export function ConnectionStatusLine() {
  const status = useConnectionStore((s) => s.status);
  const scanBudgetSecs = useConnectionStore((s) => s.scanBudgetSecs);

  const [attemptStartedAt, setAttemptStartedAt] = useState<number | null>(null);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (status.state === "Launching") setAttemptStartedAt(Date.now());
    else if (status.state === "Idle") setAttemptStartedAt(null);
  }, [status.state]);
  /* eslint-enable react-hooks/set-state-in-effect */
  const isAttempting = status.state === "Launching" || status.state === "Connecting";
  const { formatted: attemptElapsed, totalSeconds: attemptSeconds } = useElapsed(
    isAttempting ? attemptStartedAt : null,
  );
  const scanPercent =
    scanBudgetSecs != null
      ? Math.min(99, Math.round((attemptSeconds / scanBudgetSecs) * 100))
      : null;

  let primary: string;
  let secondary: string;

  switch (status.state) {
    case "Idle":
      primary = "Disconnected";
      secondary = "Click to connect";
      break;
    case "Launching":
      primary = "Starting Aether…";
      secondary = "Answering setup prompts";
      break;
    case "Connecting":
      primary = "Finding a route…";
      secondary =
        scanPercent != null
          ? `Still searching · ${attemptElapsed} · ${scanPercent}%`
          : `Still searching · ${attemptElapsed}`;
      break;
    case "Reconnecting":
      primary = "Reconnecting…";
      secondary = `Attempt ${status.attempt} of ${status.max_attempts}`;
      break;
    case "Connected":
      primary = "Connected";
      secondary = "";
      break;
    case "Disconnecting":
      primary = "Disconnecting…";
      secondary = "";
      break;
    case "Error":
      primary = "Connection failed";
      secondary = status.message;
      break;
  }

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="flex flex-col items-center gap-2 text-center"
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={status.state}
          className="block text-base font-semibold tracking-tight-display text-foreground"
          {...TEXT_TRANSITION}
        >
          {primary}
        </motion.span>
      </AnimatePresence>
      <AnimatePresence mode="wait">
        <motion.span
          key={status.state}
          className="block min-h-5 max-w-xs truncate font-mono text-xs text-muted-foreground"
          {...TEXT_TRANSITION}
        >
          {secondary}
        </motion.span>
      </AnimatePresence>
      {status.state === "Connecting" && <ScanProgressBar percent={scanPercent} />}
    </div>
  );
}
