import { useConnectionStore } from "@/state/connectionStore";
export function useLocked(): boolean {
  return useConnectionStore((s) => s.status.state !== "Idle" && s.status.state !== "Error");
}
