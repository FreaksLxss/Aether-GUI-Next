import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PanelRightClose } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { syncCloseChoice } from "@/lib/close";

export function CloseToTrayToggle() {
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    invoke<boolean>("get_close_to_tray").then((v) => {
      if (active) {
        setEnabled(v);
        setLoaded(true);
      }
    });
    return () => { active = false; };
  }, []);

  if (!loaded) return null;

  return (
    <div className="flex w-full items-center justify-between rounded-md px-1.5 py-1 transition-colors duration-150 hover:bg-white/[0.03]">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <PanelRightClose size={12} />
        Minimize to tray
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={async (on) => {
          setEnabled(on);
          syncCloseChoice(on);
          try {
            await invoke("set_close_to_tray", { enabled: on });
          } catch {
            setEnabled(!on);
            syncCloseChoice(!on);
          }
        }}
        aria-label="Minimize to system tray instead of closing"
      />
    </div>
  );
}
