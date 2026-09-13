import { useEffect, useState } from "react";
import { Rocket } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export function AutoStartToggle() {
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    import("@tauri-apps/plugin-autostart")
      .then(({ isEnabled }) => isEnabled())
      .then((v) => {
        setEnabled(v);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  if (!loaded) return null;

  const toggle = async (on: boolean) => {
    setEnabled(on);
    try {
      const mod = await import("@tauri-apps/plugin-autostart");
      if (on) {
        await mod.enable();
      } else {
        await mod.disable();
      }
    } catch {
      setEnabled(!on);
    }
  };

  return (
    <div className="flex w-full items-center justify-between rounded-[35px] bg-black/15 px-3 py-2.5 ring-1 ring-white/[0.04] light:bg-black/[0.03] light:ring-black/[0.05]">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground/80">
        <Rocket size={13} className="text-muted-foreground" />
        Launch at startup
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={toggle}
        aria-label="Launch at system startup"
      />
    </div>
  );
}
