import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { AlertTriangle, Check, Loader2, Power } from "lucide-react";
import { useConnectionStore } from "@/state/connectionStore";
import { useWindowFocused } from "@/state/windowFocus";
import type { ConnectionStatus } from "@/types/connection";
import { cn } from "@/lib/utils";
import { SPRING_FAST } from "@/lib/motion";

const MagicRings = lazy(() => import("@/components/MagicRings"));

type Phase = "idle" | "connecting" | "connected" | "error";

function phaseOf(status: ConnectionStatus): Phase {
  switch (status.state) {
    case "Launching":
    case "Connecting":
    case "Reconnecting":
    case "Disconnecting":
      return "connecting";
    case "Connected":
      return "connected";
    case "Error":
      return "error";
    default:
      return "idle";
  }
}

/** Read the current accent color from CSS variables. */
function getAccentColor(): string {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--primary")
    .trim();
  return raw || "#f2711c";
}

/** Lighten a hex color by mixing it toward white. */
function lightenHex(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `#${lr.toString(16).padStart(2, "0")}${lg.toString(16).padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`;
}

/** Motion handles ONLY one-shots here (error shake, tap). */
const SHAKE_VARIANTS: Variants = {
  rest: { x: 0 },
  error: { x: [0, -6, 6, -4, 4, 0], transition: { x: { duration: 0.4, ease: "easeInOut" } } },
};

const ICONS: Record<Phase, typeof Power> = {
  idle: Power,
  connecting: Loader2,
  connected: Check,
  error: AlertTriangle,
};

const ARIA_LABEL: Record<Phase, string> = {
  idle: "Connect (Ctrl+Shift+C)",
  connecting: "Cancel connecting (Ctrl+Shift+C)",
  connected: "Disconnect (Ctrl+Shift+C)",
  error: "Retry connection (Ctrl+Shift+C)",
};

export function ConnectButton() {
  const status = useConnectionStore((s) => s.status);
  const connect = useConnectionStore((s) => s.connect);
  const disconnect = useConnectionStore((s) => s.disconnect);
  const focused = useWindowFocused();
  const wrapRef = useRef<HTMLDivElement>(null);

  const phase = phaseOf(status);
  const Icon = ICONS[phase];

  const [center, setCenter] = useState({ x: 0, y: 0 });
  const [winSize, setWinSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [accent, setAccent] = useState({ primary: "#f2711c", secondary: "#fbbf24" });

  // Center is state but updated only on mount, resize/orientation (rAF-throttled),
  // and once when phase enters "connecting" — no per-frame rAF loop.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const updateCenter = () => {
      const rect = el.getBoundingClientRect();
      setCenter({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    };
    updateCenter();
    let rafId = 0;
    let pending = false;
    const onResize = () => {
      if (pending) return;
      pending = true;
      rafId = requestAnimationFrame(() => {
        pending = false;
        updateCenter();
        setWinSize({ w: window.innerWidth, h: window.innerHeight });
      });
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  // Accent + center snapshot once when entering connecting (not each frame).
  useEffect(() => {
    if (phase !== "connecting") return;
    const el = wrapRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      setCenter({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    }
    const raw = getAccentColor();
    setAccent({ primary: raw, secondary: lightenHex(raw, 0.35) });
  }, [phase]);

  const playState = { animationPlayState: focused ? ("running" as const) : ("paused" as const) };

  const handleClick = () => {
    if (phase === "idle" || phase === "error") {
      void connect();
    } else {
      void disconnect();
    }
  };

  return (
    <>
      <AnimatePresence>
        {phase === "connecting" && (
          <motion.div
            key="magic-rings"
            aria-hidden
            className="pointer-events-none fixed inset-0 z-[1]"
            style={{
              transform: `translate(${center.x - winSize.w / 2}px, ${center.y - winSize.h / 2}px)`,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
          >
            <Suspense fallback={null}>
              <MagicRings
                color={accent.primary}
                colorTwo={accent.secondary}
                speed={1.5}
                ringCount={3}
                attenuation={document.documentElement.classList.contains("light") ? 14 : 8}
                lineThickness={1}
                baseRadius={0.10}
                radiusStep={0.09}
                scaleRate={0.1}
                opacity={document.documentElement.classList.contains("light") ? 0.45 : 0.9}
                noiseAmount={0}
                rotation={15}
                ringGap={1.3}
                fadeIn={1}
                fadeOut={0.4}
                parallax={0.1}
              />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>

      <div ref={wrapRef} className="relative flex size-40 items-center justify-center">
        <motion.button
          type="button"
          aria-label={ARIA_LABEL[phase]}
          onClick={handleClick}
          disabled={status.state === "Disconnecting"}
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.02 }}
          transition={SPRING_FAST}
          animate={phase === "error" ? "error" : "rest"}
          variants={SHAKE_VARIANTS}
          className="group relative z-10 flex size-40 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
        >
          {/* Disc material — opaque tonal surface, hairline ring; glass only via subtle inner highlight */}
          <span
            aria-hidden
            className="absolute inset-0 rounded-full bg-surface-2 ring-1 ring-border"
          />
          <span
            aria-hidden
            className="absolute inset-0 rounded-full bg-gradient-to-b from-white/[0.04] to-transparent pointer-events-none"
          />
          {/* Inner status tint — restrained, never full glow at idle */}
          <span
            aria-hidden
            className={cn(
              "absolute inset-0 rounded-full transition-colors duration-300",
              phase === "connected"
                ? "bg-primary/[0.09]"
                : phase === "connecting"
                  ? "bg-status-connecting/[0.08]"
                  : phase === "error"
                    ? "bg-status-error/[0.08]"
                    : "bg-transparent",
            )}
          />
          {/* Status ring — hairline, not halo */}
          <span
            aria-hidden
            className={cn(
              "absolute inset-0 rounded-full transition-colors duration-500",
              phase === "connected" && "ring-1 ring-primary/25",
              phase === "connecting" && "ring-1 ring-status-connecting/30",
              phase === "error" && "ring-1 ring-status-error/30",
            )}
          />
          <AnimatePresence mode="wait">
            <motion.span
              key={phase}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={SPRING_FAST}
              className="relative flex items-center justify-center"
            >
              <Icon
                size={48}
                strokeWidth={2}
                style={phase === "connecting" ? playState : undefined}
                className={
                  phase === "connecting"
                    ? "animate-spin text-status-connecting"
                    : phase === "connected"
                      ? "text-primary"
                      : phase === "error"
                        ? "text-status-error"
                        : "text-status-idle"
                }
              />
            </motion.span>
          </AnimatePresence>
        </motion.button>
      </div>
    </>
  );
}
