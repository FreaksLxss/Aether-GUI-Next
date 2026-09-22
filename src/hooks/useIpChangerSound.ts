import { useEffect, useRef } from "react";
import { useIpChangerStore } from "@/stores/ipChangerStore";
import { cue } from "@/lib/sound";

/**
 * Plays a cue when the Tor engine settles into a new state. Mirrors
 * `useConnectionSound`: cuelume owns the audio, this only decides *when*.
 */
export function useIpChangerSound() {
  const lastStatus = useRef<string | null>(null);

  useEffect(() => {
    const unsub = useIpChangerStore.subscribe((state) => {
      const current = state.status;
      const prev = lastStatus.current;
      lastStatus.current = current;

      if (current === prev) return;
      // Background engine events are not worth a sound while the window is
      // hidden — the panel is not on screen to explain what was heard.
      if (typeof document !== "undefined" && document.hidden) return;

      if (current === "running") cue("arrival");
      else if (current === "error") cue("error");
    });
    return unsub;
  }, []);
}
