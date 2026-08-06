import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export const CLOSE_DIALOG_REQUEST_EVENT = "aether:request-close-dialog";

export const CLOSE_CHOICE_KEY = "aether-close-choice";

export type CloseChoice = "close" | "tray" | null;

const appWindow = getCurrentWindow();

function getSavedChoice(): CloseChoice {
  const v = localStorage.getItem(CLOSE_CHOICE_KEY);
  if (v === "close" || v === "tray") return v;
  return null;
}

/**
 * Called by TitleBar close button. Shows dialog if no choice saved, otherwise acts directly.
 * The dialog is opened via the window event, keeping this module collection-of-functions pure.
 */
export function handleClose() {
  const choice = getSavedChoice();
  if (choice === "tray") {
    void appWindow.hide();
  } else if (choice === "close") {
    void appWindow.close();
  } else {
    window.dispatchEvent(new Event(CLOSE_DIALOG_REQUEST_EVENT));
  }
}

/** Called by CloseToTrayToggle to sync the saved choice. */
export function syncCloseChoice(enabled: boolean) {
  localStorage.setItem(CLOSE_CHOICE_KEY, enabled ? "tray" : "close");
}

/** Set the close-to-tray behavior on the backend. */
export async function setCloseToTray(enabled: boolean): Promise<void> {
  await invoke("set_close_to_tray", { enabled });
}