export const PRIMARY_KEY = "aether-custom-primary";
export const SECONDARY_KEY = "aether-custom-secondary";

export const PRIMARY_COLORS: [string, string][] = [
  ["#f2711c", "Orange"],
  ["#ea580c", "Deep Orange"],
  ["#dc2626", "Red"],
  ["#e11d48", "Rose"],
  ["#a855f7", "Purple"],
  ["#6366f1", "Indigo"],
  ["#3b82f6", "Blue"],
  ["#06b6d4", "Cyan"],
  ["#14b8a6", "Teal"],
  ["#22c55e", "Green"],
  ["#84cc16", "Lime"],
  ["#eab308", "Yellow"],
];

export const SECONDARY_DEFAULT = "#242424";

function hexToHSL(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function deriveSurfaces(hex: string): [string, string, string, string] {
  const { h, s } = hexToHSL(hex);
  return [
    hslToHex(h, Math.min(s, 20), 10),
    hslToHex(h, Math.min(s, 18), 12),
    hslToHex(h, Math.min(s, 15), 15),
    hslToHex(h, Math.min(s, 12), 18),
  ];
}

function deriveLightSurfaces(hex: string): [string, string, string, string] {
  const { h, s } = hexToHSL(hex);
  return [
    hslToHex(h, Math.min(s, 10), 98),
    hslToHex(h, Math.min(s, 8), 94),
    hslToHex(h, Math.min(s, 6), 90),
    hslToHex(h, Math.min(s, 5), 85),
  ];
}

function lightenForLight(hex: string): string {
  const { h, s, l } = hexToHSL(hex);
  return hslToHex(h, Math.min(s, 15), Math.max(l, 85));
}

function isDarkMode(): boolean {
  return !document.documentElement.classList.contains("light");
}

let lastPrimary: string | null = null;
let lastSecondary: string | null = null;

export function applyColors(primary: string, secondary: string, dark?: boolean) {
  const root = document.documentElement;
  const isDark = dark ?? isDarkMode();
  lastPrimary = primary;
  lastSecondary = secondary;
  const { l: pl } = hexToHSL(primary);

  root.style.setProperty("--primary", primary);
  root.style.setProperty("--ring", primary);
  root.style.setProperty("--color-primary", primary);
  root.style.setProperty("--color-ring", primary);
  root.style.setProperty("--color-sidebar-primary", primary);
  root.style.setProperty("--color-sidebar-ring", primary);
  root.style.setProperty("--primary-foreground", pl > 50 ? "#0d0d0f" : "#f2f2f2");
  root.style.setProperty("--status-connecting", primary);
  root.style.setProperty("--color-status-connecting", primary);

  if (isDark) {
    root.style.setProperty("--secondary", secondary);
    root.style.setProperty("--color-secondary", secondary);
    root.style.setProperty("--card", secondary);
    root.style.setProperty("--color-card", secondary);
    root.style.setProperty("--popover", secondary);
    root.style.setProperty("--color-popover", secondary);
    root.style.setProperty("--muted", secondary);
    root.style.setProperty("--color-muted", secondary);
    root.style.setProperty("--accent", secondary);
    root.style.setProperty("--color-accent", secondary);
    root.style.setProperty("--card-foreground", "#f2f2f2");
    root.style.setProperty("--popover-foreground", "#f2f2f2");
    root.style.setProperty("--secondary-foreground", "#f2f2f2");
    root.style.setProperty("--muted-foreground", "#a3a3a3");
    root.style.setProperty("--accent-foreground", "#f2f2f2");

    const [s1, s2, s3, s4] = deriveSurfaces(secondary);
    root.style.setProperty("--surface-1", s1);
    root.style.setProperty("--surface-2", s2);
    root.style.setProperty("--surface-3", s3);
    root.style.setProperty("--surface-4", s4);
    root.style.setProperty("--color-surface-1", s1);
    root.style.setProperty("--color-surface-2", s2);
    root.style.setProperty("--color-surface-3", s3);
    root.style.setProperty("--color-surface-4", s4);
  } else {
    const lightSec = lightenForLight(secondary);
    root.style.setProperty("--secondary", lightSec);
    root.style.setProperty("--color-secondary", lightSec);
    root.style.setProperty("--card", "#ffffff");
    root.style.setProperty("--color-card", "#ffffff");
    root.style.setProperty("--popover", "#ffffff");
    root.style.setProperty("--color-popover", "#ffffff");
    root.style.setProperty("--muted", lightSec);
    root.style.setProperty("--color-muted", lightSec);
    root.style.setProperty("--accent", lightenForLight(secondary));
    root.style.setProperty("--color-accent", lightenForLight(secondary));
    root.style.setProperty("--card-foreground", "#171717");
    root.style.setProperty("--popover-foreground", "#171717");
    root.style.setProperty("--secondary-foreground", "#171717");
    root.style.setProperty("--muted-foreground", "#525252");
    root.style.setProperty("--accent-foreground", "#171717");

    const [s1, s2, s3, s4] = deriveLightSurfaces(secondary);
    root.style.setProperty("--surface-1", s1);
    root.style.setProperty("--surface-2", s2);
    root.style.setProperty("--surface-3", s3);
    root.style.setProperty("--surface-4", s4);
    root.style.setProperty("--color-surface-1", s1);
    root.style.setProperty("--color-surface-2", s2);
    root.style.setProperty("--color-surface-3", s3);
    root.style.setProperty("--color-surface-4", s4);
  }
}

function resetColors() {
  lastPrimary = null;
  lastSecondary = null;
  const root = document.documentElement;
  for (const p of [
    "--primary", "--ring", "--color-primary", "--color-ring",
    "--color-sidebar-primary", "--color-sidebar-ring",
    "--primary-foreground", "--status-connecting", "--color-status-connecting",
    "--secondary", "--color-secondary", "--card", "--color-card",
    "--popover", "--color-popover", "--muted", "--color-muted",
    "--accent", "--color-accent",
    "--surface-1", "--surface-2", "--surface-3", "--surface-4",
    "--color-surface-1", "--color-surface-2", "--color-surface-3", "--color-surface-4",
  ]) root.style.removeProperty(p);
}

/** Re-apply saved colors when the theme class toggles (e.g. light/dark). */
export function initThemeColors() {
  if (typeof MutationObserver !== "undefined") {
    const observer = new MutationObserver(() => {
      if (lastPrimary && lastSecondary) {
        applyColors(lastPrimary, lastSecondary);
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }
}

export function clearCustomColors() {
  resetColors();
}

export function getLastColors(): { primary: string; secondary: string } | null {
  return lastPrimary && lastSecondary ? { primary: lastPrimary, secondary: lastSecondary } : null;
}
