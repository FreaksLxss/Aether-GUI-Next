import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

function isTauriEnv2(): boolean {
  try {
    const w = window as unknown as Record<string, unknown>;
    return !!w.__TAURI_INTERNALS__ || !!w.__TAURI__ || !!w.__TAURI_IPC__;
  } catch { return false; }
}

export function useWindowPersist() {
  useEffect(() => {
    if (!isTauriEnv2()) return;
    let debounced: ReturnType<typeof setTimeout> | null = null;

    const save = async () => {
      try {
        const win = getCurrentWindow();
        const pos = await win.outerPosition();
        const size = await win.outerSize();
        await invoke("save_window_position", { x: pos.x, y: pos.y, width: size.width, height: size.height });
      } catch {
      }
    };

    const schedule = () => {
      if (debounced) clearTimeout(debounced);
      debounced = setTimeout(() => void save(), 500);
    };

    void (async () => {
      try {
        const p = await invoke<[number, number, number, number] | null>("get_window_position");
        if (p) {
          const [x, y, w, h] = p;
          const win = getCurrentWindow();
          if (x >= -100 && y >= -100 && w > 100 && h > 100) {
            await win.setPosition({ x, y } as unknown as never);
            await win.setSize({ width: w, height: h } as unknown as never);
          }
        }
      } catch {
      }
    })();

    window.addEventListener("resize", schedule);
    let unlistenMove: (() => void) | undefined;
    void getCurrentWindow()
      .onMoved(() => schedule())
      .then((u) => {
        unlistenMove = u;
      })
      .catch(() => {});

    return () => {
      window.removeEventListener("resize", schedule);
      unlistenMove?.();
      if (debounced) clearTimeout(debounced);
    };
  }, []);
}
