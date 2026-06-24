import type { ChartRuntimeModelParts } from "./runtimeTypes";

export type ChartWindowRuntimeBoundary = {
  implemented: false;
  parts: ChartRuntimeModelParts;
  firstTimeSec: number | null;
  lastTimeSec: number | null;
  count: number;
};

export function createChartWindowRuntimeBoundary(): ChartWindowRuntimeBoundary {
  return {
    implemented: false,
    parts: {
      candles: [],
      emaOverlays: [],
      auxEmaOverlays: [],
      componentEvents: [],
    },
    firstTimeSec: null,
    lastTimeSec: null,
    count: 0,
  };
}
