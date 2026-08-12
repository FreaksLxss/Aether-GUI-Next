import { useEffect, useState } from "react";
import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  PRIMARY_KEY,
  SECONDARY_KEY,
  PRIMARY_COLORS,
  SECONDARY_DEFAULT,
  applyColors,
  clearCustomColors,
  initThemeColors,
} from "@/lib/theme";

/** Presets for the secondary (surface) accent — neutral-to-tinted dark tones
 *  that complement whatever primary hue is chosen. */
const SECONDARY_COLORS: [string, string][] = [
  ["#242424", "Graphite"],
  ["#1c1c1c", "Charcoal"],
  ["#2f2b3a", "Plum"],
  ["#1f2937", "Slate"],
  ["#1e293b", "Ink"],
  ["#3b2f2f", "Umber"],
  ["#143d36", "Pine"],
  ["#3a3a3a", "Stone"],
];

function ColorSwatches({
  colors,
  selected,
  onSelect,
}: {
  colors: [string, string][];
  selected: string | null;
  onSelect: (hex: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {colors.map(([hex, name]) => (
        <button
          key={hex}
          onClick={() => onSelect(hex)}
          aria-label={`Color: ${name}`}
          className={`size-7 cursor-pointer rounded-md ring-1 transition-all hover:scale-110 ${
            selected === hex
              ? "ring-2 ring-primary ring-offset-1 ring-offset-surface-1"
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
  );
}

export function ColorTheme() {
  const [primary, setPrimary] = useState<string | null>(() => {
    return localStorage.getItem(PRIMARY_KEY);
  });
  const [secondary, setSecondary] = useState<string | null>(() => {
    return localStorage.getItem(SECONDARY_KEY);
  });

  useEffect(() => {
    initThemeColors();
  }, []);

  useEffect(() => {
    const p = primary ?? localStorage.getItem(PRIMARY_KEY);
    const s = secondary ?? localStorage.getItem(SECONDARY_KEY);
    if (p && s) {
      const savedTheme = localStorage.getItem("aether-theme");
      const dark = savedTheme ? savedTheme === "dark" : true;
      applyColors(p, s, dark);
    }
  }, [primary, secondary]);

  const pickPrimary = (hex: string) => {
    setPrimary(hex);
    localStorage.setItem(PRIMARY_KEY, hex);
    applyColors(hex, secondary ?? SECONDARY_DEFAULT);
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
    clearCustomColors();
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 justify-start gap-1.5 px-2 text-xs text-muted-foreground"
        >
          <Palette size={12} />
          Accent color
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={4}
        className="w-[260px] p-3"
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Primary
            </p>
            <ColorSwatches
              colors={PRIMARY_COLORS}
              selected={primary}
              onSelect={pickPrimary}
            />
          </div>
          <Separator className="bg-white/5" />
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Secondary
            </p>
            <ColorSwatches
              colors={SECONDARY_COLORS}
              selected={secondary}
              onSelect={pickSecondary}
            />
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={secondary ?? SECONDARY_DEFAULT}
                onChange={(e) => pickSecondary(e.target.value)}
                className="size-8 cursor-pointer rounded-md border border-white/10 bg-transparent p-0"
                aria-label="Custom secondary color"
              />
              <span className="text-[10px] text-muted-foreground">
                {secondary ?? "Default"}
              </span>
            </div>
          </div>
          {(primary || secondary) && (
            <>
              <Separator className="bg-white/5" />
              <Button
                variant="ghost"
                size="sm"
                onClick={reset}
                className="h-7 text-[10px] text-muted-foreground"
              >
                Reset to default
              </Button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
