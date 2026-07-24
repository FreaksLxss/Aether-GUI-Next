import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Minimize2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export function MinimizeOnStartupToggle() {
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    invoke<boolean>("get_minimize_on_startup").then((v) => {
      setEnabled(v);
      setLoaded(true);
    });
  }, []);

  if (!loaded) return null;

  return (
    <div className="flex w-full items-center justify-between rounded-md px-1.5 py-1 transition-colors duration-150 hover:bg-white/[0.03]">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Minimize2 size={12} />
        Start minimized
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={async (on) => {
          setEnabled(on);
          try {
            await invoke("set_minimize_on_startup", { enabled: on });
          } catch {
            setEnabled(!on);
          }
        }}
        aria-label="Start minimized to tray"
      />
    </div>
  );
}
