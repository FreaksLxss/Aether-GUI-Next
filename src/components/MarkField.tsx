import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { useConnectionStore } from "@/state/connectionStore";
import { validateFwMark } from "@/lib/validators";

export function MarkField({ id }: { id?: string }) {
  const fwMark = useConnectionStore((s) => s.profile.fw_mark);
  const setFwMark = useConnectionStore((s) => s.setFwMark);
  const status = useConnectionStore((s) => s.status);
  const locked = status.state !== "Idle" && status.state !== "Error";
  const isWindows = typeof navigator !== "undefined" && /win/i.test(navigator.platform);
  const disabled = locked || isWindows;
  const [err, setErr] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const validate = (v: string | null) => {
    const e = validateFwMark(v);
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
        value={fwMark ?? ""}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value.trim();
          const next = v ? v : null;
          setFwMark(next);
          if (err) setErr(validateFwMark(next));
        }}
        onBlur={() => validate(fwMark)}
        placeholder={isWindows ? "Linux/Android only" : "100 or 0x64"}
        aria-invalid={!!err}
        aria-describedby={err ? "mark-error" : undefined}
        className={`h-9 rounded-xl bg-black/20 font-mono text-[11px] ring-1 ring-inset focus-visible:ring-primary ${err ? "ring-status-error focus-visible:ring-status-error" : "ring-white/[0.07]"}`}
        aria-label="Firewall mark"
      />
      {isWindows && <p className="text-[11px] text-muted-foreground/50">Linux/Android only — needs CAP_NET_ADMIN (SO_MARK).</p>}
      {err && <p id="mark-error" className="text-[11px] text-status-error">{err}</p>}
    </div>
  );
}
