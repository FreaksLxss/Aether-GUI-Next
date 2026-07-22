import { useEffect, useState } from "react";
import { ChevronDown, Palette } from "lucide-react";

const PRIMARY_KEY = "aether-custom-primary";
const SECONDARY_KEY = "aether-custom-secondary";

const PRIMARY_COLORS = [
  "#f2711c", "#ea580c", "#dc2626", "#e11d48",
  "#a855f7", "#6366f1", "#3b82f6", "#06b6d4",
  "#14b8a6", "#22c55e", "#84cc16", "#eab308",
];

const SECONDARY_COLORS = [
  "#242424", "#1e1e1e", "#2a2a2a", "#333333",
  "#3b3b3b", "#404040", "#4a4a4a", "#555555",
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

function applyColors(primary: string, secondary: string) {
  const root = document.documentElement;
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
  root.style.setProperty("--secondary", secondary);
  root.style.setProperty("--color-secondary", secondary);
  root.style.setProperty("--color-accent", secondary);
}

function resetColors() {
  const root = document.documentElement;
  for (const p of [
    "--primary", "--ring", "--color-primary", "--color-ring",
    "--color-sidebar-primary", "--color-sidebar-ring",
    "--primary-foreground", "--status-connecting", "--color-status-connecting",
    "--secondary", "--color-secondary", "--color-accent",
  ]) root.style.removeProperty(p);
}

function ColorRow({
  label,
  colors,
  selected,
  onSelect,
}: {
  label: string;
  colors: string[];
  selected: string | null;
  onSelect: (hex: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {colors.map((c) => (
          <button
            key={c}
            onClick={() => onSelect(c)}
            className={`size-6 rounded-md ring-1 transition-all hover:scale-105 ${
              selected === c
                ? "ring-2 ring-white ring-offset-1 ring-offset-surface-1"
                : "ring-white/15 hover:ring-white/40"
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
        <input
          type="color"
          value={selected ?? colors[0]}
          onChange={(e) => onSelect(e.target.value)}
          className="size-6 cursor-pointer rounded-md border border-white/10 bg-transparent p-0"
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

  useEffect(() => {
    const p = localStorage.getItem(PRIMARY_KEY);
    const s = localStorage.getItem(SECONDARY_KEY);
    if (p && s) {
      setPrimary(p);
      setSecondary(s);
      applyColors(p, s);
    }
  }, []);

  const pickPrimary = (hex: string) => {
    setPrimary(hex);
    localStorage.setItem(PRIMARY_KEY, hex);
    applyColors(hex, secondary ?? "#242424");
  };

  const pickSecondary = (hex: string) => {
    setSecondary(hex);
    localStorage.setItem(SECONDARY_KEY, hex);
    applyColors(primary ?? "#f2711c", hex);
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
        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
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
        <div className="flex flex-col gap-3 rounded-md bg-black/10 p-3 ring-1 ring-white/10">
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
              className="w-full rounded-md py-1.5 text-[10px] text-muted-foreground transition-colors hover:bg-black/20 hover:text-foreground"
            >
              Reset to default
            </button>
          )}
        </div>
      )}
    </div>
  );
}
