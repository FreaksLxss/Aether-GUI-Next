import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Pin } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export function AlwaysOnTopToggle() {
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    invoke<boolean>("get_always_on_top").then((v) => {
      setEnabled(v);
      setLoaded(true);
    });
  }, []);

  if (!loaded) return null;

  return (
    <div className="flex w-full items-center justify-between rounded-[35px] bg-black/15 px-3 py-2.5 ring-1 ring-white/[0.04] light:bg-black/[0.03] light:ring-black/[0.05]">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground/80">
        <Pin size={13} className="text-muted-foreground" />
        Always on top
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={async (on) => {
          setEnabled(on);
          try {
            await invoke("set_always_on_top", { enabled: on });
          } catch {
            setEnabled(!on);
          }
        }}
        aria-label="Keep window always on top"
      />
    </div>
  );
}
