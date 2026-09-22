import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { useConnectionStore } from "@/state/connectionStore";
import { validateDnsServers } from "@/lib/validators";

/** Aether ≥1.6.0: local HTTP CONNECT proxy address, next to the SOCKS5 one
 * for clients that can't speak SOCKS. Empty input stores null (door off). */
export function HttpProxyAddressField({ id }: { id?: string }) {
  const addr = useConnectionStore((s) => s.profile.http_proxy_address);
  const setAddr = useConnectionStore((s) => s.setHttpProxyAddress);
  const status = useConnectionStore((s) => s.status);
  const locked = status.state !== "Idle" && status.state !== "Error";
  const [err, setErr] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const validate = (v: string | null) => {
    const e = validateDnsServers(v); // reuse host:port check — same shape as TunnelDns single entry (no commas needed but tolerated)
    // stricter: if it contains : it must be host:port else bare host ok? Mirror Bind logic
    // keep DnsServers check (spaces) as minimal bar
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
        value={addr ?? ""}
        disabled={locked}
        onChange={(e) => {
          const v = e.target.value.trim();
          const next = v ? v : null;
          setAddr(next);
          if (err) setErr(validateDnsServers(next));
        }}
        onBlur={() => validate(addr)}
        placeholder="127.0.0.1:1818 (off)"
        aria-invalid={!!err}
        aria-describedby={err ? "http-proxy-error" : undefined}
        className={`h-9 rounded-xl bg-black/20 font-mono text-[11px] ring-1 ring-inset focus-visible:ring-primary ${err ? "ring-status-error focus-visible:ring-status-error" : "ring-white/[0.07]"}`}
        aria-label="HTTP CONNECT proxy address"
      />
      {err && <p id="http-proxy-error" className="text-[11px] text-status-error">{err}</p>}
    </div>
  );
}
