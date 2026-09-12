import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { useConnectionStore } from "@/state/connectionStore";
import { validateWiwPeers } from "@/lib/validators";

/** Aether ≥1.9.0: manual WARP-in-WARP hop endpoints for gool (--wiw-peers),
 * comma-separated "host:port". One hop alone is fine (the scan finds the
 * other); port is required. Empty input stores null so both hops are
 * scanned, Aether's default. */
export function WiwPeersField({ id }: { id?: string }) {
  const wiwPeers = useConnectionStore((s) => s.profile.wiw_peers);
  const setWiwPeers = useConnectionStore((s) => s.setWiwPeers);
  const status = useConnectionStore((s) => s.status);
  const locked = status.state !== "Idle" && status.state !== "Error";
  const [err, setErr] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const validate = (v: string | null) => {
    const e = validateWiwPeers(v);
    setErr(e);
    if (e) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setErr(null), 2500);
    }
  };
  return (
    <div className="flex flex-col gap-1">
      <Input
        id={id}
        type="text"
        value={wiwPeers ?? ""}
        disabled={locked}
        onChange={(e) => {
          const v = e.target.value.trim();
          const next = v ? v : null;
          setWiwPeers(next);
          if (err) setErr(validateWiwPeers(next));
        }}
        onBlur={() => validate(wiwPeers)}
        placeholder="162.159.192.1:2408, 188.114.96.1:2408"
        aria-invalid={!!err}
        aria-describedby={err ? "wiw-error" : undefined}
        className={`h-9 rounded-xl bg-black/20 font-mono text-[11px] ring-1 ring-inset focus-visible:ring-primary ${err ? "ring-status-error focus-visible:ring-status-error" : "ring-white/[0.07]"}`}
        aria-label="WARP-in-WARP peers"
      />
      {err && <p id="wiw-error" className="text-[11px] text-status-error">{err}</p>}
    </div>
  );
}
