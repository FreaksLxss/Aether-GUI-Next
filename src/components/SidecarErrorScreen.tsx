import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AlertTriangle, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  message: string;
  onRetry: () => void;
}

/** Full-screen fallback shown when the bundled Aether binary itself can't
 * run — structurally different from a normal connection error, since the
 * connect button would be meaningless to show at all in this state. */
export function SidecarErrorScreen({ message, onRetry }: Props) {
  const isMissing = message.toLowerCase().includes("binary not found");
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    primaryRef.current?.focus();
  }, []);

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      await invoke("download_aether");
      onRetry();
    } catch (e) {
      setError(String(e));
      setDownloading(false);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <AlertTriangle size={40} className="text-status-error" />
      <h1 className="text-base font-medium text-foreground">
        Aether engine failed to start
      </h1>
      <p className="max-w-xs font-mono text-xs text-muted-foreground">{message}</p>

      {isMissing ? (
        <div className="flex flex-col items-center gap-2">
          <Button
            ref={primaryRef}
            onClick={handleDownload}
            disabled={downloading}
            className="gap-2"
          >
            {downloading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Downloading…
              </>
            ) : (
              <>
                <Download size={16} />
                Download Aether
              </>
            )}
          </Button>
          {error && (
            <p className="max-w-xs text-xs text-status-error">{error}</p>
          )}
        </div>
      ) : (
        <Button ref={primaryRef} variant="outline" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
