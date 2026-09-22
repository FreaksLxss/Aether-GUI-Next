import { lazy, Suspense, useEffect, useLayoutEffect, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { AppWindow, Bookmark, Clock, Globe, Settings, Settings2 } from "lucide-react";
import { ConnectButton } from "@/components/ConnectButton";
import { ConnectionStatusLine } from "@/components/ConnectionStatusLine";
import { PublicLocation } from "@/components/PublicLocation";
import { CopyProxyButton } from "@/components/CopyProxyButton";
import { PacUrl } from "@/components/PacUrl";
import { QuickConnect } from "@/components/QuickConnect";
import { QuickProtocol } from "@/components/QuickProtocol";
import { LeakBanner } from "@/components/LeakBanner";
import { TrafficStats } from "@/components/TrafficStats";
import { ActiveConnections } from "@/components/ActiveConnections";
import { PanelDialog } from "@/components/PanelDialog";
import { PanelSkeleton } from "@/components/ui/panel-skeleton";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const AdvancedPanelContent = lazy(() =>
  import("@/components/AdvancedPanel").then((m) => ({ default: m.AdvancedPanelContent })),
);
const ProfilePresetsContent = lazy(() =>
  import("@/components/ProfilePresets").then((m) => ({ default: m.ProfilePresetsContent })),
);
const ConnectionHistoryContent = lazy(() =>
  import("@/components/ConnectionHistoryContent").then((m) => ({ default: m.ConnectionHistoryContent })),
);
const IpChangerContent = lazy(() =>
  import("@/components/ip-changer/IpChangerPanel").then((m) => ({ default: m.IpChangerContent })),
);
const SettingsContent = lazy(() =>
  import("@/components/SettingsPanel").then((m) => ({ default: m.SettingsContent })),
);
import { AppMenu, type PanelId } from "@/components/AppMenu";
import { CommandPalette } from "@/components/CommandPalette";
import { usePaletteItems } from "@/hooks/usePaletteItems";
import { NotificationBanner } from "@/components/NotificationBanner";
import { AmbientBackground } from "@/components/AmbientBackground";
import { SidecarErrorScreen } from "@/components/SidecarErrorScreen";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TitleBar } from "@/components/TitleBar";
import { CloseDialog } from "@/components/CloseDialog";
import { Toaster } from "@/components/ui/sonner";
import { OnboardingTour } from "@/components/OnboardingTour";
import { ShortcutsDialog } from "@/components/ShortcutsDialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSquircleClip } from "@/hooks/useSquircleMask";
import { useWindowPersist } from "@/hooks/useWindowPersist";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useConnectionSound } from "@/hooks/useConnectionSound";
import { initConnectionListeners, useConnectionStore } from "@/state/connectionStore";
import { initIpChangerListeners } from "@/stores/ipChangerStore";
import { SCREEN_FADE, SPRING } from "@/lib/motion";
import { useIpChangerSound } from "./hooks/useIpChangerSound";

export type AccordionPanel = PanelId | null;

