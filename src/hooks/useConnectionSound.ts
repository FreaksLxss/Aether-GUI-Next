import { useEffect, useRef } from "react";
import { useConnectionStore } from "@/state/connectionStore";

/** Plays a short audio cue when the connection state changes to Connected
 *  or Error. Uses the Web Audio API — no external files needed. */
export function useConnectionSound() {
  const lastState = useRef<string | null>(null);

  useEffect(() => {
    const unsub = useConnectionStore.subscribe((state) => {
      const current = state.status.state;
      const prev = lastState.current;
      lastState.current = current;

      if (current === prev) return;

      if (current === "Connected") {
        playTone(880, 0.12, "sine", 0.15);
        setTimeout(() => playTone(1100, 0.1, "sine", 0.12), 80);
      } else if (current === "Error") {
        playTone(300, 0.2, "square", 0.08);
        setTimeout(() => playTone(220, 0.25, "square", 0.06), 150);
      }
    });
    return unsub;
  }, []);
}

function playTone(
  freq: number,
  duration: number,
  type: OscillatorType,
  volume: number,
) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = volume;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    // AudioContext not available — silently ignore
  }
}
