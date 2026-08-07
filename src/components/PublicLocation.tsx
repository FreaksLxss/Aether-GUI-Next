import { useEffect } from "react";
import type { ComponentProps } from "react";
import { motion } from "motion/react";
import { MapPin, RefreshCw, ShieldAlert, ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConnectionStore } from "@/state/connectionStore";
import { SPRING } from "@/lib/motion";
import { countryName, flagEmoji } from "@/lib/location";

/** Compact egress-location + leak-status pill shown while connected. */
export function PublicLocation() {
  const status = useConnectionStore((s) => s.status);
  const publicIp = useConnectionStore((s) => s.publicIp);
  const leakStatus = useConnectionStore((s) => s.leakStatus);
  const loading = useConnectionStore((s) => s.publicIpLoading);
  const runPublicIpCheck = useConnectionStore((s) => s.runPublicIpCheck);

  // Refresh whenever the connection state changes: on connect it shows the
  // tunnel exit IP, and on disconnect it flips back to the real user IP.
  useEffect(() => {
    void runPublicIpCheck();
  }, [status.state, runPublicIpCheck]);

  const connected = status.state === "Connected";
  const ownIp = !connected;

  const place =
    publicIp && publicIp.country_code
      ? `${countryName(publicIp.country_code)}${
          publicIp.city ? `, ${publicIp.city}` : ""
        }`
      : loading
        ? "Checking location…"
        : "Location unavailable";
  const ip = publicIp && publicIp.ip ? publicIp.ip : loading ? "…" : null;

  const leakMeta = leakStatus === "leak"
    ? { Icon: ShieldAlert, label: "Leak detected", cls: "text-status-error" }
    : leakStatus === "none"
      ? { Icon: ShieldCheck, label: "Traffic secured", cls: "text-status-connected" }
      : ownIp
        ? { Icon: ShieldOff, label: "Disconnected", cls: "text-muted-foreground" }
        : { Icon: ShieldOff, label: "Check pending", cls: "text-muted-foreground" };
  const LeakIcon = leakMeta.Icon;
  const iconProps = { size: 10 } as ComponentProps<typeof MapPin>;

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={SPRING}
      title={`${ownIp ? "Your" : "Exit"} IP: ${publicIp?.ip ?? "unknown"} · ${leakMeta.label}`}
      className="flex h-6 w-[260px] items-center gap-1.5 rounded-lg glass-float px-2 text-[10px] font-mono text-muted-foreground shadow-glass ring-1 ring-inset ring-primary/20"
    >
      <span className="flex min-w-0 items-center gap-1">
        {publicIp ? <span>{flagEmoji(publicIp.country_code)}</span> : <MapPin size={10} className="text-primary" />}
        <span className="truncate font-medium text-foreground/90">{place}</span>
      </span>
      {ip && <span className="text-muted-foreground/50">·</span>}
      {ip && <span className="truncate">{ip}</span>}
      <span className="flex shrink-0 items-center pl-0.5" title={leakMeta.label}>
        <LeakIcon {...iconProps} className={leakMeta.cls} />
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void runPublicIpCheck()}
        disabled={loading}
        className="ml-auto h-4 w-4 shrink-0 p-0 text-muted-foreground hover:text-foreground"
        aria-label="Re-check IP"
        title="Re-check IP"
      >
        <RefreshCw size={10} className={loading ? "anim-spin" : ""} />
      </Button>
    </motion.div>
  );
}