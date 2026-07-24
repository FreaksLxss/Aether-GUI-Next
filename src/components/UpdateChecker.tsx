import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { Download, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

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
    // Check once on mount, but not more than once per session
    if (sessionStorage.getItem(CHECKED_KEY)) return;
    sessionStorage.setItem(CHECKED_KEY, "1");
    check();
  }, []);

  const check = async () => {
    setChecking(true);
    try {
      const info = await invoke<UpdateInfo>("check_update", {
        currentVersion: "0.5.0",
      });
      if (info.available) setUpdate(info);
    } catch {
      // Silent — network might be down
    }
    setChecking(false);
  };

  if (!update) {
    return (
      <button
        onClick={check}
        disabled={checking}
        className="flex items-center gap-1 text-xs text-muted-foreground/60 transition-colors hover:text-muted-foreground disabled:opacity-50"
        title="Check for updates"
      >
        <RefreshCw size={10} className={checking ? "animate-spin" : ""} />
        {checking ? "Checking…" : "Check for updates"}
      </button>
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
        className="w-full overflow-hidden rounded-md bg-surface-3 ring-1 ring-white/10"
      >
        <div className="flex items-center gap-2 p-2.5">
          <Download size={14} className="shrink-0 text-primary" />
          <div className="flex-1">
            <p className="text-xs text-foreground">
              Update available: v{update.latest_version}
            </p>
          </div>
          <button
            onClick={() => void open(update.download_url)}
            className="shrink-0 cursor-pointer rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Download
          </button>
          <button
            onClick={() => setUpdate(null)}
            className="shrink-0 cursor-pointer px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          >
            Dismiss
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
