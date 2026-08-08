import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Globe } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useConnectionStore } from "@/state/connectionStore";
import type { SystemProxyState } from "@/components/ProxyIndicator";

export function SystemProxyToggle() {
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const status = useConnectionStore((s) => s.status);

  useEffect(() => {
    invoke<SystemProxyState>("get_system_proxy_state").then((s) => {
      setEnabled(s.enabled && s.owner === "main");
      setLoaded(true);
    });
  }, []);

  if (!loaded) return null;

  const isConnected = status.state === "Connected";
  const addr = isConnected && "socks_addr" in status ? status.socks_addr : "127.0.0.1:1819";

  const toggle = async (on: boolean) => {
    setEnabled(on);
    setWarning(null);
    try {
      await invoke("set_system_proxy_addr", {
        addr,
        enabled: on,
      });
    } catch (e) {
      setEnabled(!on);
      setWarning(String(e));
    }
  };

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex w-full items-center justify-between rounded-md px-1.5 py-1 transition-colors duration-150 hover:bg-white/[0.03]">
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
      {warning && (
        <p className="pl-1.5 text-[10px] leading-tight text-status-error">{warning}</p>
      )}
    </div>
  );
}
