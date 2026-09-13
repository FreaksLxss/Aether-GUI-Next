import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { useConnectionStore } from "@/state/connectionStore";
import { validateMimPeers } from "@/lib/validators";

export function MimPeersField({ id }: { id?: string }) {
  const mimPeers = useConnectionStore((s) => s.profile.mim_peers);
  const setMimPeers = useConnectionStore((s) => s.setMimPeers);
  const status = useConnectionStore((s) => s.status);
  const locked = status.state !== "Idle" && status.state !== "Error";
  const [err, setErr] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const validate = (v: string | null) => {
    const e = validateMimPeers(v);
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
        value={mimPeers ?? ""}
        disabled={locked}
        onChange={(e) => {
          const v = e.target.value.trim();
          const next = v ? v : null;
          setMimPeers(next);
          if (err) setErr(validateMimPeers(next));
        }}
        onBlur={() => validate(mimPeers)}
        placeholder="auto or 203.0.113.1:2408, 198.51.100.1:2408"
        aria-invalid={!!err}
        aria-describedby={err ? "mim-error" : undefined}
        className={`h-9 rounded-xl bg-black/20 font-mono text-[11px] ring-1 ring-inset focus-visible:ring-primary ${err ? "ring-status-error focus-visible:ring-status-error" : "ring-white/[0.07]"}`}
        aria-label="MiM peers"
      />
      {err && <p id="mim-error" className="text-[11px] text-status-error">{err}</p>}
    </div>
  );
}
