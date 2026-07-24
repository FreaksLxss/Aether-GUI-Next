import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { applyColors } from "@/components/ColorTheme";

const THEME_KEY = "aether-theme";
const PRIMARY_KEY = "aether-custom-primary";
const SECONDARY_KEY = "aether-custom-secondary";
const DEFAULT_PRIMARY = "#f2711c";
const DEFAULT_SECONDARY = "#242424";

export function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY);
    const isDark = saved ? saved === "dark" : true;
    setDark(isDark);
    applyTheme(isDark);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    applyTheme(next);
    // Re-apply custom colors for the new theme mode — pass `next` explicitly
    // so applyColors knows the target mode without reading the DOM
    const p = localStorage.getItem(PRIMARY_KEY);
    const s = localStorage.getItem(SECONDARY_KEY);
    if (p && s) {
      applyColors(p, s, next);
    }
  };

  return (
    <button
      onClick={toggle}
      className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      title={dark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {dark ? <Moon size={12} /> : <Sun size={12} />}
      {dark ? "Dark" : "Light"}
    </button>
  );
}

function applyTheme(dark: boolean) {
  const root = document.documentElement;
  if (dark) {
    root.classList.remove("light");
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
    root.classList.add("light");
  }
}
