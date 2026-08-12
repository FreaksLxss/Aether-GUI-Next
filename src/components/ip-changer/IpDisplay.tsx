import { AnimatePresence, motion } from "motion/react";
import { LoaderCircle, MapPin } from "lucide-react";
import { useIpChangerStore } from "@/stores/ipChangerStore";
import { SPRING } from "@/lib/motion";
import { countryName, flagEmoji } from "@/lib/location";

function formatRotated(t: number | null): string {
  if (t === null) return "never rotated yet";
  const secs = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (secs < 60) return `rotated ${secs}s ago`;
  const mins = Math.round(secs / 60);
  return mins < 60 ? `rotated ${mins} min ago` : `rotated ${Math.round(mins / 60)}h ago`;
}

/** Big mono egress IP + geo, or a live progress indicator while Tor is still
 * bootstrapping (no exit circuit exists until it completes). */
export function IpDisplay() {
  const status = useIpChangerStore((s) => s.status);
  const currentIp = useIpChangerStore((s) => s.currentIp);
  const ipChecking = useIpChangerStore((s) => s.ipChecking);
  const bootstrapPercent = useIpChangerStore((s) => s.bootstrapPercent);
  const bootstrapPhase = useIpChangerStore((s) => s.bootstrapPhase);
  const lastRotatedAt = useIpChangerStore((s) => s.lastRotatedAt);
  const rotationCount = useIpChangerStore((s) => s.rotationCount);

  const running = status === "running";
  const bootstrapping =
    running && !currentIp && bootstrapPercent !== null && bootstrapPercent < 100;
  const waiting = running && !ipChecking && !currentIp && !bootstrapping;
  const place = currentIp?.country_code
    ? `${countryName(currentIp.country_code)}${currentIp.city ? `, ${currentIp.city}` : ""}`
    : null;

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
      <div className="flex items-center gap-2">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={currentIp?.ip ?? "empty"}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={SPRING}
            className="font-mono text-[16px] font-semibold tracking-tight text-foreground tabular-nums"
          >
            {currentIp?.ip ?? "–" }
          </motion.span>
        </AnimatePresence>
        {ipChecking && (
          <LoaderCircle size={13} className="anim-spin text-muted-foreground/70" />
        )}
      </div>

      {bootstrapping ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground/80">
            <span className="flex items-center gap-1.5">
              <LoaderCircle size={11} className="anim-spin" />
              Tor is bootstrapping…
            </span>
            <span className="font-mono tabular-nums">{bootstrapPercent}%</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/5">
            <motion.div
              className="h-full origin-left bg-status-connecting"
              initial={false}
              animate={{ width: `${bootstrapPercent}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
          {bootstrapPhase && (
            <span className="text-[10px] text-muted-foreground/60">{bootstrapPhase.replace(/_/g, " ")}</span>
          )}
          <span className="text-[10px] text-muted-foreground/40">
            exit IP appears when the circuit is ready
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-1 text-[12px] text-muted-foreground">
          {waiting ? (
            <span className="text-muted-foreground/70">looking up exit IP…</span>
          ) : place ? (
            <>
              <span>{flagEmoji(currentIp!.country_code)}</span>
              <span>{place}</span>
              {currentIp?.org && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="truncate">{currentIp.org}</span>
                </>
              )}
            </>
          ) : (
            <span className="flex items-center gap-1 text-muted-foreground/50">
              <MapPin size={11} /> not connected
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
        <span>{formatRotated(lastRotatedAt)}</span>
        {rotationCount > 0 && (
          <>
            <span className="text-muted-foreground/30">·</span>
            <span>new identity ×{rotationCount}</span>
          </>
        )}
      </div>
    </div>
  );
}