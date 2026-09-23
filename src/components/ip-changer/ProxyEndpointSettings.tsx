import { useState } from "react";
import { Network } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useIpChangerStore } from "@/stores/ipChangerStore";
import { cn } from "@/lib/utils";

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
    <div className="flex flex-col gap-2">
      <div className="flex w-full items-center justify-between gap-2 rounded-[35px] border border-white/[0.06] bg-black/20 px-3 py-2.5 ring-1 ring-white/[0.04] light:border-black/5 light:bg-black/[0.04] light:ring-black/[0.03]">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground/80">
          <Network size={13} className="text-muted-foreground" />
          SOCKS proxy
        </div>
        <code className="rounded-[14px] bg-black/30 px-2 py-1 font-mono text-[11px] text-foreground ring-1 ring-white/[0.06] light:bg-black/5 light:ring-black/5">
          {display}
        </code>
      </div>

      <div
        className={cn(
          "flex w-full items-center justify-between rounded-[35px] bg-black/15 px-3 py-2.5 ring-1 ring-white/[0.04] transition-colors light:bg-black/[0.03] light:ring-black/[0.05]",
          running && "opacity-60",
        )}
        title={running ? "Applies on next start" : undefined}
      >
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground/80">
          <Network size={13} className="text-muted-foreground" />
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
    <div className="flex flex-col gap-1.5">
      <div
        className={cn(
          "flex w-full items-center justify-between rounded-[35px] bg-black/15 px-3 py-2.5 ring-1 ring-white/[0.04] transition-colors light:bg-black/[0.03] light:ring-black/[0.05]",
          !running && "opacity-60",
        )}
        title={running ? undefined : "Start Tor to enable the system proxy"}
      >
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground/80">
          <Network size={13} className="text-muted-foreground" />
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
        <p className="rounded-[35px] bg-red-500/10 px-2.5 py-2 text-[11px] leading-relaxed text-red-400 ring-1 ring-red-500/15">{warning}</p>
      )}
    </div>
  );
}
