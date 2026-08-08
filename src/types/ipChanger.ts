// Mirrors src-tauri/src/ip_changer.rs (serde-tagged `TorStatus`) plus the
// auto-rotate config. `PublicInfo` (the IP/geo shape) lives in
// `./connection.ts` and is shared with the leak-check.

export type TorStatus =
  | { state: "Stopped" }
  | { state: "Starting" }
  | { state: "Running" }
  | { state: "Stopping" }
  | { state: "Error"; message: string };

export interface AutoRotateConfig {
  enabled: boolean;
  /** Interval in seconds between automatic NEWNYM rotations. */
  interval_secs: number;
}

export interface TorSocksAddr {
  host: string;
  port: number;
}