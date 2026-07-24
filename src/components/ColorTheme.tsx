import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Palette } from "lucide-react";

const PRIMARY_KEY = "aether-custom-primary";
const SECONDARY_KEY = "aether-custom-secondary";

const PRIMARY_COLORS: [string, string][] = [
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

const SECONDARY_COLORS: [string, string][] = [
  ["#242424", "Charcoal"],
  ["#1e1e1e", "Dark Gray"],
  ["#2a2a2a", "Graphite"],
  ["#333333", "Slate"],
  ["#3b3b3b", "Steel"],
  ["#404040", "Ash"],
  ["#4a4a4a", "Medium Gray"],
  ["#555555", "Silver"],
];

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
  let h = 0;
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

/** Derive surface tones from a hex color. Returns [surface-1, surface-2, surface-3, surface-4]
 *  from lightest to darkest (for dark theme, lighter = higher elevation). */
function deriveSurfaces(hex: string): [string, string, string, string] {
  const { h, s } = hexToHSL(hex);
  return [
    hslToHex(h, Math.min(s, 20), 10),
    hslToHex(h, Math.min(s, 18), 12),
    hslToHex(h, Math.min(s, 15), 15),
    hslToHex(h, Math.min(s, 12), 18),
  ];
}

/** Derive light-mode surface tones — light backgrounds, dark foregrounds. */
function deriveLightSurfaces(hex: string): [string, string, string, string] {
  const { h, s } = hexToHSL(hex);
  return [
    hslToHex(h, Math.min(s, 10), 98),
    hslToHex(h, Math.min(s, 8), 94),
    hslToHex(h, Math.min(s, 6), 90),
    hslToHex(h, Math.min(s, 5), 85),
  ];
}

/** Lighten a dark hex color for use as light-mode secondary/muted. */
function lightenForLight(hex: string): string {
  const { h, s, l } = hexToHSL(hex);
  return hslToHex(h, Math.min(s, 15), Math.max(l, 85));
}

function isDarkMode(): boolean {
  return !document.documentElement.classList.contains("light");
}

/** Track the last-applied colors so the observer can re-apply on theme change. */
let lastPrimary: string | null = null;
let lastSecondary: string | null = null;

export function applyColors(primary: string, secondary: string, dark?: boolean) {
  const root = document.documentElement;
  const isDark = dark ?? isDarkMode();
  lastPrimary = primary;
  lastSecondary = secondary;
  const { l: pl } = hexToHSL(primary);

  // Primary — same in both modes
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
    // Dark mode — secondary as-is, dark surfaces
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
    // Light mode — lighten secondary, light surfaces, dark foregrounds
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

// Watch for class changes on <html> (theme toggle) and re-apply custom colors.
// This guarantees correct light/dark surfaces regardless of React effect timing.
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

function ColorRow({
  label,
  colors,
  selected,
  onSelect,
}: {
  label: string;
  colors: [string, string][];
  selected: string | null;
  onSelect: (hex: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {colors.map(([hex, name]) => (
          <button
            key={hex}
            onClick={() => onSelect(hex)}
            aria-label={`${label} color: ${name}`}
            className={`size-7 cursor-pointer rounded-md ring-1 transition-all hover:scale-105 ${
              selected === hex
                ? "ring-2 ring-white ring-offset-1 ring-offset-surface-1"
                : "ring-white/15 hover:ring-white/40"
            }`}
            style={{ backgroundColor: hex }}
          />
        ))}
        <input
          type="color"
          value={selected ?? colors[0][0]}
          onChange={(e) => onSelect(e.target.value)}
          className="size-7 cursor-pointer rounded-md border border-white/10 bg-transparent p-0"
          aria-label="Custom color picker"
          title="Custom color"
        />
      </div>
    </div>
  );
}

export function ColorTheme() {
  const [primary, setPrimary] = useState<string | null>(null);
  const [secondary, setSecondary] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    },
    [open],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [open, handleKeyDown]);

  useEffect(() => {
    const p = localStorage.getItem(PRIMARY_KEY);
    const s = localStorage.getItem(SECONDARY_KEY);
    if (p && s) {
      setPrimary(p);
      setSecondary(s);
      // Read theme from localStorage directly — don't rely on DOM class
      // which may not be set yet if ThemeToggle's effect hasn't run
      const savedTheme = localStorage.getItem("aether-theme");
      const dark = savedTheme ? savedTheme === "dark" : true;
      applyColors(p, s, dark);
    }
  }, []);

  const pickPrimary = (hex: string) => {
    setPrimary(hex);
    localStorage.setItem(PRIMARY_KEY, hex);
    applyColors(hex, secondary ?? SECONDARY_COLORS[0][0]);
  };

  const pickSecondary = (hex: string) => {
    setSecondary(hex);
    localStorage.setItem(SECONDARY_KEY, hex);
    applyColors(primary ?? PRIMARY_COLORS[0][0], hex);
  };

  const reset = () => {
    setPrimary(null);
    setSecondary(null);
    localStorage.removeItem(PRIMARY_KEY);
    localStorage.removeItem(SECONDARY_KEY);
    resetColors();
  };

  return (
    <div className="w-full">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="flex items-center gap-1.5">
          <Palette size={12} />
          Accent color
        </span>
        <ChevronDown
          size={12}
          className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Accent color picker"
          className="flex flex-col gap-3 rounded-md bg-black/10 p-3 ring-1 ring-white/10"
        >
          <ColorRow
            label="Primary"
            colors={PRIMARY_COLORS}
            selected={primary}
            onSelect={pickPrimary}
          />
          <ColorRow
            label="Secondary"
            colors={SECONDARY_COLORS}
            selected={secondary}
            onSelect={pickSecondary}
          />
          {(primary || secondary) && (
            <button
              onClick={reset}
              className="w-full cursor-pointer rounded-md py-1.5 text-[10px] text-muted-foreground transition-colors hover:bg-black/20 hover:text-foreground"
            >
              Reset to default
            </button>
          )}
        </div>
      )}
    </div>
  );
}
