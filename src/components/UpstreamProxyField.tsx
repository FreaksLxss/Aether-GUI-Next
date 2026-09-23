import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { useConnectionStore } from "@/state/connectionStore";
import { validateUpstream } from "@/lib/validators";

export function UpstreamProxyField({ id }: { id?: string }) {
  const url = useConnectionStore((s) => s.profile.upstream_proxy);
  const setUrl = useConnectionStore((s) => s.setUpstreamProxy);
  const status = useConnectionStore((s) => s.status);
  const locked = status.state !== "Idle" && status.state !== "Error";
  const [err, setErr] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const validate = (v: string | null) => {
    const e = validateUpstream(v);
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
        value={url ?? ""}
        disabled={locked}
        onChange={(e) => {
          const v = e.target.value.trim();
          const next = v ? v : null;
          setUrl(next);
          if (err) setErr(validateUpstream(next));
        }}
        onBlur={() => validate(url)}
        placeholder="socks5://127.0.0.1:1080 (off)"
        aria-invalid={!!err}
        aria-describedby={err ? "upstream-error" : undefined}
        className={`h-9 rounded-xl bg-black/20 font-mono text-[11px] ring-1 ring-inset focus-visible:ring-primary ${err ? "ring-status-error focus-visible:ring-status-error" : "ring-white/[0.07]"}`}
        aria-label="Upstream proxy URL"
      />
      {err && <p id="upstream-error" className="text-[11px] text-status-error">{err}</p>}
    </div>
  );
}
