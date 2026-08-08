import { useState } from "react";
import { Network } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useIpChangerStore } from "@/stores/ipChangerStore";
import { cn } from "@/lib/utils";

/** Copyable SOCKS endpoint (respects `0.0.0.0` when LAN access is enabled)
 * plus the LAN-binding toggle. A LAN bind only takes effect on next start,
 * so the toggle stays live even while stopped. */
export function ProxyEndpointSettings() {
  const running = useIpChangerStore((s) => s.status === "running");
  const socksAddr = useIpChangerStore((s) => s.socksAddr);
  const lanEnabled = useIpChangerStore((s) => s.lanEnabled);
  const setLan = useIpChangerStore((s) => s.setLan);

  const display = running
    ? lanEnabled
      ? `${socksAddr.host}:${socksAddr.port}`
      : `127.0.0.1:${socksAddr.port}`
    : `${lanEnabled ? "0.0.0.0" : "127.0.0.1"}:${socksAddr.port}`;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Network size={12} />
          SOCKS proxy
        </div>
        <div className="flex items-center gap-2">
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">
            {display}
          </code>
        </div>
      </div>

      <div
        className={cn(
          "flex w-full items-center justify-between rounded-md px-1.5 py-1 transition-colors duration-150",
          running && "opacity-60",
        )}
        title={running ? "Applies on next start" : undefined}
      >
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Network size={12} />
          Allow LAN access
        </div>
        <Switch
          checked={lanEnabled}
          onCheckedChange={(on) => void setLan(on)}
          disabled={running}
          aria-label="Allow LAN access to the SOCKS proxy"
        />
      </div>
    </div>
  );
}

/** System-proxy switch for the IP-changer. If any other proxy is already set
 * (the main tunnel's, say) it refuses and warns instead of silently stealing
 * the shared Windows proxy key. */
export function IpProxyToggle() {
  const running = useIpChangerStore((s) => s.status === "running");
  const ipProxyEnabled = useIpChangerStore((s) => s.ipProxyEnabled);
  const setIpProxy = useIpChangerStore((s) => s.setIpProxy);
  const [warning, setWarning] = useState<string | null>(null);

  const toggle = async (on: boolean) => {
    setWarning(null);
    const err = await setIpProxy(on);
    if (err) setWarning(err);
  };

  return (
    <div className="flex flex-col gap-0.5">
      <div
        className={cn(
          "flex w-full items-center justify-between rounded-md px-1.5 py-1 transition-colors duration-150",
          !running && "opacity-60",
        )}
        title={running ? undefined : "Start Tor to enable the system proxy"}
      >
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Network size={12} />
          Set system proxy
        </div>
        <Switch
          checked={ipProxyEnabled}
          onCheckedChange={toggle}
          disabled={!running}
          aria-label="Set Windows system proxy to Tor SOCKS"
        />
      </div>
      {warning && (
        <p className="pl-1.5 text-[10px] leading-tight text-status-error">{warning}</p>
      )}
    </div>
  );
}