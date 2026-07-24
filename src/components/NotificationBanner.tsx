import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

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
          role="status"
          initial={{ opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -8, height: 0 }}
          transition={{ duration: 0.2 }}
        >
          <Alert className="bg-surface-3">
            <Bell className="size-4 text-primary" />
            <AlertTitle className="text-xs font-medium">Enable notifications?</AlertTitle>
            <AlertDescription className="text-[10px] text-muted-foreground">
              Get notified when the tunnel connects or drops.
            </AlertDescription>
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" onClick={() => dismiss(true)} className="h-6 px-2 text-[10px]">
                Allow
              </Button>
              <Button size="sm" variant="ghost" onClick={() => dismiss(false)} className="h-6 px-2 text-[10px] text-muted-foreground">
                No thanks
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => dismiss(false)}
                className="ml-auto h-5 w-5 text-muted-foreground hover:text-foreground"
              >
                <X size={12} />
              </Button>
            </div>
          </Alert>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
