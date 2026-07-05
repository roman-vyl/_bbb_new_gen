import { beforeEach, describe, expect, it } from "vitest";

import type { ChartBar, RunReport, RunVariant } from "@/api/types";
import { CHART_RENDER_SAFE_ZONE } from "@/features/chart/chartViewWindow";
import { clearMarketResourceCache, mergeCandlesWindowBundle } from "@/features/chart/marketResourceCache";
import { resolveRunMarketView } from "@/features/chart/runMarketView";
import { canEmitTradeFocus } from "@/features/chart/runtime/viewportController";
import {
  evaluateTradeFocusReadiness,
  shouldEmitTradeFocus,
  tradeFocusEmitKey,
} from "@/features/workbenchChartRuntime/phase63TradeFocusBridge";

import {
  createDisplayRenderViewportHarness,
  type DisplayRenderViewportHarness,
} from "./displayRenderViewportHarness";
import { dispatchInteractionCandidate } from "./interactionRuntime";

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

function makeVariant(overrides: Partial<RunVariant> = {}): RunVariant {
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

function makeReport(variant = makeVariant()): RunReport {
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

const FOCUS_WINDOW = {
  fromMs: 1_300_000,
  toMs: 1_900_000,
  toOpenTimeMs: 1_600_000,
};

const COVERAGE_WINDOW = {
  fromMs: 1_000_000,
  toMs: 1_900_000,
  toOpenTimeMs: 1_600_000,
};

function makeCandles(count: number, startTimeSec = 1_300): ChartBar[] {
  return Array.from({ length: count }, (_, index) => ({
    time: startTimeSec + index * 300,
    open: 1,
    high: 1,
    low: 1,
    close: 1,
  }));
}

function resolveView(report = makeReport()): NonNullable<ReturnType<typeof resolveRunMarketView>> {
  return resolveRunMarketView({
    report,
    variant: report.variants[0]!,
    chartTimeframe: "5m",
    reloadToken: 0,
  });
}

function simulateTradeFocusOrchestrator(input: {
  selectedTradeId: number | string | null;
  selectedTradeEntryTimeMs: number | null;
  foundationKey: string | null;
  marketLoadStatus: "idle" | "loading" | "ready" | "error";
  chartView: {
    mode: "empty" | "tail" | "around-trade";
    count: number;
    candles: ChartBar[];
  };
  lastEmitted: ReturnType<typeof tradeFocusEmitKey> | null;
  suppressedByUserPan?: boolean;
}): { emit: boolean; entryTimeSec: number | null } {
  const readiness = evaluateTradeFocusReadiness({
    selectedTradeId: input.selectedTradeId,
    selectedTradeEntryTimeMs: input.selectedTradeEntryTimeMs,
    renderWindowFoundationKey: input.foundationKey,
    marketLoadStatus: input.marketLoadStatus,
    chartView: input.chartView,
  });

  if (
    readiness.status !== "ready" ||
    input.selectedTradeId === null ||
    input.foundationKey === null
  ) {
    return { emit: false, entryTimeSec: null };
  }

  const nextEmit = tradeFocusEmitKey(
    input.selectedTradeId,
    readiness.entryTimeSec,
    input.foundationKey,
  );

  const emit = shouldEmitTradeFocus(readiness, input.lastEmitted, nextEmit, {
    suppressedByUserPan: input.suppressedByUserPan ?? false,
  });

  return { emit, entryTimeSec: emit ? readiness.entryTimeSec : null };
}

describe("tradeFocusDemandLoad", () => {
  beforeEach(() => {
    clearMarketResourceCache();
  });

  it("inside window: readiness ready allows immediate focus emit", () => {
    const candles = makeCandles(200, 1_300);
    const entryTimeMs = (1_300 + 50 * 300) * 1000;
    const result = simulateTradeFocusOrchestrator({
      selectedTradeId: 1,
      selectedTradeEntryTimeMs: entryTimeMs,
      foundationKey: "foundation",
      marketLoadStatus: "ready",
      chartView: { mode: "around-trade", count: candles.length, candles },
      lastEmitted: null,
    });
    expect(result.emit).toBe(true);
    expect(result.entryTimeSec).toBe(Math.floor(entryTimeMs / 1000));
  });

  it("outside window: readiness waiting blocks emit until slice covers trade", () => {
    const candles = makeCandles(200, 1_300);
    const distantEntryMs = (1_300 + 199 * 300) * 1000;

    const before = simulateTradeFocusOrchestrator({
      selectedTradeId: 2,
      selectedTradeEntryTimeMs: distantEntryMs,
      foundationKey: "foundation",
      marketLoadStatus: "ready",
      chartView: { mode: "tail", count: candles.length, candles: makeCandles(50, 1_300) },
      lastEmitted: null,
    });
    expect(before.emit).toBe(false);

    const after = simulateTradeFocusOrchestrator({
      selectedTradeId: 2,
      selectedTradeEntryTimeMs: distantEntryMs,
      foundationKey: "foundation",
      marketLoadStatus: "ready",
      chartView: { mode: "around-trade", count: candles.length, candles },
      lastEmitted: null,
    });
    expect(after.emit).toBe(true);
  });

  it("empty chart view never emits focusTrade", () => {
    const result = simulateTradeFocusOrchestrator({
      selectedTradeId: 1,
      selectedTradeEntryTimeMs: 1_450_000,
      foundationKey: null,
      marketLoadStatus: "loading",
      chartView: { mode: "empty", count: 0, candles: [] },
      lastEmitted: null,
    });
    expect(result.emit).toBe(false);
  });

  it("fast trade navigation dedupes repeated emit for same trade tuple", () => {
    const candles = makeCandles(200, 1_300);
    const entryTimeMs = 1_450_000;
    const emitKey = tradeFocusEmitKey(1, 1_450, "foundation");
    const first = simulateTradeFocusOrchestrator({
      selectedTradeId: 1,
      selectedTradeEntryTimeMs: entryTimeMs,
      foundationKey: "foundation",
      marketLoadStatus: "ready",
      chartView: { mode: "around-trade", count: candles.length, candles },
      lastEmitted: null,
    });
    const second = simulateTradeFocusOrchestrator({
      selectedTradeId: 1,
      selectedTradeEntryTimeMs: entryTimeMs,
      foundationKey: "foundation",
      marketLoadStatus: "ready",
      chartView: { mode: "around-trade", count: candles.length, candles },
      lastEmitted: emitKey,
    });
    expect(first.emit).toBe(true);
    expect(second.emit).toBe(false);
  });

  it("user pan suppression blocks trade focus re-emit until selection changes", () => {
    const candles = makeCandles(200, 1_300);
    const result = simulateTradeFocusOrchestrator({
      selectedTradeId: 1,
      selectedTradeEntryTimeMs: 1_450_000,
      foundationKey: "foundation",
      marketLoadStatus: "ready",
      chartView: { mode: "around-trade", count: candles.length, candles },
      lastEmitted: null,
      suppressedByUserPan: true,
    });
    expect(result.emit).toBe(false);
  });

  it("harness: trade_selected without readiness does not prefetch at edge", () => {
    const view = resolveView();
    const candles = makeCandles(200, 1_300);
    const harness = createDisplayRenderViewportHarness({
      bundle: { candles, ema_overlays: [] },
      foundationKey: "foundation",
      view,
      focusWindow: FOCUS_WINDOW,
      coverageWindow: COVERAGE_WINDOW,
      chartTimeframe: "5m",
      marketIdentity: "id",
    });
    harness.initialize(null);
    harness.dispatchInteraction({ type: "trade_selected", entryTimeSec: 1_500 });

    const result = harness.dispatchInteraction({
      type: "visible_range_changed",
      visible: { from: 0, to: CHART_RENDER_SAFE_ZONE - 1 },
      anchorTimeSec: candles[0]!.time,
    });

    expect(result.panReason).toBeNull();
    expect(
      harness.context.renderController.chartRuntime.renderWindow.getInteractionState(),
    ).toBe("trade_focused");
  });

  it("harness: keyboard prelude still clears trade focus and allows prefetch", () => {
    const view = resolveView();
    const candles = makeCandles(200, 1_300);
    const harness = createDisplayRenderViewportHarness({
      bundle: { candles, ema_overlays: [] },
      foundationKey: "foundation",
      view,
      focusWindow: FOCUS_WINDOW,
      coverageWindow: COVERAGE_WINDOW,
      chartTimeframe: "5m",
      marketIdentity: "id",
    });
    harness.initialize(null);
    harness.dispatchInteraction({ type: "trade_selected", entryTimeSec: 1_500 });
    harness.dispatchInteraction({ type: "keyboard_pan_start", key: "ArrowLeft" });

    expect(canEmitTradeFocus(harness.context.renderController.chartRuntime.viewport.getState())).toBe(
      false,
    );

    const result = dispatchInteractionCandidate(
      harness.context.interactionHarness,
      {
        type: "visible_range_changed",
        visible: { from: 0, to: CHART_RENDER_SAFE_ZONE - 1 },
        anchorTimeSec: candles[0]!.time,
      },
      {
        view,
        coverageWindow: COVERAGE_WINDOW,
        timeframeMs: 300_000,
        chartHeavyIoEnabled: true,
      },
    );
    expect(result.panReason).not.toBeNull();
  });

  it("clear trade selection yields idle readiness", () => {
    expect(
      evaluateTradeFocusReadiness({
        selectedTradeId: null,
        selectedTradeEntryTimeMs: null,
        renderWindowFoundationKey: "foundation",
        marketLoadStatus: "ready",
        chartView: { mode: "tail", count: 10, candles: makeCandles(10) },
      }).status,
    ).toBe("idle");
  });
});
