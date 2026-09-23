import { useEffect } from "react";
import { useConnectionStore } from "@/state/connectionStore";

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
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
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("aether:toggle-palette"));
        return;
      }
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
