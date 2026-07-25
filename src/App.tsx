import { useEffect, useLayoutEffect, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { ConnectButton } from "@/components/ConnectButton";
import { ConnectionStatusLine } from "@/components/ConnectionStatusLine";
import { ConnectionInfo } from "@/components/ConnectionInfo";
import { CopyProxyButton } from "@/components/CopyProxyButton";
import { PacUrl } from "@/components/PacUrl";
import { QuickConnect } from "@/components/QuickConnect";
import { AdvancedPanel } from "@/components/AdvancedPanel";
import { ConnectionHistory } from "@/components/ConnectionHistory";
import { ProfilePresets } from "@/components/ProfilePresets";
import { NotificationBanner } from "@/components/NotificationBanner";
import { SettingsPanel } from "@/components/SettingsPanel";
import { AmbientBackground } from "@/components/AmbientBackground";
import { SidecarErrorScreen } from "@/components/SidecarErrorScreen";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TitleBar } from "@/components/TitleBar";
import { CloseDialog } from "@/components/CloseDialog";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useConnectionSound } from "@/hooks/useConnectionSound";
import { initConnectionListeners, useConnectionStore } from "@/state/connectionStore";

const SCREEN_TRANSITION = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.16, ease: [0.22, 1, 0.36, 1] as const },
};

export type AccordionPanel = "advanced" | "presets" | "history" | "settings" | null;

function MainScreen() {
  const isConnected = useConnectionStore((s) => s.status.state === "Connected");
  const [activePanel, setActivePanel] = useState<AccordionPanel>(null);
  const [highlightScanMode, setHighlightScanMode] = useState(false);

  const togglePanel = (panel: AccordionPanel) =>
    setActivePanel((prev) => (prev === panel ? null : panel));

  const openAdvancedHighlightScan = () => {
    setHighlightScanMode(true);
    setActivePanel("advanced");
    // Clear highlight after animation
    setTimeout(() => setHighlightScanMode(false), 2000);
  };

  return (
    <div className="relative z-10 flex h-full flex-col items-center overflow-y-auto px-5 pt-4 pb-3">
      <NotificationBanner />
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <ConnectButton />
        <ConnectionStatusLine />
        <ConnectionInfo />
        {isConnected && (
          <div className="flex gap-1.5">
            <CopyProxyButton />
            <PacUrl />
          </div>
        )}
        <QuickConnect onMoreOptions={openAdvancedHighlightScan} />
      </div>
      <div className="mt-auto flex w-full max-w-sm flex-col gap-1 pt-1">
        <div className="h-px w-full bg-border/40" />
        <AdvancedPanel open={activePanel === "advanced"} onToggle={() => togglePanel("advanced")} highlightScanMode={highlightScanMode} />
        <ProfilePresets open={activePanel === "presets"} onToggle={() => togglePanel("presets")} />
        <ConnectionHistory open={activePanel === "history"} onToggle={() => togglePanel("history")} />
        <SettingsPanel open={activePanel === "settings"} onToggle={() => togglePanel("settings")} />
      </div>
    </div>
  );
}

export function App() {
  const sidecarError = useConnectionStore((s) => s.sidecarError);
  const retryAfterSidecarError = useConnectionStore((s) => s.retryAfterSidecarError);
  const connect = useConnectionStore((s) => s.connect);

  useKeyboardShortcuts();
  useConnectionSound();

  // Apply saved theme synchronously before first paint to prevent flash
  useLayoutEffect(() => {
    const savedTheme = localStorage.getItem("aether-theme");
    const isDark = savedTheme ? savedTheme === "dark" : true;
    const root = document.documentElement;
    if (isDark) {
      root.classList.remove("light");
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
      root.classList.add("light");
    }
    // Apply saved accent colors
    const p = localStorage.getItem("aether-custom-primary");
    const s = localStorage.getItem("aether-custom-secondary");
    if (p && s) {
      import("@/components/ColorTheme").then(({ applyColors }) => {
        applyColors(p, s, isDark);
      });
    }
  }, []);

  useEffect(() => {
    const cleanup = initConnectionListeners();
    return () => {
      void cleanup.then((unlisten) => unlisten());
    };
  }, []);

  return (
    <TooltipProvider>
      <MotionConfig reducedMotion="user">
        <div className="relative flex h-svh w-full flex-col overflow-hidden bg-background">
          <CloseDialog />
          <AmbientBackground />
          <TitleBar />
          <div className="relative min-h-0 flex-1">
            <AnimatePresence mode="sync">
              {sidecarError ? (
                <motion.div key="error" className="absolute inset-0 z-10" {...SCREEN_TRANSITION}>
                  <SidecarErrorScreen
                    message={sidecarError}
                    onRetry={() => {
                      retryAfterSidecarError();
                      void connect();
                    }}
                  />
                </motion.div>
              ) : (
                <motion.div key="main" className="absolute inset-0" {...SCREEN_TRANSITION}>
                  <MainScreen />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </MotionConfig>
    </TooltipProvider>
  );
}

export default App;
