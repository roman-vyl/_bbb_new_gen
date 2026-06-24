export type ChartEventsRuntimeBoundary = {
  implemented: false;
  chartEventsEnabled: boolean;
  eventCount: number;
  fallbackReason: string | null;
};

export function createChartEventsRuntimeBoundary(): ChartEventsRuntimeBoundary {
  return {
    implemented: false,
    chartEventsEnabled: false,
    eventCount: 0,
    fallbackReason: null,
  };
}
