import { useWindowFocused } from "@/state/windowFocus";

export function AmbientBackground() {
  const focused = useWindowFocused();
  const playState = { animationPlayState: focused ? ("running" as const) : ("paused" as const) };

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {}
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
