import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Globe } from "lucide-react";

export interface SystemProxyState {
  enabled: boolean;
  owner: "none" | "main" | "ip_changer";
  port: number;
}

export function ProxyIndicator() {
  const [state, setState] = useState<SystemProxyState | null>(null);

  useEffect(() => {
    invoke<SystemProxyState>("get_system_proxy_state").then(setState).catch(() => {});
    const id = setInterval(() => {
      invoke<SystemProxyState>("get_system_proxy_state").then(setState).catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, []);

  const active = state?.enabled ?? false;
  const title =
    active && state
      ? state.owner === "ip_changer"
        ? `System proxy (IP changer) → 127.0.0.1:${state.port}`
        : `System proxy (main tunnel) → 127.0.0.1:${state.port}`
      : "System proxy inactive";

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium ${
        active ? "text-primary" : "text-muted-foreground"
      }`}
      title={title}
    >
      <Globe size={11} />
      {active ? (
        <>
          Proxy<span className="opacity-60">:{state?.port}</span>
        </>
      ) : (
        "No Proxy"
      )}
    </span>
  );
}
