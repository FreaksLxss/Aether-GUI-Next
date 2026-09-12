import { AlertTriangle, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useConnectionStore } from "@/state/connectionStore";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";

export function InlineErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  const copyDiagnostics = async () => {
    const logs = useConnectionStore.getState().logs.slice(-50).map((l) => l.line).join("\n");
    const profile = JSON.stringify(useConnectionStore.getState().profile, null, 2);
    const diag = `Error: ${message}\n\n--- profile ---\n${profile}\n\n--- last 50 log lines ---\n${logs}`;
    try {
      await writeText(diag);
      toast.success("Diagnostics copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <Alert variant="destructive" className="flex flex-col gap-2 border-destructive/20 bg-destructive/5">
      <div className="flex items-start gap-2">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <AlertTitle className="text-xs">Something went wrong</AlertTitle>
          <AlertDescription className="break-words text-[11px] leading-relaxed">{message}</AlertDescription>
        </div>
      </div>
      <div className="flex gap-1.5">
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry} className="h-7 gap-1 text-xs">
            <RefreshCw size={11} /> Retry
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => void copyDiagnostics()} className="h-7 gap-1 text-xs">
          <Copy size={11} /> Copy diagnostics
        </Button>
      </div>
    </Alert>
  );
}
