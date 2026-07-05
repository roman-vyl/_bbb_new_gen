import { beforeEach, describe, expect, it } from "vitest";

import type { ChartBar, RunReport, RunVariant } from "@/api/types";
import { CHART_RENDER_SAFE_ZONE, CHART_RENDER_WINDOW_SIZE } from "@/features/chart/chartViewWindow";
import { createChartDataWindowManager } from "@/features/chart/chartDataWindowManager";
import { clearMarketResourceCache, mergeCandlesWindowBundle } from "@/features/chart/marketResourceCache";
import { resolveRunMarketView } from "@/features/chart/runMarketView";
import {
  buildMarketTargetWindowKey,
  marketWindowChunkMs,
  type MarketDisplayWindowMs,
} from "@/features/chart/workbenchMarketLoad";
import { canEmitTradeFocus } from "@/features/chart/runtime/viewportController";

import {
  createDisplayRenderViewportHarness,
  resolveDisplayRenderViewportShadow,
} from "./displayRenderViewportHarness";
import {
  applyRenderWindowForTradeRuntime,
  createRenderWindowRuntimeController,
  initializeRenderWindowRuntime,
  resolveRenderWindowRuntimeSnapshot,
} from "./renderWindowRuntime";
import {
  resolveChartWindowRuntime,
} from "./chartWindowRuntime";
import {
  createInteractionRuntimeHarness,
  dispatchInteractionCandidate,
} from "./interactionRuntime";
import { evaluatePanPrefetchCandidate } from "./panRuntime";
import {
  acknowledgeViewportCommandCandidate,
  createViewportRuntimeState,
  filterViewportCommandCandidate,
  isWindowSwapTransactionCancelledCandidate,
  recordViewportCommandCandidate,
  settleWindowSwapCommitCandidate,
} from "./viewportRuntime";
import { resolveMarketBundleRuntime } from "./marketBundleRuntime";
import { inactiveChartRuntimeOwnerFlags } from "./runtimeDebug";
import { createInitialChartRuntimeOutput } from "./useWorkbenchChartRuntime";
import { createChartRuntimeInput } from "./runtimeInputAdapter";

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

const FOCUS_WINDOW: MarketDisplayWindowMs = {
  fromMs: 1_300_000,
  toMs: 1_900_000,
  toOpenTimeMs: 1_600_000,
};
const COVERAGE_WINDOW: MarketDisplayWindowMs = {
  fromMs: 1_000_000,
  toMs: 1_900_000,
  toOpenTimeMs: 1_600_000,
};

function makeCandles(count: number, startTimeSec = 1_000): ChartBar[] {
  return Array.from({ length: count }, (_, index) => ({
    time: startTimeSec + index * 300,
    open: 1,
    high: 1,
    low: 1,
    close: 1,
  }));
}

function seedFocusCandles(candlesKey: string, times: number[]): void {
  mergeCandlesWindowBundle(candlesKey, {
    candles: times.map((time) => ({ time, open: 1, high: 1, low: 1, close: 1 })),
    coverage: {
      requested_from_ms: FOCUS_WINDOW.fromMs,
      requested_to_ms: FOCUS_WINDOW.toMs,
      actual_from_ms: FOCUS_WINDOW.fromMs,
      actual_to_ms: FOCUS_WINDOW.toMs,
      truncated: false,
    },
  });
}

function seedCoverageCandles(candlesKey: string, times: number[]): void {
  mergeCandlesWindowBundle(candlesKey, {
    candles: times.map((time) => ({ time, open: 1, high: 1, low: 1, close: 1 })),
    coverage: {
      requested_from_ms: COVERAGE_WINDOW.fromMs,
      requested_to_ms: COVERAGE_WINDOW.toMs,
      actual_from_ms: COVERAGE_WINDOW.fromMs,
      actual_to_ms: COVERAGE_WINDOW.toMs,
      truncated: false,
    },
  });
}

function resolveView(report = makeReport()): NonNullable<ReturnType<typeof resolveRunMarketView>> {
  return resolveRunMarketView({
    report,
    variant: report.variants[0]!,
    chartTimeframe: "5m",
    reloadToken: 0,
  });
}

