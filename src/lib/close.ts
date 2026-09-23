import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Window as TauriWindow } from "@tauri-apps/api/window";

export const CLOSE_DIALOG_REQUEST_EVENT = "aether:request-close-dialog";

export const CLOSE_CHOICE_KEY = "aether-close-choice";

export type CloseChoice = "close" | "tray" | null;

export function tauriWindow(): TauriWindow | null {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}
const appWindow = tauriWindow();

function getSavedChoice(): CloseChoice {
  const v = localStorage.getItem(CLOSE_CHOICE_KEY);
  if (v === "close" || v === "tray") return v;
  return null;
}

export function handleClose() {
  const choice = getSavedChoice();
  if (choice === "tray") {
    void appWindow?.hide();
  } else if (choice === "close") {
    void appWindow?.close();
  } else {
    window.dispatchEvent(new Event(CLOSE_DIALOG_REQUEST_EVENT));
  }
}

export function syncCloseChoice(enabled: boolean) {
  localStorage.setItem(CLOSE_CHOICE_KEY, enabled ? "tray" : "close");
}

export async function setCloseToTray(enabled: boolean): Promise<void> {
  await invoke("set_close_to_tray", { enabled });
}