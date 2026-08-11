import { Input } from "@/components/ui/input";
import { useConnectionStore } from "@/state/connectionStore";

/** Aether ≥1.6.0: local HTTP CONNECT proxy address (--http-proxy), next to
 * the SOCKS5 one for clients that can't speak SOCKS. Empty input stores null
 * so the flag is omitted (no HTTP proxy). */
export function HttpProxyAddressField({ id }: { id?: string }) {
  const addr = useConnectionStore((s) => s.profile.http_proxy_address);
  const setAddr = useConnectionStore((s) => s.setHttpProxyAddress);
  const status = useConnectionStore((s) => s.status);
  const locked = status.state !== "Idle" && status.state !== "Error";

  return (
    <Input
      id={id}
      type="text"
      value={addr ?? ""}
      disabled={locked}
      onChange={(e) => {
        const v = e.target.value.trim();
        setAddr(v ? v : null);
      }}
      placeholder="127.0.0.1:1818 (off)"
      className="h-9 bg-surface-3 font-mono text-[10px] ring-1 ring-inset ring-white/5 focus-visible:ring-primary"
      aria-label="HTTP CONNECT proxy address"
    />
  );
}
