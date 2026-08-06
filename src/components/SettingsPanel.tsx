import { Settings } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { GlassAccordion } from "@/components/GlassAccordion";
import { SystemProxyToggle } from "@/components/SystemProxyToggle";
import { CaptureModeSelect } from "@/components/CaptureModeSelect";
import { DnsModeSelect } from "@/components/DnsModeSelect";
import { AlwaysOnTopToggle } from "@/components/AlwaysOnTopToggle";
import { AutoStartToggle } from "@/components/AutoStartToggle";
import { MinimizeOnStartupToggle } from "@/components/MinimizeOnStartupToggle";
import { CloseToTrayToggle } from "@/components/CloseToTrayToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ColorTheme } from "@/components/ColorTheme";
import { SettingsIO } from "@/components/SettingsIO";
import { AboutDialog } from "@/components/AboutDialog";
import { UpdateChecker } from "@/components/UpdateChecker";
import { useConnectionStore } from "@/state/connectionStore";

export function SettingsPanel({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  const captureMode = useConnectionStore((s) => s.profile.capture_mode);
  const showSystemProxy = captureMode === "proxy" || captureMode === "both";
  return (
    <div className="w-full">
      <GlassAccordion
        icon={Settings}
        label="Settings"
        open={open}
        onToggle={onToggle}
      >
        <div className="flex flex-col gap-2.5">
          {/* System toggles */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium tracking-wide text-primary uppercase">
              System
            </span>
            <AlwaysOnTopToggle />
            <AutoStartToggle />
            <MinimizeOnStartupToggle />
            <CloseToTrayToggle key={open ? "open" : "closed"} />
          </div>

          {/* Network */}
          <Separator className="bg-border" />
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium tracking-wide text-primary uppercase">
              Network
            </span>
            <CaptureModeSelect />
            {showSystemProxy && <SystemProxyToggle />}
            {captureMode !== "proxy" && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] text-muted-foreground">DNS resolution</span>
                <DnsModeSelect />
              </div>
            )}
          </div>

          {/* Appearance */}
          <Separator className="bg-border" />
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-medium tracking-wide text-primary uppercase">
              Appearance
            </span>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ThemeToggle />
                <ColorTheme />
              </div>
              <SettingsIO />
            </div>
          </div>

          {/* About & Updates */}
          <Separator className="bg-border" />
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-medium tracking-wide text-primary uppercase">
              About
            </span>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AboutDialog />
                <span className="pt-0.5 text-[10px] text-muted-foreground/70">further improvements by freaky:3</span>
              </div>
              <UpdateChecker />
            </div>
          </div>
        </div>
      </GlassAccordion>
    </div>
  );
}
