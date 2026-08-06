import { useWindowFocused } from "@/state/windowFocus";

/**
 * Two soft gradient orbs. All motion is pure CSS (transform/opacity
 * keyframes in index.css) on compositor-promoted layers — zero main-thread
 * work per frame, honors prefers-reduced-motion via the media query there.
 * No blur filter: a radial gradient already fades smoothly, so blur-[65px]
 * was visually redundant while forcing an expensive re-raster of the layer.
 * Paused (not removed) while the window is unfocused so the app costs
 * ~nothing in the background and nothing jumps on refocus.
 */
export function AmbientBackground() {
  const focused = useWindowFocused();
  // Inline, not a Tailwind pause class — the unlayered .anim-* shorthands
  // beat layered utilities in the cascade (see ConnectButton).
  const playState = { animationPlayState: focused ? ("running" as const) : ("paused" as const) };

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {/* Base radial wash — gives the frosted-glass layers something to
          refract behind them; compositor-only and static. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--color-primary) 10%, transparent) 0%, transparent 70%)",
        }}
      />
      <div
        className="anim-orb-a absolute size-65 rounded-full"
        style={{
          top: -60,
          right: -60,
          opacity: 0.14,
          background: "radial-gradient(circle, var(--color-primary) 0%, transparent 70%)",
          willChange: "transform, opacity",
          ...playState,
        }}
      />
      <div
        className="anim-orb-b absolute size-55 rounded-full"
        style={{
          bottom: -40,
          left: -80,
          opacity: 0.1,
          background:
            "radial-gradient(circle, var(--color-primary) 0%, transparent 70%)",
          willChange: "transform, opacity",
          ...playState,
        }}
      />
    </div>
  );
}
