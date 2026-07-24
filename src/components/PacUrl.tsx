import { useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Check, Link } from "lucide-react";
import { useConnectionStore } from "@/state/connectionStore";

export function PacUrl() {
  const status = useConnectionStore((s) => s.status);
  const [copied, setCopied] = useState(false);

  if (status.state !== "Connected") return null;

  const addr = "socks_addr" in status ? status.socks_addr : "127.0.0.1:1819";
  const pacScript = `function FindProxyForURL(url, host) { if (isInNet(host, "127.0.0.1", "255.0.0.0") || isInNet(host, "10.0.0.0", "255.0.0.0") || isInNet(host, "192.168.0.0", "255.255.0.0")) return "DIRECT"; return "SOCKS5 ${addr}; DIRECT"; }`;
  const pacUrl = `data:application/x-ns-proxy-autoconfig,${encodeURIComponent(pacScript)}`;

  const handleCopy = async () => {
    try {
      await writeText(pacUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error("Copy failed:", e);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="flex cursor-pointer items-center gap-1.5 rounded-md bg-black/20 px-2.5 py-1.5 text-[10px] text-muted-foreground ring-1 ring-white/10 transition-colors hover:bg-black/30 hover:text-foreground"
      title="Copy PAC auto-config URL — paste into your browser or system proxy settings for automatic SOCKS5 routing"
    >
      {copied ? (
        <>
          <Check size={10} className="text-status-connected" />
          PAC URL copied!
        </>
      ) : (
        <>
          <Link size={10} />
          Copy PAC URL
        </>
      )}
    </button>
  );
}
