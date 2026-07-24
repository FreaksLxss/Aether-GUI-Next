import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className="h-7 gap-1.5 font-mono text-xs text-muted-foreground"
      title={`Copy SOCKS5 proxy address (${addr}) for manual configuration`}
    >
      <AnimatePresence mode="wait">
        {copied ? (
          <motion.span
            key="check"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="flex items-center gap-1.5"
          >
            <Check size={12} className="text-status-connected" />
            Copied!
          </motion.span>
        ) : (
          <motion.span
            key="copy"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="flex items-center gap-1.5"
          >
            <Copy size={12} />
            {addr}
          </motion.span>
        )}
      </AnimatePresence>
    </Button>
  );
}
