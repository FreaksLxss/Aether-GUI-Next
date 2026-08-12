import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { EyeOff, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useConnectionStore } from "@/state/connectionStore";
import { useWindowFocused } from "@/state/windowFocus";
import { openLogWindow } from "@/lib/log-window";
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

export function ConnectionStatusLine({ onTryStealth }: { onTryStealth?: () => void }) {
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
      secondary = `The tunnel dropped — getting you back · attempt ${status.attempt} of ${status.max_attempts}`;
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
      primary = "Couldn't connect";
      secondary = status.message;
      break;
  }

  /**
   * Live announcements are scoped to the primary line only. The secondary
   * line (e.g. the "Still searching · 0:12" elapsed timer) re-renders every
   * second, so putting it inside a live region would spam screen readers —
   * announcing only discrete state transitions keeps it dependable.
   */
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <AnimatePresence mode="wait">
        <motion.span
          key={status.state}
          aria-live="polite"
          aria-atomic="true"
          className="block text-base font-semibold tracking-tight-display text-foreground"
          {...TEXT_TRANSITION}
        >
          {primary}
        </motion.span>
      </AnimatePresence>
      <AnimatePresence mode="wait">
        <motion.span
          key={status.state}
          className={
            status.state === "Error"
              ? "block max-w-sm whitespace-pre-wrap font-mono text-xs leading-relaxed text-status-error"
              : "block min-h-5 max-w-xs truncate font-mono text-xs text-muted-foreground"
          }
          {...TEXT_TRANSITION}
        >
          {secondary}
        </motion.span>
      </AnimatePresence>
      {status.state === "Error" && (
        <div className="flex flex-col items-center gap-1.5">
          <p className="max-w-xs text-[12px] text-muted-foreground">
            If the tunnel can&apos;t get through, Stealth mode probes more
            cautiously and is harder for a censor to detect.
          </p>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={onTryStealth} className="h-7 gap-1.5 text-[12px]">
              <EyeOff size={11} />
              Try Stealth mode
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void openLogWindow()}
              className="h-7 gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
            >
              <Terminal size={11} />
              View log
            </Button>
          </div>
        </div>
      )}
      {status.state === "Connecting" && <ScanProgressBar percent={scanPercent} />}
    </div>
  );
}
