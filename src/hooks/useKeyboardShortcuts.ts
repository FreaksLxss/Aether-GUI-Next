import { useEffect } from "react";
import { useConnectionStore } from "@/state/connectionStore";

/** Global keyboard shortcuts for the app. */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+Shift+C — toggle connect/disconnect
      if (e.ctrlKey && e.shiftKey && e.code === "KeyC") {
        e.preventDefault();
        const { status, connect, disconnect } = useConnectionStore.getState();
        const phase = status.state;
        if (phase === "Idle" || phase === "Error") {
          void connect();
        } else if (phase === "Connected" || phase === "Connecting" || phase === "Reconnecting" || phase === "Launching") {
          void disconnect();
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
