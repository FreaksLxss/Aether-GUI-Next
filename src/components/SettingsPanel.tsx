import { ChevronDown, Settings } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { SystemProxyToggle } from "@/components/SystemProxyToggle";
import { AlwaysOnTopToggle } from "@/components/AlwaysOnTopToggle";
import { AutoStartToggle } from "@/components/AutoStartToggle";
import { MinimizeOnStartupToggle } from "@/components/MinimizeOnStartupToggle";
import { CloseToTrayToggle } from "@/components/CloseToTrayToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ColorTheme } from "@/components/ColorTheme";
import { SettingsIO } from "@/components/SettingsIO";
import { AboutDialog } from "@/components/AboutDialog";
import { UpdateChecker } from "@/components/UpdateChecker";
import { cn } from "@/lib/utils";

export function SettingsPanel({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="w-full">
      <Collapsible open={open} onOpenChange={onToggle}>
        <div
          className={cn(
            "rounded-lg transition-colors duration-150",
            open
              ? "bg-surface-2 ring-1 ring-white/5"
              : "bg-surface-2 hover:bg-surface-3",
          )}
        >
          <CollapsibleTrigger
            className={cn(
              "flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-xs outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
              open
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Settings size={14} />
            Settings
            <ChevronDown
              size={14}
              className="ml-auto transition-transform duration-150 data-[state=open]:rotate-180"
              data-state={open ? "open" : "closed"}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1 data-[state=open]:duration-150 data-[state=open]:[animation-timing-function:cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-1 data-[state=closed]:duration-100">
            <div className="flex flex-col gap-3 border-t border-white/5 px-3 pt-3 pb-3">
            {/* System toggles */}
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-medium tracking-wide text-primary uppercase">
                System
              </span>
              <SystemProxyToggle />
              <AlwaysOnTopToggle />
              <AutoStartToggle />
              <MinimizeOnStartupToggle />
              <CloseToTrayToggle />
            </div>

            {/* Appearance */}
            <div className="h-px bg-border" />
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
            <div className="h-px bg-border" />
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-medium tracking-wide text-primary uppercase">
                About
              </span>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AboutDialog />
                  <span className="text-[9px] text-muted-foreground/40">further improvements by freaky:3</span>
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
