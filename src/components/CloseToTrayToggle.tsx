import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PanelRightClose } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export function CloseToTrayToggle() {
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    invoke<boolean>("get_close_to_tray").then((v) => {
      setEnabled(v);
      setLoaded(true);
    });
  }, []);

  if (!loaded) return null;

  return (
    <div className="flex w-full items-center justify-between">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <PanelRightClose size={12} />
        Minimize to tray
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={async (on) => {
          setEnabled(on);
          try {
            await invoke("set_close_to_tray", { enabled: on });
          } catch {
            setEnabled(!on);
          }
        }}
        aria-label="Minimize to system tray instead of closing"
      />
    </div>
  );
}
