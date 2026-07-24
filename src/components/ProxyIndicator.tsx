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
    <div
      className="flex items-center gap-1 px-2 text-[10px]"
      title={active ? "System proxy active" : "System proxy inactive"}
    >
      <Globe size={10} className={active ? "text-status-connected" : "text-status-idle"} />
      <span className={active ? "text-status-connected" : "text-status-idle"}>
        {active ? "Proxy" : "No Proxy"}
      </span>
    </div>
  );
}
