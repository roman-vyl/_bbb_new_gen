import type { RuntimeLoadStatus } from "./runtimeTypes";

export type MarketLoadRuntimeBoundary = {
  implemented: false;
  status: RuntimeLoadStatus;
  error: string | null;
  readyIdentity: string | null;
  candlesRevision: number;
  overlayRevision: number;
};

export function createMarketLoadRuntimeBoundary(): MarketLoadRuntimeBoundary {
  return {
    implemented: false,
    status: "idle",
    error: null,
    readyIdentity: null,
    candlesRevision: 0,
    overlayRevision: 0,
  };
}
