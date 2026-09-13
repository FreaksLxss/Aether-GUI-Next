import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSyncExternalStore } from "react";

/**
 * Single source of truth for "is the host window focused". Primary feed:
 * the Rust-side GetForegroundWindow watcher (`app://focused`, see
 * src-tauri/src/focus.rs) — every webview-visible signal proved unreliable
 * on Windows (tao focus events fire inconsistently, isFocused()
 * false-negatives while the WebView2 child holds Win32 focus, and
 * document.hasFocus() stays true even minimized; all verified live).
 * Tauri's own focus events stay wired as a faster secondary signal; the
 * Rust watcher corrects them within a second either way. Every looping
 * animation gates on this — it's what keeps the app at ~0% CPU while it
 * sits in the background, which is most of a VPN app's life.
 */
let focused = true;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (next === focused) return;
  focused = next;
  listeners.forEach((l) => l());
}

const eventLog: Array<{ t: number; focused: boolean; src: string }> = [];
function record(next: boolean, src: string) {
  eventLog.push({ t: Date.now(), focused: next, src });
  set(next);
}

function isTauriEnv(): boolean {
  try {
    const w = window as unknown as Record<string, unknown>;
    return !!w.__TAURI_INTERNALS__ || !!w.__TAURI__ || !!w.__TAURI_IPC__;
  } catch { return false; }
}

if (isTauriEnv()) {
  listen<boolean>("app://focused", (e) => record(e.payload, "rust")).catch(() => {});
  getCurrentWindow()
    .onFocusChanged(({ payload }) => record(payload, "tauri"))
    .catch(() => {});
  (window as unknown as { __focus?: object }).__focus = {
    state: () => focused,
    events: () => eventLog.slice(-10),
  };
}

export function useWindowFocused(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => focused,
  );
}