function MainScreen() {
  const isConnected = useConnectionStore((s) => s.status.state === "Connected");
  const activeLen = useConnectionStore((s) => s.activeConns.length);
  const isLeaking = useConnectionStore(
    (s) => s.leakStatus === "leak" && s.status.state === "Connected",
  );
  const setScanMode = useConnectionStore((s) => s.setScanMode);
  const [panel, setPanel] = useState<PanelId | null>(null);
  const [activeOpen, setActiveOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [highlightScanMode, setHighlightScanMode] = useState(false);

  const paletteItems = usePaletteItems(setPanel);

  useEffect(() => {
    if (!isConnected) return;
    const refresh = () => void useConnectionStore.getState().refreshActiveConns();
    refresh();
    const id = window.setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [isConnected]);

  useEffect(() => {
    const onToggle = () => setPaletteOpen((v) => !v);
    window.addEventListener("aether:toggle-palette", onToggle as EventListener);
    return () => window.removeEventListener("aether:toggle-palette", onToggle as EventListener);
  }, []);

  const openAdvancedHighlightScan = () => {
    setHighlightScanMode(true);
    setPanel("advanced");
    setTimeout(() => setHighlightScanMode(false), 2000);
  };

  const closePanel = () => setPanel(null);

  return (
    <div className="relative z-10 flex h-full flex-col items-center overflow-y-auto px-5 pt-4 pb-[1.3rem]">
      <a href="#main" className="sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-1.5 focus:text-xs focus:text-primary-foreground focus:not-sr-only">
        Skip to content
      </a>
      <NotificationBanner />
      <motion.div
        className="flex h-60 shrink-0 items-center justify-center"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={SPRING}
      >
        <ConnectButton />
      </motion.div>
      <motion.div
        id="main"
        className="flex flex-col items-center gap-3"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING, delay: 0.04 }}
      >
        {isLeaking && <LeakBanner />}
        <ConnectionStatusLine
          onTryVerified={() => {
            setScanMode("verified");
            openAdvancedHighlightScan();
          }}
        />
        <PublicLocation key={isConnected ? "connected" : "disconnected"} />
        <TrafficStats onOpenActive={() => setActiveOpen(true)} />
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
              <div className="flex flex-col gap-1.5 rounded-[35px] bg-surface-2 px-3 py-2.5 ring-1 ring-border">
                <div className="flex flex-wrap items-center gap-1.5">
                  <CopyProxyButton />
                  <PacUrl />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <QuickConnect onMoreOptions={openAdvancedHighlightScan} />
        <QuickProtocol />
      </motion.div>

      <motion.div
        className="mt-auto flex w-full max-w-sm flex-col items-center gap-2 pt-5"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING, delay: 0.08 }}
      >
        <AppMenu onOpen={setPanel} onOpenPalette={() => setPaletteOpen(true)} />
        <p className="text-center text-xs tracking-wide text-muted-foreground">
          <kbd aria-hidden className="rounded bg-foreground/[0.06] px-1 py-0.5 font-mono ring-1 ring-border">⌘K</kbd> to search everything ·{" "}
          <button type="button" aria-label="Open keyboard shortcuts" onClick={() => window.dispatchEvent(new CustomEvent("aether:open-shortcuts"))} className="underline decoration-dotted underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1">
            shortcuts ?
          </button>
        </p>
      </motion.div>

      <Dialog open={activeOpen} onOpenChange={setActiveOpen}>
        <DialogContent className="sm:max-w-[360px]" aria-describedby={undefined}>
          <div className="rounded-xl bg-card px-3 py-3 ring-1 ring-border light:bg-white light:shadow-lg">
            <DialogHeader className="mb-2 flex flex-row items-center justify-between gap-0 space-y-0 pr-6">
              <div className="flex items-center gap-1.5">
                <AppWindow size={11} className="shrink-0 text-muted-foreground/60" aria-hidden />
                <DialogTitle className="text-[11px] font-medium tracking-widest uppercase text-muted-foreground/60">Active apps</DialogTitle>
              </div>
              {isConnected && (
                <span className="text-[11px] tabular-nums text-muted-foreground/50">
                  {activeLen} conns
                </span>
              )}
            </DialogHeader>
            <DialogDescription className="sr-only">Per-app connections through the tunnel.</DialogDescription>
            <ActiveConnections compact />
          </div>
        </DialogContent>
      </Dialog>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} items={paletteItems} />
      <OnboardingTour />
      <ShortcutsDialog />

      <PanelDialog
        open={panel === "advanced"}
        onOpenChange={(v) => !v && closePanel()}
        icon={Settings2}
        title="Advanced"
        description="Protocol, proxy, routing & logs."
      >
        <Suspense fallback={<PanelSkeleton />}>
          <ErrorBoundary label="advanced" onReset={() => setPanel(null)}>
            <AdvancedPanelContent highlightScanMode={highlightScanMode} />
          </ErrorBoundary>
        </Suspense>
      </PanelDialog>

      <PanelDialog
        open={panel === "presets"}
        onOpenChange={(v) => !v && closePanel()}
        icon={Bookmark}
        title="Presets"
        description="Save the current profile or apply a saved one."
      >
        <Suspense fallback={<PanelSkeleton />}>
          <ErrorBoundary label="presets" onReset={() => setPanel(null)}>
            <ProfilePresetsContent />
          </ErrorBoundary>
        </Suspense>
      </PanelDialog>

      <PanelDialog
        open={panel === "ipchanger"}
        onOpenChange={(v) => !v && closePanel()}
        icon={Globe}
        title="IP Changer"
        description="Tor circuit, exit IP & auto-rotate."
      >
        <Suspense fallback={<PanelSkeleton />}>
          <ErrorBoundary label="ipchanger" onReset={() => setPanel(null)}>
            <IpChangerContent />
          </ErrorBoundary>
        </Suspense>
      </PanelDialog>

      <PanelDialog
        open={panel === "history"}
        onOpenChange={(v) => !v && closePanel()}
        icon={Clock}
        title="History"
        description="Recent connection attempts."
      >
        <Suspense fallback={<PanelSkeleton />}>
          <ErrorBoundary label="history" onReset={() => setPanel(null)}>
            <ConnectionHistoryContent />
          </ErrorBoundary>
        </Suspense>
      </PanelDialog>

      <PanelDialog
        open={panel === "settings"}
        onOpenChange={(v) => !v && closePanel()}
        icon={Settings}
        title="Settings"
        description="System, network & appearance."
      >
        <Suspense fallback={<PanelSkeleton />}>
          <ErrorBoundary label="settings" onReset={() => setPanel(null)}>
            <SettingsContent />
          </ErrorBoundary>
        </Suspense>
      </PanelDialog>
    </div>
  );
}

export function App() {
  const sidecarError = useConnectionStore((s) => s.sidecarError);
  const retryAfterSidecarError = useConnectionStore((s) => s.retryAfterSidecarError);
  const connect = useConnectionStore((s) => s.connect);

  useKeyboardShortcuts();
  useConnectionSound();
  useIpChangerSound();
  useWindowPersist();

  useLayoutEffect(() => {
    const savedTheme = localStorage.getItem("aether-theme");
    const apply = (dark: boolean) => {
      const root = document.documentElement;
      if (dark) {
        root.classList.remove("light");
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
        root.classList.add("light");
      }
      const p = localStorage.getItem("aether-custom-primary");
      const s = localStorage.getItem("aether-custom-secondary");
      if (p && s) {
        import("@/lib/theme").then(({ applyColors }) => {
          applyColors(p, s, dark);
        });
      }
    };
    if (savedTheme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      apply(mq.matches);
      const handler = (e: MediaQueryListEvent) => apply(e.matches);
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
    const isDark = savedTheme ? savedTheme === "dark" : true;
    apply(isDark);
  }, []);

  useEffect(() => {
    const cleanup = initConnectionListeners();
    const cleanupIp = initIpChangerListeners();
    return () => {
      void cleanup.then((unlisten) => unlisten());
      void cleanupIp.then((unlisten) => unlisten());
    };
  }, []);

  const shellRef = useSquircleClip();

  return (
    <TooltipProvider>
      <Toaster />
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
