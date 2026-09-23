import { useEffect, useRef } from "react";


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
  const tl = parsePx(cs.getPropertyValue("--window-radius-tl"), parsePx(cs.getPropertyValue("--window-radius"), 18));
  const tr = parsePx(cs.getPropertyValue("--window-radius-tr"), parsePx(cs.getPropertyValue("--window-radius"), 18));
  const br = parsePx(cs.getPropertyValue("--window-radius-br"), 30);
  const bl = parsePx(cs.getPropertyValue("--window-radius-bl"), 30);
  return {
    tl: tl || 18,
    tr: tr || 18,
    br: br || 30,
    bl: bl || 30,
  };
}

export function useSquircleClip(radius?: number | CornerRadii) {
  const ref = useRef<HTMLDivElement>(null);
  const uniformRadius = typeof radius === "number" ? radius : undefined;
  const { tl, tr, br, bl } = typeof radius === "object" && radius !== null ? radius : {};

  useEffect(() => {
    const radius = uniformRadius ?? (
      tl !== undefined && tr !== undefined && br !== undefined && bl !== undefined
        ? { tl, tr, br, bl }
        : undefined
    );
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

    try {
      const supports =
        typeof CSS !== "undefined" &&
        (CSS.supports("corner-shape", "squircle") || CSS.supports("corner-shape: squircle"));
      if (supports) {
        const rr = getRadii();
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
    } catch {
    }

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
  }, [uniformRadius, tl, tr, br, bl]);

  return ref;
}
