import { useSyncExternalStore } from "react";
import { bind, play, setEnabled, setVolume, type SoundName } from "cuelume";

/** Device-local sound preferences. Mirrors the shape of `src/lib/theme.ts`. */
export const SOUND_ENABLED_KEY = "aether-sound-enabled";
export const SOUND_VOLUME_KEY = "aether-sound-volume";

const DEFAULT_ENABLED = true;
const DEFAULT_VOLUME = 0.5;

let enabled = DEFAULT_ENABLED;
let volume = DEFAULT_VOLUME;

// Snapshot must be referentially stable or useSyncExternalStore loops forever.
let snapshot = { enabled, volume };
const listeners = new Set<() => void>();

function emit() {
  snapshot = { enabled, volume };
  for (const l of listeners) l();
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getSnapshot() {
  return snapshot;
}

/** Mute or unmute all cuelume playback. Persists to localStorage. */
export function setSoundEnabled(next: boolean) {
  enabled = next;
  setEnabled(next);
  try {
    localStorage.setItem(SOUND_ENABLED_KEY, String(next));
  } catch {
    // Storage unavailable (private mode, quota) — keep the in-memory value.
  }
  emit();
}

/** Set global playback volume (0–1). Persists to localStorage. */
export function setSoundVolume(next: number) {
  const v = clamp01(next);
  volume = v;
  setVolume(v);
  try {
    localStorage.setItem(SOUND_VOLUME_KEY, String(v));
  } catch {
    // Storage unavailable — keep the in-memory value.
  }
  emit();
}

/** Imperative cue. Call sites should use this rather than importing cuelume. */
export function cue(name?: SoundName, options?: { volume?: number }) {
  play(name, options);
}

/** Read stored prefs, apply them, and bind delegated listeners. Call once, pre-render. */
export function initSound() {
  try {
    const e = localStorage.getItem(SOUND_ENABLED_KEY);
    const v = localStorage.getItem(SOUND_VOLUME_KEY);
    if (e !== null) enabled = e === "true";
    if (v !== null && !Number.isNaN(Number(v))) volume = clamp01(Number(v));
  } catch {
    // Defaults stand.
  }
  snapshot = { enabled, volume };
  setEnabled(enabled);
  setVolume(volume);
  // `document`, not `#root`: Radix popovers/dialogs/selects and Sonner toasts
  // render into portals on document.body, outside the React root.
  bind(document);
}

/** Subscribe to sound prefs from React (Settings UI). */
export function useSoundPrefs() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
