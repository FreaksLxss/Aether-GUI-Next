import { useEffect, useLayoutEffect, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { ConnectButton } from "@/components/ConnectButton";
import { ConnectionStatusLine } from "@/components/ConnectionStatusLine";
import { ConnectionInfo } from "@/components/ConnectionInfo";
import { PublicLocation } from "@/components/PublicLocation";
import { CopyProxyButton } from "@/components/CopyProxyButton";
import { PacUrl } from "@/components/PacUrl";
import { QuickConnect } from "@/components/QuickConnect";
import { QuickProtocol } from "@/components/QuickProtocol";
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
import { useSquircleClip } from "@/hooks/useSquircleMask";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useConnectionSound } from "@/hooks/useConnectionSound";
import { initConnectionListeners, useConnectionStore } from "@/state/connectionStore";
import { SCREEN_FADE, SPRING } from "@/lib/motion";

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
    <div className="relative z-10 flex h-full flex-col items-center overflow-y-auto px-5 pt-4 pb-[1.3rem]">
      <NotificationBanner />
      {/* Button centered in a fixed-height area — height never changes
          so the button position is rock-stable regardless of what's below */}
      <div className="flex h-60 shrink-0 items-center justify-center">
        <ConnectButton />
      </div>
      {/* Status + details flow below the fixed button area */}
      <div className="flex flex-col items-center gap-3">
        <ConnectionStatusLine />
        <PublicLocation key={isConnected ? "connected" : "disconnected"} />
        <AnimatePresence>
          {isConnected && (
            <motion.div
              key="connected-cluster"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={SPRING}
              className="flex flex-col items-center gap-3"
            >
              <ConnectionInfo />
              <div className="flex gap-1.5">
                <CopyProxyButton />
                <PacUrl />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <QuickConnect onMoreOptions={openAdvancedHighlightScan} />
        <QuickProtocol />
      </div>
      <div className="mt-auto flex w-full max-w-sm flex-col gap-1.5 pt-3">
        <div className="flex items-center gap-2 px-1">
          <div className="h-px flex-1 bg-white/5" />
          <span className="text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase">
            Options
          </span>
          <div className="h-px flex-1 bg-white/5" />
        </div>
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
      import("@/lib/theme").then(({ applyColors }) => {
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

  const shellRef = useSquircleClip(22);

  return (
    <TooltipProvider>
      <MotionConfig reducedMotion="user">
        <div ref={shellRef} className="window-shell flex flex-col bg-background">
          <CloseDialog />
          <AmbientBackground />
          <TitleBar />
          <div className="relative min-h-0 flex-1">
            <AnimatePresence mode="sync">
              {sidecarError ? (
                <motion.div key="error" className="absolute inset-0 z-10" {...SCREEN_FADE}>
                  <SidecarErrorScreen
                    message={sidecarError}
                    onRetry={() => {
                      retryAfterSidecarError();
                      void connect();
                    }}
                  />
                </motion.div>
              ) : (
                <motion.div key="main" className="absolute inset-0" {...SCREEN_FADE}>
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
