import type { RuntimeMarketWindow } from "./marketWindowRuntime";

export type PanRuntimeBoundary = {
  implemented: false;
  pendingCoverageExpansion: RuntimeMarketWindow | null;
};

export function createPanRuntimeBoundary(): PanRuntimeBoundary {
  return {
    implemented: false,
    pendingCoverageExpansion: null,
  };
}
