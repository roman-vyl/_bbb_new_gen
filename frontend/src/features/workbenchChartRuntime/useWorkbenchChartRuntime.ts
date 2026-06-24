import { buildChartViewModel } from "@/features/chart/runtime/chartViewModel";

import { createEmptyRuntimeDebugSnapshot } from "./runtimeDebug";
import type { ChartRuntimeInput, ChartRuntimeOutput } from "./runtimeTypes";

function noop(): void {
  // Phase 2 skeleton: production wiring is intentionally absent.
}

export function createInitialChartRuntimeOutput(input: ChartRuntimeInput): ChartRuntimeOutput {
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
    debug: createEmptyRuntimeDebugSnapshot({
      runId: input.selectedRunId,
      variantKey: input.selectedVariantKey,
      selectedTradeId: input.selectedTradeId,
      selectedTradeEntryTimeMs: input.selectedTradeEntryTimeMs,
      chartHeavyIoEnabled: input.chartHeavyIoEnabled,
    }),
  };
}

export function useWorkbenchChartRuntime(input: ChartRuntimeInput): ChartRuntimeOutput {
  return createInitialChartRuntimeOutput(input);
}
