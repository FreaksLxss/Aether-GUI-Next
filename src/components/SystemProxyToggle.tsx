import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Globe } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useConnectionStore } from "@/state/connectionStore";

export function SystemProxyToggle() {
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const status = useConnectionStore((s) => s.status);

  useEffect(() => {
    invoke<boolean>("get_system_proxy").then((v) => {
      setEnabled(v);
      setLoaded(true);
    });
  }, []);

  if (!loaded) return null;

  const isConnected = status.state === "Connected";
  const addr = isConnected && "socks_addr" in status ? status.socks_addr : "127.0.0.1:1819";

  const toggle = async (on: boolean) => {
    setEnabled(on);
    try {
      await invoke("set_system_proxy_addr", {
        addr,
        enabled: on,
      });
    } catch {
      setEnabled(!on);
    }
  };

  return (
    <div className="flex w-full items-center justify-between">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Globe size={12} />
        Set system proxy
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={toggle}
        aria-label="Set Windows system proxy to tunnel"
      />
    </div>
  );
}
