import { useEffect, useRef } from "react";
import { useConnectionStore } from "@/state/connectionStore";
import { cue } from "@/lib/sound";

export function useConnectionSound() {
  const lastState = useRef<string | null>(null);

  useEffect(() => {
    const unsub = useConnectionStore.subscribe((state) => {
      const current = state.status.state;
      const prev = lastState.current;
      lastState.current = current;

      if (current === prev) return;
      if (typeof document !== "undefined" && document.hidden) return;

      if (current === "Connected") cue("bloom");
      else if (current === "Error") cue("error");
      else if (current === "Reconnecting") cue("loading");
      else if (current === "Idle" && prev !== null) cue("ready");
    });
    return unsub;
  }, []);
}
