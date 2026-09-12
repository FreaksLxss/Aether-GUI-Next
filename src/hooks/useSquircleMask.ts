import { useEffect, useRef } from "react";

/**
 * iOS corners are a genuine "squircle" (superellipse), not a plain circular
 * border-radius — the curve pulls toward the corner midpoint so it looks softer
 * and more continuous than a plain radius. This hook clips the host element to
 * an SVG-style squircle path that re-fits on resize. Where the browser already
 * speaks `corner-shape: squircle`, we let CSS handle it and skip the clipPath.
 */

const IOS_R1 = 0.0586;
const IOS_R2 = 0.332;

type CornerRadii = { tl: number; tr: number; br: number; bl: number };

function buildSquirclePathPerCorner(
  w: number,
  h: number,
  r: CornerRadii,
): string {
  const tl1 = r.tl * IOS_R1, tl2 = r.tl * IOS_R2;
  const tr1 = r.tr * IOS_R1, tr2 = r.tr * IOS_R2;
  const br1 = r.br * IOS_R1, br2 = r.br * IOS_R2;
  const bl1 = r.bl * IOS_R1, bl2 = r.bl * IOS_R2;
  return [
    `M 0,${tl2}`,
    `C 0,${tl1} ${tl1},0 ${tl2},0`,
    `L ${w - tr2},0`,
    `C ${w - tr1},0 ${w},${tr1} ${w},${tr2}`,
    `L ${w},${h - br2}`,
    `C ${w},${h - br1} ${w - br1},${h} ${w - br2},${h}`,
    `L ${bl2},${h}`,
    `C ${bl1},${h} 0,${h - bl1} 0,${h - bl2}`,
    `Z`,
  ].join(" ");
}

function buildSquirclePath(w: number, h: number, r: number): string {
  return buildSquirclePathPerCorner(w, h, { tl: r, tr: r, br: r, bl: r });
}

function matchRadius(radius: number | undefined, width: number, height: number): number {
  const max = Math.min(width, height) / 2;
  if (radius === undefined) return max;
  return Math.min(radius, max);
}

function parsePx(v: string, fallback: number): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function readCSSCornerRadii(el: HTMLElement): CornerRadii {
  const cs = getComputedStyle(el);
  // Prefer per-corner vars, fall back to shared --window-radius
  const tl = parsePx(cs.getPropertyValue("--window-radius-tl"), parsePx(cs.getPropertyValue("--window-radius"), 18));
  const tr = parsePx(cs.getPropertyValue("--window-radius-tr"), parsePx(cs.getPropertyValue("--window-radius"), 18));
  const br = parsePx(cs.getPropertyValue("--window-radius-br"), 30);
  const bl = parsePx(cs.getPropertyValue("--window-radius-bl"), 30);
  // If any is 0/missing, fall back to sensible defaults
  return {
    tl: tl || 18,
    tr: tr || 18,
    br: br || 30,
    bl: bl || 30,
  };
}

export function useSquircleClip(radius?: number | CornerRadii) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const getRadii = (): CornerRadii => {
      if (radius == null) return readCSSCornerRadii(el as HTMLElement);
      if (typeof radius === "number") {
        const r = radius;
        return { tl: r, tr: r, br: r, bl: r };
      }
      return radius;
    };

    // Feature-detect native corner-shape; if available just set it and keep CSS radii.
    try {
      const supports =
        typeof CSS !== "undefined" &&
        (CSS.supports("corner-shape", "squircle") || CSS.supports("corner-shape: squircle"));
      if (supports) {
        const rr = getRadii();
        // Keep the CSS per-corner vars as the source of truth — just enable squircle
        // and ensure border-radius reflects the intended per-corner radii when a
        // numeric override was passed. Otherwise leave CSS alone.
        if (radius != null) {
          if (typeof radius === "number") {
            el.style.borderRadius = `${radius}px`;
          } else {
            el.style.borderRadius = `${rr.tl}px ${rr.tr}px ${rr.br}px ${rr.bl}px`;
          }
        }
        el.style.setProperty("corner-shape", "squircle");
        el.style.clipPath = "";
        return;
      }
    } catch {}

    const apply = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const rr = getRadii();
      const max = Math.min(rect.width, rect.height) / 2;
      const clamped: CornerRadii = {
        tl: Math.min(rr.tl, max),
        tr: Math.min(rr.tr, max),
        br: Math.min(rr.br, max),
        bl: Math.min(rr.bl, max),
      };
      // Preserve existing matchRadius logic for single-value case
      if (typeof radius === "number") {
        const r = matchRadius(radius, rect.width, rect.height);
        const d = buildSquirclePath(Math.ceil(rect.width), Math.ceil(rect.height), r);
        el.style.clipPath = `path('${d}')`;
        return;
      }
      const d = buildSquirclePathPerCorner(
        Math.ceil(rect.width),
        Math.ceil(rect.height),
        clamped,
      );
      el.style.clipPath = `path('${d}')`;
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [radius == null ? undefined : typeof radius === "number" ? radius : `${(radius as CornerRadii).tl},${(radius as CornerRadii).tr},${(radius as CornerRadii).br},${(radius as CornerRadii).bl}`]);

  return ref;
}
