import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { useConnectionStore } from "@/state/connectionStore";
import { validateRouteSniffMs } from "@/lib/validators";

export function RouteSniffMsField({ id }: { id?: string }) {
  const ms = useConnectionStore((s) => s.profile.route_sniff_ms);
  const setMs = useConnectionStore((s) => s.setRouteSniffMs);
  const status = useConnectionStore((s) => s.status);
  const locked = status.state !== "Idle" && status.state !== "Error";
  const [err, setErr] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const validate = (v: number | null) => {
    const e = validateRouteSniffMs(v);
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
        type="number"
        min={0}
        value={ms ?? ""}
        disabled={locked}
        onChange={(e) => {
          const v = e.target.value.trim();
          const next = v ? Number(v) : null;
          setMs(next);
          if (err) setErr(validateRouteSniffMs(next));
        }}
        onBlur={() => validate(ms)}
        placeholder="auto"
        aria-invalid={!!err}
        aria-describedby={err ? "sniff-error" : undefined}
        className={`h-9 rounded-[35px] bg-black/20 font-mono text-[11px] ring-1 ring-inset focus-visible:ring-primary ${err ? "ring-status-error focus-visible:ring-status-error" : "ring-white/[0.07]"}`}
        aria-label="Route sniff wait in milliseconds"
      />
      {err && <p id="sniff-error" className="text-[11px] text-status-error">{err}</p>}
    </div>
  );
}
