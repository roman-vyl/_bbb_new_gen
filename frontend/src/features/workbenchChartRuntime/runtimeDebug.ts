import type { ChartRuntimeDebugSnapshot, ChartRuntimeOwnerFlags, RuntimeTraceStatus } from "./runtimeTypes";

export const inactiveChartRuntimeOwnerFlags: ChartRuntimeOwnerFlags = {
  marketWindows: false,
  marketCacheWrites: false,
  renderWindow: false,
  viewportCommands: false,
  traceDisplayCache: false,
  denseLanesTrace: false,
  auxOverlays: false,
  finalChartModel: false,
};

export function createEmptyRuntimeDebugSnapshot(params: {
  runId: string | null;
  variantKey: string;
  selectedTradeId: number | string | null;
  selectedTradeEntryTimeMs: number | null;
  chartHeavyIoEnabled: boolean;
  traceStatus?: RuntimeTraceStatus;
}): ChartRuntimeDebugSnapshot {
  const emptyRangeCount = { range: null, count: 0 };

  return {
    runId: params.runId,
    variantKey: params.variantKey,
    selectedTradeId: params.selectedTradeId,
    selectedTradeEntryTimeMs: params.selectedTradeEntryTimeMs,
    chartHeavyIoEnabled: params.chartHeavyIoEnabled,
    marketIdentity: null,
    focusWindow: null,
    coverageWindow: null,
    fetchedCandles: emptyRangeCount,
    cachedCandles: emptyRangeCount,
    displayBundle: { ...emptyRangeCount, source: null },
    renderWindow: { startIndex: null, endIndex: null, firstTimeSec: null, lastTimeSec: null },
    chartModel: { firstTimeSec: null, lastTimeSec: null, count: 0, seriesKey: null },
    viewportCommand: null,
    traceRequests: { displayKey: null, denseKey: null, status: params.traceStatus ?? "idle" },
    counts: { componentEvents: 0, auxOverlays: 0, htfOverlays: 0, markers: null },
    ownerFlags: inactiveChartRuntimeOwnerFlags,
  };
}
