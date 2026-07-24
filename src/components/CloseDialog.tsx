import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { X, Minus, Power } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const CLOSE_CHOICE_KEY = "aether-close-choice";

const appWindow = getCurrentWindow();

type CloseChoice = "close" | "tray" | null;

function getSavedChoice(): CloseChoice {
  const v = localStorage.getItem(CLOSE_CHOICE_KEY);
  if (v === "close" || v === "tray") return v;
  return null;
}

/** Module-level setter so the close button (TitleBar) can trigger the dialog. */
let setShowFn: ((show: boolean) => void) | null = null;

/** Called by TitleBar close button. Shows dialog if no choice saved, otherwise acts directly. */
export function handleClose() {
  const choice = getSavedChoice();
  if (choice === "tray") {
    void appWindow.hide();
  } else if (choice === "close") {
    void appWindow.close();
  } else {
    // First time — show the dialog
    setShowFn?.(true);
  }
}

export function CloseDialog() {
  const [show, setShow] = useState(false);

  // Register the setter so handleClose can trigger us
  setShowFn = setShow;

  const handleChoice = (choice: CloseChoice) => {
    localStorage.setItem(CLOSE_CHOICE_KEY, choice ?? "close");
    setShow(false);
    if (choice === "tray") {
      void appWindow.hide();
    } else {
      void appWindow.close();
    }
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60"
          onClick={() => setShow(false)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            className="w-72 rounded-lg bg-surface-1 p-5 ring-1 ring-white/10"
          >
            <div className="flex items-start justify-between">
              <h2 className="text-sm font-medium text-foreground">
                Close Aether?
              </h2>
              <button
                onClick={() => setShow(false)}
                className="cursor-pointer text-muted-foreground hover:text-foreground"
              >
                <X size={14} />
              </button>
            </div>

            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              How would you like to close the app?
            </p>

            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={() => handleChoice("tray")}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg bg-surface-2 px-3 py-2.5 text-xs text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Minus size={14} />
                <div className="text-left">
                  <p className="font-medium text-foreground">Minimize to tray</p>
                  <p className="text-[10px] text-muted-foreground">App keeps running in the background</p>
                </div>
              </button>
              <button
                onClick={() => handleChoice("close")}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg bg-surface-2 px-3 py-2.5 text-xs text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Power size={14} />
                <div className="text-left">
                  <p className="font-medium text-foreground">Close completely</p>
                  <p className="text-[10px] text-muted-foreground">Shuts down the app entirely</p>
                </div>
              </button>
            </div>

            <p className="mt-3 text-center text-[10px] text-muted-foreground/60">
              Your choice will be saved for next time
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
