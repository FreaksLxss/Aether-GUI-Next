import { useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Check, Copy } from "lucide-react";
import { useConnectionStore } from "@/state/connectionStore";

export function CopyProxyButton() {
  const status = useConnectionStore((s) => s.status);
  const [copied, setCopied] = useState(false);

  if (status.state !== "Connected") return null;

  const addr = "socks_addr" in status ? status.socks_addr : "127.0.0.1:1819";

  const handleCopy = async () => {
    try {
      await writeText(addr);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error("Copy failed:", e);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="flex cursor-pointer items-center gap-1.5 rounded-md bg-black/20 px-2.5 py-1.5 text-xs font-mono text-muted-foreground ring-1 ring-white/10 transition-colors hover:bg-black/30 hover:text-foreground"
      title={`Copy SOCKS5 proxy address (${addr}) for manual configuration`}
    >
      {copied ? (
        <>
          <Check size={12} className="text-status-connected" />
          Copied!
        </>
      ) : (
        <>
          <Copy size={12} />
          {addr}
        </>
      )}
    </button>
  );
}
