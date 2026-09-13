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
    <div className="flex w-full items-center justify-between rounded-[35px] bg-black/15 px-3 py-2.5 ring-1 ring-white/[0.04] light:bg-black/[0.03] light:ring-black/[0.05]">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground/80">
        <PanelRightClose size={13} className="text-muted-foreground" />
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
