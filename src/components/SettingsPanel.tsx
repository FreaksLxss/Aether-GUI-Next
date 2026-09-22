import { Info, Monitor, Network, Palette, Volume2 } from "lucide-react";
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
import { SoundSettings } from "@/components/SoundSettings";
import { AboutDialog } from "@/components/AboutDialog";
import { UpdateChecker } from "@/components/UpdateChecker";
import { useConnectionStore } from "@/state/connectionStore";
import { Section } from "@/components/ui/panel-section";

export function SettingsContent() {
  const captureMode = useConnectionStore((s) => s.profile.capture_mode);
  const showSystemProxy = captureMode === "proxy" || captureMode === "both";
  return (
    <div className="flex flex-col gap-4">
      <Section title="System" icon={Monitor}>
        <AlwaysOnTopToggle />
        <AutoStartToggle />
        <MinimizeOnStartupToggle />
        <CloseToTrayToggle />
      </Section>

      <Section title="Network" icon={Network}>
        <CaptureModeSelect />
        {showSystemProxy && <SystemProxyToggle />}
        {captureMode !== "proxy" && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium tracking-wide text-muted-foreground">DNS resolution</span>
            <DnsModeSelect />
          </div>
        )}
      </Section>

      <Section title="Appearance" icon={Palette}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <ColorTheme />
          </div>
          <SettingsIO />
        </div>
      </Section>

      <Section title="Sound" icon={Volume2}>
        <SoundSettings />
      </Section>

      <Section title="About" icon={Info}>
        <div className="flex items-center justify-between gap-3">
          <AboutDialog />
          <UpdateChecker />
        </div>
      </Section>
    </div>
  );
}

// Back-compat shim
export function SettingsPanel(props: { open: boolean; onToggle: () => void }) {
  void props;
  return <SettingsContent />;
}
