import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

const LOG_WINDOW_LABEL = "log-window";

let logWindow: WebviewWindow | null = null;

export async function openLogWindow(): Promise<void> {
  if (logWindow) {
    try {
      const exists = await logWindow.isVisible();
      if (exists) {
        await logWindow.setFocus();
        return;
      }
    } catch {
      logWindow = null;
    }
  }

  logWindow = new WebviewWindow(LOG_WINDOW_LABEL, {
    url: "/log-window.html",
    title: "Aether - Live Log",
    width: 860,
    height: 560,
    minWidth: 400,
    minHeight: 300,
    center: false,
    decorations: false,
    transparent: false,
    backgroundColor: "#09090b",
    resizable: true,
    dragDropEnabled: false,
  });

  logWindow.once("tauri://error", (e) => {
    console.error("Failed to create log window:", e);
    logWindow = null;
  });

  logWindow.once("tauri://close-requested", () => {
    logWindow = null;
  });
}
