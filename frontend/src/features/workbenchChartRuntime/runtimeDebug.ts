import type {
  ChartRuntimeDebugSnapshot,
  ChartRuntimeOwnerFlags,
  RuntimeMarketWindowComparison,
  RuntimeMarketWindowSnapshot,
  RuntimeTraceStatus,
} from "./runtimeTypes";

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
    expectedMarketIdentity: null,
    focusWindow: null,
    coverageWindow: null,
    marketWindowKeys: { focus: null, coverage: null },
    marketWindowResetKey: null,
    marketWindowFocusMode: null,
    marketWindowResetReasons: [],
    marketWindowComparison: null,
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

function windowEquals(
  left: RuntimeMarketWindowSnapshot["focusWindow"],
  right: RuntimeMarketWindowSnapshot["focusWindow"],
): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return (
    left.fromMs === right.fromMs &&
    left.toMs === right.toMs &&
    left.toOpenTimeMs === right.toOpenTimeMs
  );
}

function arrayEquals(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function compareMarketWindowSnapshots(
  oldSnapshot: RuntimeMarketWindowSnapshot,
  newSnapshot: RuntimeMarketWindowSnapshot,
): RuntimeMarketWindowComparison {
  const differences: string[] = [];
  if (oldSnapshot.marketIdentity !== newSnapshot.marketIdentity) {
    differences.push("marketIdentity");
  }
  if (oldSnapshot.expectedMarketIdentity !== newSnapshot.expectedMarketIdentity) {
    differences.push("expectedMarketIdentity");
  }
  if (oldSnapshot.selectedTradeEntryTimeMs !== newSnapshot.selectedTradeEntryTimeMs) {
    differences.push("selectedTradeEntryTimeMs");
  }
  if (!windowEquals(oldSnapshot.focusWindow, newSnapshot.focusWindow)) {
    differences.push("focusWindow");
  }
  if (!windowEquals(oldSnapshot.coverageWindow, newSnapshot.coverageWindow)) {
    differences.push("coverageWindow");
  }
  if (oldSnapshot.focusWindowKey !== newSnapshot.focusWindowKey) {
    differences.push("focusWindowKey");
  }
  if (oldSnapshot.coverageWindowKey !== newSnapshot.coverageWindowKey) {
    differences.push("coverageWindowKey");
  }
  if (oldSnapshot.resetKey !== newSnapshot.resetKey) {
    differences.push("resetKey");
  }
  if (oldSnapshot.focusMode !== newSnapshot.focusMode) {
    differences.push("focusMode");
  }
  if (!arrayEquals(oldSnapshot.resetReasons, newSnapshot.resetReasons)) {
    differences.push("resetReasons");
  }

  return {
    matches: differences.length === 0,
    differences,
    oldSnapshot,
    newSnapshot,
  };
}
