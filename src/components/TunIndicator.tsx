import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Network } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function TunIndicator() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    invoke<boolean>("get_tun_active").then(setActive).catch(() => {});
    const id = setInterval(() => {
      invoke<boolean>("get_tun_active").then(setActive).catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, []);

  if (!active) return null;

  return (
    <Badge
      variant="outline"
      className="gap-1 border-primary/30 px-1.5 py-0 text-[10px] font-normal text-primary"
      title="TUN adapter active — capturing all traffic"
    >
      <Network size={10} />
      TUN
    </Badge>
  );
}
