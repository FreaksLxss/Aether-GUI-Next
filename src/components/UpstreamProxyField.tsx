import { Input } from "@/components/ui/input";
import { useConnectionStore } from "@/state/connectionStore";

/** Aether ≥1.7.0: dial out through another proxy already on the machine
 * (--upstream), chaining Aether behind e.g. a VPN or proxy app. Empty input
 * stores null so the flag is omitted (direct dial). */
export function UpstreamProxyField({ id }: { id?: string }) {
  const url = useConnectionStore((s) => s.profile.upstream_proxy);
  const setUrl = useConnectionStore((s) => s.setUpstreamProxy);
  const status = useConnectionStore((s) => s.status);
  const locked = status.state !== "Idle" && status.state !== "Error";

  return (
    <Input
      id={id}
      type="text"
      value={url ?? ""}
      disabled={locked}
      onChange={(e) => {
        const v = e.target.value.trim();
        setUrl(v ? v : null);
      }}
      placeholder="socks5://127.0.0.1:1080 (off)"
      className="h-9 bg-surface-3 font-mono text-[10px] ring-1 ring-inset ring-white/5 focus-visible:ring-primary"
      aria-label="Upstream proxy URL"
    />
  );
}
