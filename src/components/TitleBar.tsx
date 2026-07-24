import { getCurrentWindow } from "@tauri-apps/api/window";
import { Maximize2, Minus, X } from "lucide-react";
import { ProxyIndicator } from "@/components/ProxyIndicator";
import { handleClose } from "@/components/CloseDialog";

const appWindow = getCurrentWindow();

export function TitleBar() {
  return (
    // data-tauri-drag-region only fires when the mousedown target IS this
    // element, so the buttons stay clickable without any extra handling.
    <header
      data-tauri-drag-region
      className="relative z-10 flex h-9 shrink-0 select-none items-center justify-end"
    >
      <div className="absolute left-0 top-0 flex h-full items-center">
        <ProxyIndicator />
      </div>
      <button
        aria-label="Minimize"
        className="grid h-full w-13 cursor-pointer place-items-center text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        onClick={() => void appWindow.minimize()}
      >
        <Minus className="size-4" />
      </button>
      <button
        aria-label="Maximize"
        className="grid h-full w-13 cursor-pointer place-items-center text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        onClick={() => void appWindow.toggleMaximize()}
      >
        <Maximize2 className="size-3.5" />
      </button>
      <button
        aria-label="Close"
        className="grid h-full w-13 cursor-pointer place-items-center text-muted-foreground hover:bg-destructive hover:text-white"
        onClick={handleClose}
      >
        <X className="size-4" />
      </button>
    </header>
  );
}
