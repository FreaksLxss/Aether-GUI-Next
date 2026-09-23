import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { useConnectionStore } from "@/state/connectionStore";
import { validateDnsServers } from "@/lib/validators";

export function TunnelDnsField({ id }: { id?: string }) {
  const dns = useConnectionStore((s) => s.profile.dns_servers);
  const setDns = useConnectionStore((s) => s.setDnsServers);
  const status = useConnectionStore((s) => s.status);
  const locked = status.state !== "Idle" && status.state !== "Error";
  const [err, setErr] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const validate = (v: string | null) => {
    const e = validateDnsServers(v);
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
        value={dns ?? ""}
        disabled={locked}
        onChange={(e) => {
          const v = e.target.value.trim();
          const next = v ? v : null;
          setDns(next);
          if (err) setErr(validateDnsServers(next));
        }}
        onBlur={() => validate(dns)}
        placeholder="1.1.1.1, 1.0.0.1 (default)"
        aria-invalid={!!err}
        aria-describedby={err ? "dns-error" : undefined}
        className={`h-9 rounded-xl bg-black/20 font-mono text-[11px] ring-1 ring-inset focus-visible:ring-primary ${err ? "ring-status-error focus-visible:ring-status-error" : "ring-white/[0.07]"}`}
        aria-label="In-tunnel DNS servers"
      />
      {err && <p id="dns-error" className="text-[11px] text-status-error">{err}</p>}
    </div>
  );
}
