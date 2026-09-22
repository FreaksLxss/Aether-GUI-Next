import { useEffect, useRef } from "react";
import { useConnectionStore } from "@/state/connectionStore";
import { cue } from "@/lib/sound";

/**
 * Plays a cue when the connection state settles. Audio is owned entirely by
 * cuelume (see `src/lib/sound.ts`) — this hook only decides *when*, so mute and
 * volume apply consistently everywhere.
 */
export function useConnectionSound() {
  const lastState = useRef<string | null>(null);

  useEffect(() => {
    const unsub = useConnectionStore.subscribe((state) => {
      const current = state.status.state;
      const prev = lastState.current;
      lastState.current = current;

      if (current === prev) return;
      // A background tunnel dropping is not worth a sound while the window is
      // hidden — the user is elsewhere and the tray icon already signals it.
      if (typeof document !== "undefined" && document.hidden) return;

      if (current === "Connected") cue("bloom");
      else if (current === "Error") cue("error");
      else if (current === "Reconnecting") cue("loading");
      else if (current === "Idle" && prev !== null) cue("ready");
    });
    return unsub;
  }, []);
}
