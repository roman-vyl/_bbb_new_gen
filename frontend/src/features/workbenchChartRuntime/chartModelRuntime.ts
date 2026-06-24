import { buildChartViewModel, type ChartViewModel } from "@/features/chart/runtime/chartViewModel";

export type ChartModelRuntimeBoundary = {
  implemented: false;
  chartViewModel: ChartViewModel;
};

export function createChartModelRuntimeBoundary(): ChartModelRuntimeBoundary {
  return {
    implemented: false,
    chartViewModel: buildChartViewModel({
      candles: [],
      emaOverlays: [],
      auxEmaOverlays: [],
      displayAuxEmaOverlays: [],
      componentEvents: [],
      htfOverlayStale: false,
      componentEventsStale: false,
      traceDisplayStatus: "empty",
      traceDisplayMissingRange: null,
      viewMode: "empty",
      centerTimeSec: null,
      firstTimeSec: null,
      lastTimeSec: null,
      count: 0,
    }),
  };
}
