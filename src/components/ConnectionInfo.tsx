import { motion } from "motion/react";
import { Activity, Network } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useConnectionStore } from "@/state/connectionStore";
import type { ScanMode, IpVersion, MasqueNoize, WgNoize } from "@/types/connection";
import { SPRING } from "@/lib/motion";

const SCAN_LABELS: Record<ScanMode, string> = {
  turbo: "Turbo",
  balanced: "Balanced",
  thorough: "Thorough",
  stealth: "Stealth",
  ironclad: "Ironclad",
};

const IP_LABELS: Record<IpVersion, string> = {
  v4: "IPv4",
  v6: "IPv6",
  both: "IPv4+6",
};

function getObfuscationLabel(
  protocol: string,
  masqueNoize: MasqueNoize,
  wgNoize: WgNoize,
): string {
  if (protocol === "wireguard" || protocol === "gool") {
    return wgNoize === "off" ? "None" : wgNoize.charAt(0).toUpperCase() + wgNoize.slice(1);
  }
  return masqueNoize === "off" ? "None" : masqueNoize.toUpperCase();
}

export function ConnectionInfo() {
  const status = useConnectionStore((s) => s.status);
  const profile = useConnectionStore((s) => s.profile);

  if (status.state !== "Connected") return null;

  const addr = "socks_addr" in status ? status.socks_addr : "127.0.0.1:1819";
  const protocol = profile.protocol === "auto" ? "MASQUE" : profile.protocol.toUpperCase();
  const scanMode = SCAN_LABELS[profile.scan_mode];
  const ipVersion = IP_LABELS[profile.ip_version];
  const obfuscation = getObfuscationLabel(profile.protocol, profile.masque_noize, profile.wg_noize);
  const showTun = profile.capture_mode === "tun" || profile.capture_mode === "both";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      style={{ borderRadius: 35 }}
      className="flex w-full max-w-[320px] flex-col gap-1.5 rounded-[35px] bg-surface-2 px-3 py-2.5 text-[11px] font-mono tabular-nums text-muted-foreground ring-1 ring-border"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className="gap-1 border-primary/25 px-1.5 py-0 text-[11px] font-normal tabular-nums text-primary">
          <Activity size={10} />
          {addr}
        </Badge>
        <span className="text-muted-foreground/60">·</span>
        <Badge variant="secondary" className="px-1.5 py-0 text-[11px] font-medium tabular-nums">
          {protocol}
        </Badge>
        {showTun && (
          <Badge variant="outline" className="gap-1 border-primary/25 px-1.5 py-0 text-[11px] font-normal tabular-nums text-primary">
            <Network size={10} />
            TUN
          </Badge>
        )}
      </div>
      <Separator className="bg-border" />
      <div className="flex items-center justify-center gap-2 text-muted-foreground/80">
        <Badge variant="outline" className="px-1.5 py-0 text-[11px] font-normal tabular-nums">
          {scanMode}
        </Badge>
        <span className="text-muted-foreground/50">·</span>
        <Badge variant="outline" className="px-1.5 py-0 text-[11px] font-normal tabular-nums">
          {obfuscation}
        </Badge>
        <span className="text-muted-foreground/50">·</span>
        <Badge variant="outline" className="px-1.5 py-0 text-[11px] font-normal tabular-nums">
          {ipVersion}
        </Badge>
      </div>
    </motion.div>
  );
}
