import { Bookmark, Clock, Globe, Search, Settings, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type PanelId = "advanced" | "presets" | "ipchanger" | "history" | "settings";

const ITEMS: { id: PanelId; label: string; icon: typeof Settings2; hint: string }[] = [
  { id: "advanced", label: "Advanced", icon: Settings2, hint: "Proxy · Routing · Behavior" },
  { id: "presets", label: "Presets", icon: Bookmark, hint: "Save & switch profiles" },
  { id: "ipchanger", label: "IP Changer", icon: Globe, hint: "Tor circuit & auto-rotate" },
  { id: "history", label: "History", icon: Clock, hint: "Recent connections" },
  { id: "settings", label: "Settings", icon: Settings, hint: "System · Network · Appearance" },
];

export function AppMenu({
  onOpen,
  onOpenPalette,
}: {
  onOpen: (id: PanelId) => void;
  onOpenPalette: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 rounded-full bg-surface-2 px-3.5 text-xs font-medium tracking-wide ring-1 ring-border hover:bg-surface-3"
          >
            <Settings size={13} />
            Options
            <span className="ml-0.5 hidden text-[11px] leading-none text-muted-foreground tabular-nums sm:inline">
              · 5
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="center"
          side="top"
          sideOffset={10}
          collisionPadding={12}
          avoidCollisions
          className="w-[min(16rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1rem)] gap-0 p-1.5"
        >
          <div className="flex flex-col gap-1">
            {ITEMS.map(({ id, label, icon: Icon, hint }) => (
              <button
                key={id}
                onClick={() => onOpen(id)}
                data-cuelume-press="press"
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-foreground/[0.06] active:bg-foreground/[0.08]"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-3 ring-1 ring-border">
                  <Icon size={13} className="text-muted-foreground" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium leading-none text-foreground">
                    {label}
                  </span>
                  <span className="block truncate text-[11px] leading-none tracking-wide text-muted-foreground">
                    {hint}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex items-center justify-between border-t border-border pt-1.5">
            <span className="px-1 text-[11px] tracking-wide text-muted-foreground">
              Press{" "}
              <kbd className="rounded bg-foreground/[0.08] px-1 py-0.5 font-mono text-[11px] ring-1 ring-border">
                ⌘K
              </kbd>{" "}
              to search
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onOpenPalette}
              aria-label="Open command palette"
              className="size-7 rounded-md text-muted-foreground"
            >
              <Search size={12} />
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Button
        variant="ghost"
        size="icon"
        onClick={onOpenPalette}
        aria-label="Search options"
        className="size-8 rounded-full bg-surface-2 ring-1 ring-border hover:bg-surface-3"
      >
        <Search size={13} className="text-muted-foreground" />
      </Button>
    </div>
  );
}
