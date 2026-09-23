
export type TorStatus =
  | { state: "Stopped" }
  | { state: "Starting" }
  | { state: "Running" }
  | { state: "Stopping" }
  | { state: "Error"; message: string };

export interface AutoRotateConfig {
  enabled: boolean;
  interval_secs: number;
}

export interface TorSocksAddr {
  host: string;
  port: number;
}

export interface TorSourceInfo {
  using_system: boolean;
  bundled_available: boolean;
  system_available: boolean;
  system_path: string | null;
}