describe("Phase 4 display/render/viewport parity", () => {
  beforeEach(() => {
    clearMarketResourceCache();
  });

  it("tail init render window matches legacy manager bounds", () => {
    const report = makeReport();
    const view = resolveView(report);
    const candles = makeCandles(120);
    seedFocusCandles(view.candlesKey, candles.map((c) => c.time));
    seedCoverageCandles(view.candlesKey, candles.map((c) => c.time));
    const focusKey = buildMarketTargetWindowKey("identity", FOCUS_WINDOW);
    const bundleResult = resolveMarketBundleRuntime({
      view,
      focusWindow: FOCUS_WINDOW,
      coverageWindow: COVERAGE_WINDOW,
      focusWindowKey: focusKey,
      marketLoadStatus: "ready",
    });
    expect(bundleResult.bundle).not.toBeNull();

    const legacyManager = createChartDataWindowManager();
    legacyManager.reset(bundleResult.bundle!.candles.length);
    legacyManager.buildTailWindow();

    const renderController = createRenderWindowRuntimeController();
    initializeRenderWindowRuntime(renderController, {
      foundationKey: `${focusKey}:${candles.length}`,
      marketLoadStatus: "ready",
      bundleCandles: bundleResult.bundle!.candles,
      selectedTradeEntryTimeMs: null,
    });

    const snapshot = resolveRenderWindowRuntimeSnapshot(
      renderController,
      bundleResult.bundle!.candles,
    );
    expect(snapshot.implemented).toBe(true);
    expect(snapshot.bounds).toEqual(legacyManager.getWindowIndices());
    const bundleCandles = bundleResult.bundle!.candles;
    expect(snapshot.firstTimeSec).toBe(bundleCandles[0]!.time);
    expect(snapshot.lastTimeSec).toBe(bundleCandles[bundleCandles.length - 1]!.time);
  });

  it("trade-centered init matches legacy around-trade window", () => {
    const candles = makeCandles(200);
    const entryTimeMs = candles[100]!.time * 1000;

    const legacyManager = createChartDataWindowManager();
    legacyManager.reset(candles.length);
    legacyManager.buildWindowAroundIndex(100);

    const renderController = createRenderWindowRuntimeController();
    initializeRenderWindowRuntime(renderController, {
      foundationKey: "foundation",
      marketLoadStatus: "ready",
      bundleCandles: candles,
      selectedTradeEntryTimeMs: entryTimeMs,
    });

    const snapshot = resolveRenderWindowRuntimeSnapshot(renderController, candles);
    expect(snapshot.bounds).toEqual(legacyManager.getWindowIndices());
  });

  it("chart window slice has no empty gaps on valid market bundle", () => {
    const report = makeReport();
    const view = resolveView(report);
    const candles = makeCandles(80);
    seedFocusCandles(view.candlesKey, candles.map((c) => c.time));
    seedCoverageCandles(view.candlesKey, candles.map((c) => c.time));
    const bundleResult = resolveMarketBundleRuntime({
      view,
      focusWindow: FOCUS_WINDOW,
      coverageWindow: COVERAGE_WINDOW,
      focusWindowKey: "focus",
      marketLoadStatus: "ready",
    });
    expect(bundleResult.bundle).not.toBeNull();

    const harness = createDisplayRenderViewportHarness({
      bundle: bundleResult.bundle!,
      foundationKey: "foundation",
      view,
      focusWindow: FOCUS_WINDOW,
      coverageWindow: COVERAGE_WINDOW,
      chartTimeframe: "5m",
      marketIdentity: "market-v2",
    });
    const snapshot = harness.initialize(null);

    expect(snapshot.chartWindow.implemented).toBe(true);
    expect(snapshot.chartWindow.count).toBeGreaterThan(0);
    expect(snapshot.chartWindow.parts.candles.length).toBe(snapshot.chartWindow.count);
    expect(snapshot.renderWindow.firstTimeSec).toBe(snapshot.chartWindow.firstTimeSec);
    expect(snapshot.renderWindow.lastTimeSec).toBe(snapshot.chartWindow.lastTimeSec);
  });

  it("chart window runtime matches legacy slice for tail window", () => {
    const candles = makeCandles(150);
    const bundle = {
      candles,
      ema_overlays: [],
    };
    const manager = createChartDataWindowManager();
    manager.reset(candles.length);
    manager.buildTailWindow();

    const runtimeSlice = resolveChartWindowRuntime({
      bundle,
      marketLoadStatus: "ready",
      manager,
      auxEmaOverlays: [],
      marketIdentity: "id-a",
    });

    const legacyManager = createChartDataWindowManager();
    legacyManager.reset(candles.length);
    legacyManager.buildTailWindow();
    const legacySlice = resolveChartWindowRuntime({
      bundle,
      marketLoadStatus: "ready",
      manager: legacyManager,
      auxEmaOverlays: [],
      marketIdentity: "id-a",
    });

    expect(runtimeSlice.count).toBe(legacySlice.count);
    expect(runtimeSlice.firstTimeSec).toBe(legacySlice.firstTimeSec);
    expect(runtimeSlice.lastTimeSec).toBe(legacySlice.lastTimeSec);
    expect(runtimeSlice.parts.candles.map((c) => c.time)).toEqual(
      legacySlice.parts.candles.map((c) => c.time),
    );
  });

  it("render-window shift updates shift seq and emits restore viewport candidate", () => {
    const candles = makeCandles(Math.max(CHART_RENDER_WINDOW_SIZE + 100, 60_000));
    const bundle = { candles, ema_overlays: [] as never[] };
    const harness = createDisplayRenderViewportHarness({
      bundle,
      foundationKey: "foundation",
      view: resolveView(),
      focusWindow: FOCUS_WINDOW,
      coverageWindow: COVERAGE_WINDOW,
      chartTimeframe: "5m",
      marketIdentity: "id",
    });
    harness.initialize(null);
    const manager = harness.context.renderController.chartRuntime.renderWindow.getManager();
    const windowLen = manager.getWindowLength();

    harness.dispatchInteraction({ type: "pointerdown" });
    harness.context.renderController.chartRuntime.renderWindow.recordBoundaryIntent(
      { from: 0, to: windowLen - 1 },
      candles[manager.getWindowIndices().windowStartIndex + 5]!.time,
    );
    const dispatch = harness.dispatchInteraction({ type: "pointerup" });

    expect(harness.context.renderController.shiftSeq).toBeGreaterThan(0);
    expect(dispatch.renderWindowCommit).toBeNull();
    expect(harness.context.viewportState.lastCommand?.type).toBe("restoreAfterWindowSwap");
  });

  it("viewport focusTrade candidate respects canEmitTradeFocus", () => {
    const state = createViewportRuntimeState();
    const cmd = recordViewportCommandCandidate(state, {
      type: "focusTrade",
      entryTimeSec: 1_700_000,
    });
    expect(cmd).toBeNull();

    state.controller.dispatch({ type: "trade_selected", entryTimeSec: 1_700_000 });
    expect(canEmitTradeFocus(state.controller.getState())).toBe(true);
    const focused = recordViewportCommandCandidate(state, {
      type: "focusTrade",
      entryTimeSec: 1_700_000,
    });
    expect(focused).toEqual({ type: "focusTrade", entryTimeSec: 1_700_000 });
    expect(state.commandSeq).toBe(1);
  });

  it("viewport acknowledge/cancel/settle contract is inert for production", () => {
    const state = createViewportRuntimeState();
    state.controller.dispatch({ type: "trade_selected", entryTimeSec: 1_100 });
    recordViewportCommandCandidate(state, { type: "focusTrade", entryTimeSec: 1_100 });

    acknowledgeViewportCommandCandidate(state);
    expect(state.lastCommand).toBeNull();

    state.windowSwapTransactionId = 3;
    cancelViewportCommandsOnPointerDown(state);
    expect(isWindowSwapTransactionCancelledCandidate(state, 3)).toBe(true);

    let settled = false;
    settleWindowSwapCommitCandidate(state, 1, 4, () => {
      settled = true;
    });
    expect(settled).toBe(true);
    settleWindowSwapCommitCandidate(state, 1, 2, () => {
      settled = false;
    });
    expect(settled).toBe(true);
  });

  it("programmatic viewport does not produce pan expansion candidate", () => {
    const view = resolveView();
    const decision = evaluatePanPrefetchCandidate({
      view,
      coverageWindow: COVERAGE_WINDOW,
      visibleFromSec: 1_000,
      visibleToSec: 1_500,
      timeframeMs: 300_000,
      chartHeavyIoEnabled: true,
      interactionState: "idle_user_view",
      programmaticViewportActive: true,
    });
    expect(decision.suppressedProgrammatic).toBe(true);
    expect(decision.expansion).toBeNull();
    expect(decision.reason).toBe("suppressed_programmatic");
  });

  it("user pan near boundary produces pan expansion candidate", () => {
    const report = makeReport();
    const view = resolveView(report);
    const timeframeMs = 300_000;
    const chunkMs = marketWindowChunkMs(timeframeMs);
    const targetWindow: MarketDisplayWindowMs = {
      fromMs: report.data_range.from_open_time_ms + chunkMs,
      toMs: report.data_range.from_open_time_ms + chunkMs * 2,
      toOpenTimeMs: report.data_range.from_open_time_ms + chunkMs * 2 - timeframeMs,
    };
    const decision = evaluatePanPrefetchCandidate({
      view,
      coverageWindow: targetWindow,
      visibleFromSec: targetWindow.fromMs / 1000,
      visibleToSec: (targetWindow.fromMs + timeframeMs) / 1000,
      timeframeMs,
      chartHeavyIoEnabled: true,
      interactionState: "user_panning",
    });

    expect(decision.expansion).not.toBeNull();
    expect(decision.reason).toBe("near_left_edge");
    expect(decision.suppressedProgrammatic).toBe(false);
  });

  it("dispatch interaction samples visible range for pan prefetch during user pan", () => {
    const view = resolveView();
    const candles = makeCandles(200, 1_300);
    const renderController = createRenderWindowRuntimeController();
    initializeRenderWindowRuntime(renderController, {
      foundationKey: "foundation",
      marketLoadStatus: "ready",
      bundleCandles: candles,
      selectedTradeEntryTimeMs: null,
    });
    const interactionHarness = createInteractionRuntimeHarness({
      renderController,
      bundleCandles: candles,
    });

    interactionHarness.renderController.chartRuntime.dispatchInteraction({ type: "pointerdown" });
    const result = dispatchInteractionCandidate(
      interactionHarness,
      {
        type: "visible_range_changed",
        visible: { from: 0, to: CHART_RENDER_SAFE_ZONE - 1 },
        anchorTimeSec: candles[0]!.time,
      },
      {
        view,
        coverageWindow: FOCUS_WINDOW,
        timeframeMs: 300_000,
        chartHeavyIoEnabled: true,
      },
    );

    expect(result.panReason).not.toBeNull();
    expect(result.suppressedProgrammatic).toBe(false);
  });

  it("keyboard prelude plus range change triggers prefetch", () => {
    const view = resolveView();
    const candles = makeCandles(200, 1_300);
    const renderController = createRenderWindowRuntimeController();
    initializeRenderWindowRuntime(renderController, {
      foundationKey: "foundation",
      marketLoadStatus: "ready",
      bundleCandles: candles,
      selectedTradeEntryTimeMs: null,
    });
    const interactionHarness = createInteractionRuntimeHarness({
      renderController,
      bundleCandles: candles,
    });

    dispatchInteractionCandidate(
      interactionHarness,
      { type: "keyboard_pan_start", key: "ArrowLeft" },
      {
        view,
        coverageWindow: FOCUS_WINDOW,
        timeframeMs: 300_000,
        chartHeavyIoEnabled: true,
      },
    );
    const result = dispatchInteractionCandidate(
      interactionHarness,
      {
        type: "visible_range_changed",
        visible: { from: 0, to: CHART_RENDER_SAFE_ZONE - 1 },
        anchorTimeSec: candles[0]!.time,
      },
      {
        view,
        coverageWindow: FOCUS_WINDOW,
        timeframeMs: 300_000,
        chartHeavyIoEnabled: true,
      },
    );

    expect(result.panReason).not.toBeNull();
    expect(result.suppressedProgrammatic).toBe(false);
  });

  it("range change alone does not trigger prefetch from idle", () => {
    const view = resolveView();
    const candles = makeCandles(200, 1_300);
    const renderController = createRenderWindowRuntimeController();
    initializeRenderWindowRuntime(renderController, {
      foundationKey: "foundation",
      marketLoadStatus: "ready",
      bundleCandles: candles,
      selectedTradeEntryTimeMs: null,
    });
    const interactionHarness = createInteractionRuntimeHarness({
      renderController,
      bundleCandles: candles,
    });

    const result = dispatchInteractionCandidate(
      interactionHarness,
      {
        type: "visible_range_changed",
        visible: { from: 0, to: CHART_RENDER_SAFE_ZONE - 1 },
        anchorTimeSec: candles[0]!.time,
      },
      {
        view,
        coverageWindow: FOCUS_WINDOW,
        timeframeMs: 300_000,
        chartHeavyIoEnabled: true,
      },
    );

    expect(result.panReason).toBeNull();
  });

  it("keyboard prelude cancels stale viewport command like pointerdown", () => {
    const renderController = createRenderWindowRuntimeController();
    const harness = createInteractionRuntimeHarness({
      renderController,
      bundleCandles: makeCandles(10),
    });
    harness.viewportState.lastCommand = { type: "focusTrade", entryTimeSec: 1_100 };

    dispatchInteractionCandidate(
      harness,
      { type: "keyboard_pan_start", key: "ArrowLeft" },
      {
        view: null,
        coverageWindow: null,
        timeframeMs: 300_000,
        chartHeavyIoEnabled: true,
      },
    );

    expect(harness.viewportState.lastCommand).toBeNull();
  });

  it("trade focus without force rebuild skips when trade stays in safe zone", () => {
    const candles = makeCandles(200);
    const renderController = createRenderWindowRuntimeController();
    initializeRenderWindowRuntime(renderController, {
      foundationKey: "foundation",
      marketLoadStatus: "ready",
      bundleCandles: candles,
      selectedTradeEntryTimeMs: candles[100]!.time * 1000,
    });
    const before = resolveRenderWindowRuntimeSnapshot(renderController, candles);

    const rebuilt = applyRenderWindowForTradeRuntime(renderController, {
      bundleCandles: candles,
      selectedTradeEntryTimeMs: candles[100]!.time * 1000,
      forceRebuild: false,
    });
    expect(rebuilt).toBe(false);
    const after = resolveRenderWindowRuntimeSnapshot(renderController, candles);
    expect(after.bounds).toEqual(before.bounds);
  });

  it("shadow resolver stays inactive on production-mounted idle market status", () => {
    const input = createChartRuntimeInput({
      reportLoadStatus: "ready",
      report: makeReport(),
      selectedRunId: "run-a",
      reloadToken: 0,
      selectedVariantKey: "exp_a",
      selectedVariant: makeVariant(),
      selectedTradeId: null,
      selectedTradeEntryTimeMs: null,
      chartTradeFocusWarning: null,
      selectedBarTimeSec: null,
      chartTimeframe: "5m",
      chartHeavyIoEnabled: true,
      contextOverlayRef: null,
      effectiveContextOverlayRef: null,
      contextOverlayRefOptions: [],
      chartFocusIntent: { type: "none" },
    });
    const output = createInitialChartRuntimeOutput(input);
    expect(output.market.status).toBe("idle");
    expect(output.debug.renderWindow.startIndex).toBeNull();
    expect(output.debug.chartModel.count).toBe(0);
    expect(output.debug.ownerFlags).toEqual(inactiveChartRuntimeOwnerFlags);
    expect(output.viewport.command).toBeNull();
  });

  it("resolveDisplayRenderViewportShadow produces non-empty chart window when bundle ready", () => {
    const candles = makeCandles(100);
    const bundle = { candles, ema_overlays: [] as never[] };
    const shadow = resolveDisplayRenderViewportShadow({
      bundle,
      foundationKey: "foundation",
      marketLoadStatus: "ready",
      selectedTradeEntryTimeMs: null,
      marketIdentity: "id",
    });
    expect(shadow.renderWindow.implemented).toBe(true);
    expect(shadow.chartWindow.count).toBeGreaterThan(0);
    expect(shadow.chartWindow.parts.candles.length).toBeGreaterThan(0);
  });

  it("filterViewportCommandCandidate blocks focusTrade without active intent", () => {
    const state = createViewportRuntimeState();
    const filtered = filterViewportCommandCandidate(state, {
      type: "focusTrade",
      entryTimeSec: 999,
    });
    expect(filtered).toBeNull();
  });
});

function cancelViewportCommandsOnPointerDown(
  state: ReturnType<typeof createViewportRuntimeState>,
): void {
  state.windowSwapCancelledThroughId = state.windowSwapTransactionId;
  state.lastCommand = null;
}
