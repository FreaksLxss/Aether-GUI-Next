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
    <div className="flex w-full items-center justify-between">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Pin size={12} />
        Always on top
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={(on) => {
          setEnabled(on);
          void invoke("set_always_on_top", { enabled: on });
        }}
        aria-label="Keep window always on top"
      />
    </div>
  );
}
