import type { ChartBar, RunReport, RunVariant } from "@/api/types";
import { buildChartViewModel } from "@/features/chart/runtime/chartViewModel";

import type { ChartRuntimeCompatibilityInput, ChartRuntimeOutput } from "./runtimeTypes";
import { chartRuntimeCutoverConfig } from "./chartRuntimeCutoverConfig";

const EMPTY_METRICS = {
  long: { trades: 0, pnl: 0, return_pct: 0, profit_factor: null, win_rate: null },
  short: { trades: 0, pnl: 0, return_pct: 0, profit_factor: null, win_rate: null },
  total: {
    trades: 0,
    pnl: 0,
    return_pct: 0,
    profit_factor: null,
    win_rate: null,
    sharpe: 0,
    max_drawdown: 0,
  },
  open_trades: { long: 0, short: 0, total: 0 },
};

export function makePhase6Variant(overrides: Partial<RunVariant> = {}): RunVariant {
  return {
    variant: "exp_a",
    config_id: "cfg_a",
    symbol: "BTCUSDT",
    timeframe: "5m",
    strategy_spec: {
      anchor_stack: {
        fast: { period: 200 },
        anchor: { period: 500 },
        slow: { period: 1000 },
      },
    },
    metrics: EMPTY_METRICS,
    component_counters: [],
    trade_records: [],
    ...overrides,
  };
}

export function makePhase6Report(variant = makePhase6Variant()): RunReport {
  return {
    run_id: "run-a",
    created_at: "2026-01-01T00:00:00Z",
    report_schema_version: 1,
    family: "ema_pullback",
    symbol: "BTCUSDT",
    timeframe: "5m",
    candles: 100,
    data_range: { from_open_time_ms: 1_000_000, to_open_time_ms: 1_900_000 },
    variants_count: 1,
    variants: [variant],
  };
}

export function makePhase6Candles(count: number, startTimeSec = 1_000): ChartBar[] {
  return Array.from({ length: count }, (_, index) => ({
    time: startTimeSec + index * 300,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
  }));
}

export function makePhase6CompatibilityInput(
  overrides: Partial<ChartRuntimeCompatibilityInput> = {},
): ChartRuntimeCompatibilityInput {
  return {
    selectedVariant: makePhase6Variant(),
    selectedTradeId: 1,
    selectedBarTimeSec: 1_000,
    ...overrides,
  };
}

