import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Power } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const CLOSE_CHOICE_KEY = "aether-close-choice";

const appWindow = getCurrentWindow();

type CloseChoice = "close" | "tray" | null;

function getSavedChoice(): CloseChoice {
  const v = localStorage.getItem(CLOSE_CHOICE_KEY);
  if (v === "close" || v === "tray") return v;
  return null;
}

let setShowFn: ((show: boolean) => void) | null = null;

/** Called by TitleBar close button. Shows dialog if no choice saved, otherwise acts directly. */
export function handleClose() {
  const choice = getSavedChoice();
  if (choice === "tray") {
    void appWindow.hide();
  } else if (choice === "close") {
    void appWindow.close();
  } else {
    setShowFn?.(true);
  }
}

/** Called by CloseToTrayToggle to sync the saved choice. */
export function syncCloseChoice(enabled: boolean) {
  localStorage.setItem(CLOSE_CHOICE_KEY, enabled ? "tray" : "close");
}

export function CloseDialog() {
  const [show, setShow] = useState(false);

  setShowFn = setShow;

  const handleChoice = async (choice: CloseChoice) => {
    localStorage.setItem(CLOSE_CHOICE_KEY, choice ?? "close");
    setShow(false);
    if (choice === "tray") {
      await invoke("set_close_to_tray", { enabled: true }).catch(() => {});
      void appWindow.hide();
    } else {
      await invoke("set_close_to_tray", { enabled: false }).catch(() => {});
      void appWindow.close();
    }
  };

  return (
    <Dialog open={show} onOpenChange={setShow}>
      <DialogContent className="w-72 gap-0 p-5">
        <DialogHeader>
          <DialogTitle className="text-sm">Close Aether?</DialogTitle>
          <DialogDescription className="text-xs">
            How would you like to close the app?
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="mt-4 flex-col gap-2">
          <Button
            variant="outline"
            onClick={() => handleChoice("tray")}
            className="flex h-auto justify-start gap-2.5 px-3 py-2.5"
          >
            <Minus size={14} />
            <div className="text-left">
              <p className="font-medium text-foreground">Minimize to tray</p>
              <p className="text-[10px] text-muted-foreground">App keeps running in the background</p>
            </div>
          </Button>
          <Button
            variant="outline"
            onClick={() => handleChoice("close")}
            className="flex h-auto justify-start gap-2.5 px-3 py-2.5"
          >
            <Power size={14} />
            <div className="text-left">
              <p className="font-medium text-foreground">Close completely</p>
              <p className="text-[10px] text-muted-foreground">Shuts down the app entirely</p>
            </div>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
