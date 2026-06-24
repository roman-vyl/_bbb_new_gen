import type { ChartRuntimeMarketOutput } from "./runtimeTypes";

export type MarketBundleRuntimeBoundary = {
  implemented: false;
  foundationKey: string | null;
  market: ChartRuntimeMarketOutput;
};

export function createMarketBundleRuntimeBoundary(): MarketBundleRuntimeBoundary {
  return {
    implemented: false,
    foundationKey: null,
    market: {
      status: "idle",
      error: null,
      candlesSource: "unavailable",
      candlesCount: 0,
      fullCandleRange: null,
    },
  };
}