export function makeSampleChartRuntimeOutput(
  overrides: Partial<ChartRuntimeOutput> = {},
): ChartRuntimeOutput {
  const candles = makePhase6Candles(40);
  const chartViewModel = buildChartViewModel({
    candles,
    emaOverlays: [],
    auxEmaOverlays: [],
    displayAuxEmaOverlays: [],
    componentEvents: [],
    htfOverlayStale: false,
    componentEventsStale: false,
    traceDisplayStatus: "current",
    traceDisplayMissingRange: null,
    viewMode: "around-trade",
    centerTimeSec: 1_200,
    firstTimeSec: candles[0]!.time,
    lastTimeSec: candles[candles.length - 1]!.time,
    count: candles.length,
  });

  const base: ChartRuntimeOutput = {
    chartViewModel,
    market: {
      status: "ready",
      error: null,
      candlesSource: "market",
      candlesCount: 200,
      fullCandleRange: { min: 1_000_000, max: 1_900_000 },
    },
    trace: {
      lanesSignalTrace: null,
      lanesSignalTraceStatus: "idle",
      lanesSignalTraceError: null,
    },
    overlays: { htfAuxEmaOverlayStale: false },
    display: {
      componentEventsStale: false,
      displayApplyRevision: 1,
      renderWindowShiftSeq: 0,
    },
    viewport: {
      command: { type: "focusTrade", entryTimeSec: 1_200 },
      commandSeq: 1,
      acknowledge: () => {},
      isWindowSwapTransactionCancelled: () => false,
      settleWindowSwapCommit: () => {},
    },
    interaction: {
      dispatch: () => {},
    },
    debug: {
      runId: "run-a",
      variantKey: "exp_a",
      selectedTradeId: 1,
      selectedTradeEntryTimeMs: 1_200_000,
      chartHeavyIoEnabled: true,
      marketIdentity: "identity-a",
      expectedMarketIdentity: "identity-a",
      focusWindow: { fromMs: 1_300_000, toMs: 1_900_000, toOpenTimeMs: 1_600_000 },
      coverageWindow: { fromMs: 1_000_000, toMs: 1_900_000, toOpenTimeMs: 1_600_000 },
      marketWindowKeys: { focus: "focus-key", coverage: "coverage-key" },
      marketWindowResetKey: "reset-key",
      marketWindowFocusMode: "around-trade",
      marketWindowResetReasons: ["initial_focus"],
      marketWindowComparison: null,
      marketFetchPlan: null,
      fetchedCandles: { range: { min: 1_300_000, max: 1_600_000 }, count: 40 },
      cachedCandles: { range: { min: 1_000_000, max: 1_900_000 }, count: 200 },
      displayBundle: { range: { min: 1_000_000, max: 1_900_000 }, count: 200, source: "coverage" },
      renderWindow: { startIndex: 0, endIndex: 40, firstTimeSec: candles[0]!.time, lastTimeSec: candles[candles.length - 1]!.time },
      chartModel: {
        firstTimeSec: candles[0]!.time,
        lastTimeSec: candles[candles.length - 1]!.time,
        count: candles.length,
        seriesKey: chartViewModel.seriesKey,
      },
      viewportCommand: { type: "focusTrade", entryTimeSec: 1_200 },
      traceRequests: { displayKey: "display-key", denseKey: "dense-key", status: "idle" },
      counts: { componentEvents: 0, auxOverlays: 0, htfOverlays: 0, markers: null },
      ownerFlags: {
        marketWindows: false,
        marketCacheWrites: false,
        renderWindow: false,
        viewportCommands: false,
        traceDisplayCache: false,
        denseLanesTrace: false,
        auxOverlays: false,
        finalChartModel: false,
      },
      cutoverPhase: chartRuntimeCutoverConfig.cutoverPhase,
      domainOwners: { ...chartRuntimeCutoverConfig.domainOwners },
    },
  };

  return { ...base, ...overrides };
}

/** Runtime-owned fields that Phase 6.3 adapter cutover must derive from one ChartRuntimeOutput. */
export const RUNTIME_OWNED_WORKBENCH_CHART_FIELD_KEYS = [
  "marketLoadStatus",
  "marketError",
  "chartViewModel",
  "htfAuxEmaOverlayStale",
  "componentEventsStale",
  "displayApplyRevision",
  "renderWindowShiftSeq",
  "marketCandlesCount",
  "fullCandleRange",
  "candlesSource",
  "lanesSignalTrace",
  "lanesSignalTraceStatus",
  "lanesSignalTraceError",
  "dispatchChartInteraction",
  "chartViewportCommand",
  "chartViewportCommandSeq",
  "acknowledgeChartViewportCommand",
  "isWindowSwapTransactionCancelled",
  "settleWindowSwapCommit",
] as const;

/** Provider-owned fields that must remain outside runtime v2 lifecycle. */
export const PROVIDER_OWNED_WORKBENCH_CHART_FIELD_KEYS = [
  "selectedVariant",
  "selectedTradeId",
  "selectTrade",
  "selectedBarTimeSec",
  "selectBar",
  "contextOverlayRef",
  "setContextOverlayRef",
  "effectiveContextOverlayRef",
  "contextOverlayRefOptions",
  "chartShowEntryBlockMarkers",
  "setChartShowEntryBlockMarkers",
  "chartShowExitSignalMarkers",
  "setChartShowExitSignalMarkers",
  "chartShowSetupMarkers",
  "setChartShowSetupMarkers",
  "chartShowTradeManagementPhaseMarkers",
  "setChartShowTradeManagementPhaseMarkers",
  "chartShowTradeManagementExitMarkers",
  "setChartShowTradeManagementExitMarkers",
  "reportTimeframe",
  "timeframeMismatch",
  "chartTimeframe",
  "chartTradeFocusWarning",
] as const;
