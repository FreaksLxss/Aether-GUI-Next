import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyColors } from "@/components/ColorTheme";

const THEME_KEY = "aether-theme";
const PRIMARY_KEY = "aether-custom-primary";
const SECONDARY_KEY = "aether-custom-secondary";

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
    const p = localStorage.getItem(PRIMARY_KEY);
    const s = localStorage.getItem(SECONDARY_KEY);
    if (p && s) {
      applyColors(p, s, next);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
      title={dark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {dark ? <Moon size={12} /> : <Sun size={12} />}
      {dark ? "Dark" : "Light"}
    </Button>
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
