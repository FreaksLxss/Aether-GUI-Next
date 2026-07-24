import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const DISMISSED_KEY = "aether-notif-banner-dismissed";

export function NotificationBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Check if user already dismissed or granted permission
    if (localStorage.getItem(DISMISSED_KEY)) return;

    import("@tauri-apps/plugin-notification")
      .then(async ({ isPermissionGranted }) => {
        const granted = await isPermissionGranted();
        if (!granted) setVisible(true);
      })
      .catch(() => {
        // Plugin not available — don't show banner
      });
  }, []);

  const dismiss = (granted?: boolean) => {
    setVisible(false);
    localStorage.setItem(DISMISSED_KEY, "1");
    if (granted) {
      import("@tauri-apps/plugin-notification")
        .then(({ requestPermission }) => requestPermission())
        .catch(() => {});
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -8, height: 0 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-sm overflow-hidden rounded-md bg-surface-3 ring-1 ring-white/10"
        >
          <div className="flex items-start gap-2 p-3">
            <Bell size={14} className="mt-0.5 shrink-0 text-primary" />
            <div className="flex-1">
              <p className="text-xs font-medium text-foreground">
                Enable notifications?
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Get notified when the tunnel connects or drops.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => dismiss(true)}
                  className="cursor-pointer rounded bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground hover:opacity-90"
                >
                  Allow
                </button>
                <button
                  onClick={() => dismiss(false)}
                  className="cursor-pointer rounded px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                >
                  No thanks
                </button>
              </div>
            </div>
            <button
              onClick={() => dismiss(false)}
              className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <X size={12} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
