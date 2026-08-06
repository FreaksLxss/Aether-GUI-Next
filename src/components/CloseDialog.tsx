import { useEffect, useState } from "react";
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
import {
  CLOSE_DIALOG_REQUEST_EVENT,
  CLOSE_CHOICE_KEY,
  setCloseToTray,
  type CloseChoice,
} from "@/lib/close";

const appWindow = getCurrentWindow();

export function CloseDialog() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onRequest = () => setShow(true);
    window.addEventListener(CLOSE_DIALOG_REQUEST_EVENT, onRequest);
    return () => window.removeEventListener(CLOSE_DIALOG_REQUEST_EVENT, onRequest);
  }, []);

  const handleChoice = async (choice: CloseChoice) => {
    localStorage.setItem(CLOSE_CHOICE_KEY, choice ?? "close");
    setShow(false);
    if (choice === "tray") {
      await setCloseToTray(true).catch(() => {});
      void appWindow.hide();
    } else {
      await setCloseToTray(false).catch(() => {});
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