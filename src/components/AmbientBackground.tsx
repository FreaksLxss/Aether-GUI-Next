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
      {/* Single composed light source — top-center wash that the glass
          actually refracts. Secondary orb is faint and low so it reads
          as bounced light, not a second equal lamp. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(110% 72% at 50% -8%, color-mix(in srgb, var(--color-primary) 9%, transparent) 0%, transparent 62%)",
        }}
      />
      <div
        className="anim-orb-a absolute size-72 rounded-full"
        style={{
          top: -70,
          left: "50%",
          opacity: 0.11,
          transform: "translateX(-50%)",
          background: "radial-gradient(circle, var(--color-primary) 0%, transparent 68%)",
          willChange: "transform, opacity",
          ...playState,
        }}
      />
      <div
        className="anim-orb-b absolute size-48 rounded-full"
        style={{
          bottom: -36,
          left: -56,
          opacity: 0.06,
          background:
            "radial-gradient(circle, var(--color-primary) 0%, transparent 70%)",
          willChange: "transform, opacity",
          ...playState,
        }}
      />
    </div>
  );
}
