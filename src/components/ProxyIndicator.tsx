import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Globe } from "lucide-react";

export function ProxyIndicator() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    invoke<boolean>("get_system_proxy").then(setActive).catch(() => {});
    const id = setInterval(() => {
      invoke<boolean>("get_system_proxy").then(setActive).catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium ${
        active ? "text-primary" : "text-muted-foreground"
      }`}
      title={active ? "System proxy active" : "System proxy inactive"}
    >
      <Globe size={11} />
      {active ? "Proxy" : "No Proxy"}
    </span>
  );
}
