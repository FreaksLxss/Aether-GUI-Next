import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const THEME_KEY = "aether-theme";

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
