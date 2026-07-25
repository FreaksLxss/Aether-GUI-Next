import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
    <Badge
      variant="outline"
      className={`gap-1 px-1.5 py-0 text-[10px] font-normal ${
        active
          ? "border-primary/30 text-primary"
          : "border-white/10 text-status-idle"
      }`}
      title={active ? "System proxy active" : "System proxy inactive"}
    >
      <Globe size={10} />
      {active ? "Proxy" : "No Proxy"}
    </Badge>
  );
}
