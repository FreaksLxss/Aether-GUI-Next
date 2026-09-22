import { useEffect, useRef } from "react";
import type { ComponentProps } from "react";
import { motion } from "motion/react";
import { MapPin, RefreshCw, ShieldAlert, ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConnectionStore } from "@/state/connectionStore";
import { SPRING } from "@/lib/motion";
import { countryName } from "@/lib/location";
import { CountryFlag } from "@/components/CountryFlag";

/** Compact egress-location + leak-status pill shown while connected. */
export function PublicLocation() {
  const status = useConnectionStore((s) => s.status);
  const publicIp = useConnectionStore((s) => s.publicIp);
  const leakStatus = useConnectionStore((s) => s.leakStatus);
  const loading = useConnectionStore((s) => s.publicIpLoading);
  const latencyMs = useConnectionStore((s) => s.publicIpLatencyMs);
  const history = useConnectionStore((s) => s.publicIpHistory);
  const runPublicIpCheck = useConnectionStore((s) => s.runPublicIpCheck);
  const prevStateRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = status.state;
    if (prev === null) {
      void runPublicIpCheck();
      return;
    }
    if (prev !== status.state && (status.state === "Connected" || status.state === "Idle")) {
      void runPublicIpCheck();
    }
  }, [status.state, runPublicIpCheck]);

  const connected = status.state === "Connected";
  const ownIp = !connected;

  // On censored networks the direct-IP lookup can fail; don't whisper a
  // permanent "Location unavailable" at idle — the pill only earns space
  // when there is data to show or a tunnel to prove.
  if (!connected && !publicIp) return null;

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
      className="flex h-7 w-full max-w-[320px] items-center gap-1.5 rounded-full bg-surface-2 px-2.5 text-[11px] font-mono tabular-nums text-muted-foreground ring-1 ring-border"
    >
      <span className="flex min-w-0 items-center gap-1">
        {publicIp ? <CountryFlag code={publicIp.country_code} /> : <MapPin size={11} className="text-primary" />}
        <span className="truncate font-medium text-foreground/90">{place}</span>
      </span>
      {ip && <span className="text-muted-foreground/50">·</span>}
      {ip && <span className="truncate tabular-nums">{ip}</span>}
      {latencyMs != null && !loading && (
        <>
          <span className="text-muted-foreground/50">·</span>
          <span className="shrink-0 tabular-nums text-muted-foreground/60">{latencyMs} ms</span>
          {history.length > 0 && (() => {
            if (history.length === 1) {
              return (
                <svg width="32" height="12" viewBox="0 0 32 12" className="shrink-0" role="img" aria-label={`Latency ${history[0]} ms`}>
                  <circle cx="16" cy="6" r="2" fill="var(--primary)" opacity="0.9" />
                </svg>
              );
            }
            const min = Math.min(...history);
            const max = Math.max(...history);
            const range = max - min || 1;
            const points = history
              .map((v, i) => {
                const x = (i / (history.length - 1)) * 32;
                const y = 12 - ((v - min) / range) * 10 - 1;
                return `${x.toFixed(1)},${y.toFixed(1)}`;
              })
              .join(" ");
            const label = `Latency sparkline: ${history.join(", ")} ms`;
            return (
              <svg width="32" height="12" viewBox="0 0 32 12" className="shrink-0" role="img" aria-label={label}>
                <polyline fill="none" stroke="var(--primary)" strokeWidth="1" opacity="0.7" points={points} />
              </svg>
            );
          })()}
        </>
      )}
      <span className="flex shrink-0 items-center pl-0.5" title={leakMeta.label}>
        <LeakIcon {...iconProps} className={leakMeta.cls} />
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => void runPublicIpCheck()}
        disabled={loading}
        className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
        aria-label="Re-check IP"
        title="Re-check IP"
      >
        <RefreshCw size={11} className={loading ? "anim-spin" : ""} />
      </Button>
    </motion.div>
  );
}
