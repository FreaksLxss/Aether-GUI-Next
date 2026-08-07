import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { Download, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface UpdateInfo {
  available: boolean;
  latest_version: string;
  current_version: string;
  download_url: string;
}

const CHECKED_KEY = "aether-update-checked";

export function UpdateChecker() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(CHECKED_KEY)) return;
    sessionStorage.setItem(CHECKED_KEY, "1");
    invoke<UpdateInfo>("check_update", { currentVersion: "0.9.0" })
      .then((info) => {
        if (info.available) setUpdate(info);
      })
      .catch(() => {
        // Silent — network might be down
      });
  }, []);

  const check = async () => {
    setChecking(true);
    try {
      const info = await invoke<UpdateInfo>("check_update", {
        currentVersion: "0.9.0",
      });
      if (info.available) setUpdate(info);
    } catch {
      // Silent — network might be down
    }
    setChecking(false);
  };

  if (!update) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={check}
        disabled={checking}
        className="h-7 gap-1 px-1.5 text-xs text-muted-foreground/80"
        title="Check for updates"
      >
        <RefreshCw size={10} className={checking ? "animate-spin" : ""} />
        {checking ? "Checking…" : "Check for updates"}
      </Button>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.15 }}
        aria-live="polite"
      >
        <Alert className="bg-surface-3">
          <Download className="size-4 text-primary" />
          <AlertDescription className="flex items-center gap-2 text-xs text-foreground">
            Update available: v{update.latest_version}
          </AlertDescription>
          <div className="mt-2 flex gap-1.5">
            <Button size="sm" onClick={() => void open(update.download_url)} className="h-6 px-2.5 text-xs">
              Download
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setUpdate(null)} className="h-6 px-2 text-xs text-muted-foreground">
              Dismiss
            </Button>
          </div>
        </Alert>
      </motion.div>
    </AnimatePresence>
  );
}
