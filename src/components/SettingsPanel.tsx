import { ChevronDown, Settings } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { cn } from "@/lib/utils";

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
      <Collapsible open={open} onOpenChange={onToggle}>
        <div
          className={cn(
            "rounded-lg transition-all duration-200 ease-out",
            open
              ? "bg-surface-2 ring-1 ring-white/5 shadow-sm shadow-black/10"
              : "bg-surface-2 hover:bg-surface-3 hover:shadow-sm hover:shadow-black/5",
          )}
        >
          <CollapsibleTrigger
            className={cn(
              "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-xs outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
              open
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Settings size={13} />
            Settings
            <ChevronDown
              size={13}
              className="ml-auto transition-transform duration-150 data-[state=open]:rotate-180"
              data-state={open ? "open" : "closed"}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1 data-[state=open]:duration-200 data-[state=open]:[animation-timing-function:cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-1 data-[state=closed]:duration-150">
            <Separator className="bg-white/5" />
            <div className="flex flex-col gap-2.5 px-3 pt-2 pb-2.5">
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
                    <span className="pt-0.5 text-[9px] text-muted-foreground/40">further improvements by freaky:3</span>
                  </div>
                  <UpdateChecker />
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
}
