import { useEffect, useRef } from "react";
import { useIpChangerStore } from "@/stores/ipChangerStore";
import { cue } from "@/lib/sound";

export function useIpChangerSound() {
  const lastStatus = useRef<string | null>(null);

  useEffect(() => {
    const unsub = useIpChangerStore.subscribe((state) => {
      const current = state.status;
      const prev = lastStatus.current;
      lastStatus.current = current;

      if (current === prev) return;
      if (typeof document !== "undefined" && document.hidden) return;

      if (current === "running") cue("arrival");
      else if (current === "error") cue("error");
    });
    return unsub;
  }, []);
}
