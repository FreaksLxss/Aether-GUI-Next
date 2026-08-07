import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { SPRING_FAST } from "@/lib/motion";

const DISMISSED_KEY = "aether-notif-banner-dismissed";

export function NotificationBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return;

    import("@tauri-apps/plugin-notification")
      .then(async ({ isPermissionGranted }) => {
        const granted = await isPermissionGranted();
        if (!granted) setVisible(true);
      })
      .catch(() => {});
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
          role="region"
          aria-label="Notification permissions request"
          initial={{ opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -8, height: 0 }}
          transition={SPRING_FAST}
          className="w-full overflow-hidden"
        >
          <div className="glass-strong flex items-start gap-2.5 rounded-xl px-3 py-2.5 shadow-glass ring-1 ring-inset ring-white/10">
            <Bell size={14} className="mt-0.5 shrink-0 text-primary" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground">
                Enable notifications?
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Get notified when the tunnel connects or drops.
              </p>
              <div className="mt-2 flex items-center gap-1.5">
                <Button size="sm" onClick={() => dismiss(true)} className="h-6 px-2.5 text-[10px]">
                  Allow
                </Button>
                <Button size="sm" variant="ghost" onClick={() => dismiss(false)} className="h-6 px-2 text-[10px] text-muted-foreground">
                  No thanks
                </Button>
              </div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => dismiss(false)}
              className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X size={12} />
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
