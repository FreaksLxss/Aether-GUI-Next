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
        return;
      }
      // Cmd/Ctrl+K — toggle palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("aether:toggle-palette"));
        return;
      }
      // ? or Cmd+/ — open shortcuts help (ignore when typing in inputs)
      const target = e.target as HTMLElement | null;
      const isTyping = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (!isTyping) {
        if (e.key === "?" || ((e.metaKey || e.ctrlKey) && e.key === "/")) {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("aether:open-shortcuts"));
          return;
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
