export interface EngineInfo {
  version: string | null;
  expected_version: string;
  path: string | null;
  source: string | null;
  compatible: boolean;
  transports_available: boolean;
  problem: string | null;
}
