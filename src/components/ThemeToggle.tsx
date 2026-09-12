import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyColors } from "@/lib/theme";

type Theme = "dark" | "light" | "system";

const THEME_KEY = "aether-theme";
const PRIMARY_KEY = "aether-custom-primary";
const SECONDARY_KEY = "aether-custom-secondary";

function resolveDark(theme: Theme): boolean {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return theme === "dark";
}

function applyTheme(theme: Theme) {
  const dark = resolveDark(theme);
  const root = document.documentElement;
  if (dark) {
    root.classList.remove("light");
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
    root.classList.add("light");
  }
  const p = localStorage.getItem(PRIMARY_KEY);
  const s = localStorage.getItem(SECONDARY_KEY);
  if (p && s) applyColors(p, s, dark);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem(THEME_KEY) as Theme | null;
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
    return "dark";
  });

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const cycle = () => {
    const next: Theme = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  };

  const meta =
    theme === "dark"
      ? { Icon: Moon, label: "Dark", title: "Dark — click for Light" }
      : theme === "light"
        ? { Icon: Sun, label: "Light", title: "Light — click for System" }
        : { Icon: Monitor, label: "System", title: "System — click for Dark" };

  return (
    <Button variant="ghost" size="sm" onClick={cycle} className="h-7 gap-1.5 px-2 text-xs text-muted-foreground" title={meta.title}>
      <meta.Icon size={12} />
      {meta.label}
    </Button>
  );
}
