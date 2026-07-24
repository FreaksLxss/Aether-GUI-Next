import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Maximize2, Minus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProxyIndicator } from "@/components/ProxyIndicator";
import { handleClose } from "@/components/CloseDialog";
import { useConnectionStore } from "@/state/connectionStore";

const appWindow = getCurrentWindow();

function useElapsed(sinceMs: number | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (sinceMs == null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sinceMs]);
  if (sinceMs == null) return "";
  const total = Math.max(0, Math.floor((now - sinceMs) / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export function TitleBar() {
  const status = useConnectionStore((s) => s.status);
  const connectedAt = status.state === "Connected" ? status.connected_at_ms : null;
  const uptime = useElapsed(connectedAt);

  return (
    <header
      data-tauri-drag-region
      className="relative z-10 flex h-9 shrink-0 select-none items-center justify-end"
    >
      <div className="absolute left-0 top-0 flex h-full items-center gap-2 pl-2">
        <ProxyIndicator />
        {uptime && (
          <span className="font-mono text-[10px] text-primary/70">
            {uptime}
          </span>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-13 rounded-none text-muted-foreground hover:text-foreground"
        aria-label="Minimize"
        onClick={() => void appWindow.minimize()}
      >
        <Minus className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-13 rounded-none text-muted-foreground hover:text-foreground"
        aria-label="Maximize"
        onClick={() => void appWindow.toggleMaximize()}
      >
        <Maximize2 className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-13 rounded-none text-muted-foreground hover:bg-destructive hover:text-white"
        aria-label="Close"
        onClick={handleClose}
      >
        <X className="size-4" />
      </Button>
    </header>
  );
}
