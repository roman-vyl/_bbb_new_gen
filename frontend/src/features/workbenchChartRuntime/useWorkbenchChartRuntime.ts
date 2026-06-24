import { buildChartViewModel } from "@/features/chart/runtime/chartViewModel";

import { createEmptyRuntimeDebugSnapshot } from "./runtimeDebug";
import { resolveMarketBundleRuntime } from "./marketBundleRuntime";
import {
  resolveMarketFetchPlanRuntime,
  toRuntimeMarketFetchPlanDebug,
} from "./marketFetchPlanRuntime";
import { resolveMarketViewRuntime } from "./marketViewRuntime";
import { resolveMarketWindowRuntime } from "./marketWindowRuntime";
import type { ChartRuntimeInput, ChartRuntimeOutput } from "./runtimeTypes";

function noop(): void {
  // Phase 2 skeleton: production wiring is intentionally absent.
}

export function createInitialChartRuntimeOutput(input: ChartRuntimeInput): ChartRuntimeOutput {
  const marketView = resolveMarketViewRuntime(input);
  const marketWindow = resolveMarketWindowRuntime({
    view: marketView.view,
    marketIdentity: marketView.marketIdentity,
    expectedMarketIdentity: marketView.expectedMarketIdentity,
    selectedTradeEntryTimeMs: input.selectedTradeEntryTimeMs,
  });
  const marketFetchPlan =
    marketView.view !== null &&
    marketWindow.focusWindow !== null &&
    marketWindow.coverageWindow !== null
      ? resolveMarketFetchPlanRuntime({
          view: marketView.view,
          focusWindow: marketWindow.focusWindow,
          coverageWindow: marketWindow.coverageWindow,
        })
      : null;
  const marketBundle =
    marketView.view !== null &&
    marketWindow.focusWindow !== null &&
    marketWindow.coverageWindow !== null
      ? resolveMarketBundleRuntime({
          view: marketView.view,
          focusWindow: marketWindow.focusWindow,
          coverageWindow: marketWindow.coverageWindow,
          focusWindowKey: marketWindow.focusWindowKey,
          marketLoadStatus: "idle",
        })
      : null;
  const chartViewModel = buildChartViewModel({
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
  });

  return {
    chartViewModel,
    market: {
      status: "idle",
      error: null,
      candlesSource: "unavailable",
      candlesCount: 0,
      fullCandleRange: null,
    },
    trace: {
      lanesSignalTrace: null,
      lanesSignalTraceStatus: "idle",
      lanesSignalTraceError: null,
    },
    overlays: { htfAuxEmaOverlayStale: false },
    display: { componentEventsStale: false, displayApplyRevision: 0, renderWindowShiftSeq: 0 },
    viewport: {
      command: null,
      commandSeq: 0,
      acknowledge: noop,
      isWindowSwapTransactionCancelled: () => false,
      settleWindowSwapCommit: noop,
    },
    interaction: { dispatch: noop },
    debug: {
      ...createEmptyRuntimeDebugSnapshot({
        runId: input.selectedRunId,
        variantKey: input.selectedVariantKey,
        selectedTradeId: input.selectedTradeId,
        selectedTradeEntryTimeMs: input.selectedTradeEntryTimeMs,
        chartHeavyIoEnabled: input.chartHeavyIoEnabled,
      }),
      marketIdentity: marketView.marketIdentity,
      expectedMarketIdentity: marketView.expectedMarketIdentity,
      focusWindow: marketWindow.focusWindow,
      coverageWindow: marketWindow.coverageWindow,
      marketWindowKeys: {
        focus: marketWindow.focusWindowKey,
        coverage: marketWindow.coverageWindowKey,
      },
      marketWindowResetKey: marketWindow.resetKey,
      marketWindowFocusMode: marketWindow.focusMode,
      marketWindowResetReasons: marketWindow.resetReasons,
      marketFetchPlan: toRuntimeMarketFetchPlanDebug(marketFetchPlan),
      fetchedCandles: marketBundle?.debug.fetchedCandles ?? { range: null, count: 0 },
      cachedCandles: marketBundle?.debug.cachedCandles ?? { range: null, count: 0 },
      displayBundle: marketBundle?.debug.displayBundle ?? {
        range: null,
        count: 0,
        source: null,
      },
    },
  };
}

export function useWorkbenchChartRuntime(input: ChartRuntimeInput): ChartRuntimeOutput {
  return createInitialChartRuntimeOutput(input);
}
