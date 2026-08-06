import { useEffect, useRef } from "react";

/**
 * iOS corners are a genuine "squircle" (superellipse), not a plain circular
 * border-radius — the curve pulls toward the corner midpoint so it looks softer
 * and more continuous than a plain radius. This hook clips the host element to
 * an SVG-style squircle path that re-fits on resize.
 */

const IOS_R1 = 0.0586;
const IOS_R2 = 0.332;

function buildSquirclePath(w: number, h: number, r: number): string {
  const r2 = r * IOS_R2;
  const r1 = r * IOS_R1;
  return [
    `M 0,${r2}`,
    `C 0,${r1} ${r1},0 ${r2},0`,
    `L ${w - r2},0`,
    `C ${w - r1},0 ${w},${r1} ${w},${r2}`,
    `L ${w},${h - r2}`,
    `C ${w},${h - r1} ${w - r1},${h} ${w - r2},${h}`,
    `L ${r2},${h}`,
    `C ${r1},${h} 0,${h - r1} 0,${h - r2}`,
    `Z`,
  ].join(" ");
}

function matchRadius(radius: number | undefined, width: number, height: number): number {
  const max = Math.min(width, height) / 2;
  if (radius === undefined) return max;
  return Math.min(radius, max);
}

export function useSquircleClip(radius?: number) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const apply = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const r = matchRadius(radius, rect.width, rect.height);
      const d = buildSquirclePath(Math.ceil(rect.width), Math.ceil(rect.height), r);
      el.style.clipPath = `path('${d}')`;
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [radius]);

  return ref;
}