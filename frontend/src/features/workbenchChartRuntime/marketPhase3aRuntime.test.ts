import { describe, expect, it } from "vitest";

import type { RunReport, RunVariant } from "@/api/types";
import { buildRunMarketViewIdentity, resolveRunMarketView } from "@/features/chart/runMarketView";
import { CHART_RENDER_WINDOW_SIZE } from "@/features/chart/chartViewWindow";
import {
  buildMarketTargetWindowKey,
  resolveMarketTargetWindow,
} from "@/features/chart/workbenchMarketLoad";

import { createChartRuntimeInput } from "./runtimeInputAdapter";
import { compareMarketWindowSnapshots } from "./runtimeDebug";
import { resolveMarketViewRuntime } from "./marketViewRuntime";
import {
  resolveMarketWindowRuntime,
  toMarketWindowRuntimeState,
  type RuntimeMarketWindow,
} from "./marketWindowRuntime";
import type { ChartRuntimeInput, RuntimeMarketWindowSnapshot } from "./runtimeTypes";
import { createInitialChartRuntimeOutput } from "./useWorkbenchChartRuntime";

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

const TIMEFRAME_MS = 300_000;
const TARGET_SPAN_MS = CHART_RENDER_WINDOW_SIZE * TIMEFRAME_MS;

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
    candles: 150_000,
    data_range: { from_open_time_ms: 0, to_open_time_ms: TARGET_SPAN_MS * 3 },
    variants_count: 1,
    variants: [variant],
  };
}

function makeInput(overrides: Partial<ChartRuntimeInput> = {}): ChartRuntimeInput {
  const selectedVariant = overrides.selectedVariant ?? makeVariant();
  const report = overrides.report ?? makeReport(selectedVariant);
  return createChartRuntimeInput({
    reportLoadStatus: "ready",
    report,
    selectedRunId: report.run_id,
    reloadToken: 2,
    selectedVariantKey: selectedVariant.variant,
    selectedVariant,
    selectedTradeId: null,
    selectedTradeEntryTimeMs: null,
    chartTradeFocusWarning: null,
    selectedBarTimeSec: null,
    chartTimeframe: "5m",
    chartHeavyIoEnabled: true,
    contextOverlayRef: null,
    effectiveContextOverlayRef: null,
    contextOverlayRefOptions: [],
    ...overrides,
  });
}

function asWindow(window: RuntimeMarketWindow): RuntimeMarketWindow {
  return {
    fromMs: window.fromMs,
    toMs: window.toMs,
    toOpenTimeMs: window.toOpenTimeMs,
  };
}

function snapshotFromWindow(
  marketIdentity: string,
  expectedMarketIdentity: string | null,
  window: ReturnType<typeof resolveMarketWindowRuntime>,
): RuntimeMarketWindowSnapshot {
  return {
    marketIdentity,
    expectedMarketIdentity,
    selectedTradeEntryTimeMs: window.selectedTradeEntryTimeMs,
    focusWindow: window.focusWindow,
    coverageWindow: window.coverageWindow,
    focusWindowKey: window.focusWindowKey,
    coverageWindowKey: window.coverageWindowKey,
    resetKey: window.resetKey,
    focusMode: window.focusMode,
    resetReasons: window.resetReasons,
  };
}

describe("workbenchChartRuntime Phase 3A market identity/windows", () => {
  it("matches existing RunMarketView identity semantics", () => {
    const input = makeInput();
    const result = resolveMarketViewRuntime(input);
    const oldView = resolveRunMarketView({
      report: input.report!,
      chartTimeframe: input.chartTimeframe,
      variant: input.selectedVariant!,
      reloadToken: input.reloadToken,
    });
    const oldIdentity = buildRunMarketViewIdentity(oldView);

    expect(result.error).toBeNull();
    expect(result.view).toEqual(oldView);
    expect(result.marketIdentity).toBe(oldIdentity);
    expect(result.expectedMarketIdentity).toBe(oldIdentity);
  });

  it("keeps intended identity but clears expected identity for stale run input", () => {
    const input = makeInput({ selectedRunId: "other-run" });
    const result = resolveMarketViewRuntime(input);

    expect(result.marketIdentity).not.toBeNull();
    expect(result.expectedMarketIdentity).toBeNull();
  });

  it("returns explicit parse errors without producing identity", () => {
    const selectedVariant = makeVariant({ strategy_spec: {} });
    const input = makeInput({
      selectedVariant,
      selectedVariantKey: selectedVariant.variant,
      report: makeReport(selectedVariant),
    });
    const result = resolveMarketViewRuntime(input);

    expect(result.view).toBeNull();
    expect(result.marketIdentity).toBeNull();
    expect(result.expectedMarketIdentity).toBeNull();
    expect(result.error).toBe("strategy_spec.anchor_stack is required");
  });

  it("matches existing focus and coverage window/key calculations", () => {
    const selectedTradeEntryTimeMs = TARGET_SPAN_MS + 123 * TIMEFRAME_MS;
    const input = makeInput({ selectedTradeEntryTimeMs, selectedTradeId: 10 });
    const marketView = resolveMarketViewRuntime(input);
    const marketWindow = resolveMarketWindowRuntime({
      view: marketView.view,
      marketIdentity: marketView.marketIdentity,
      expectedMarketIdentity: marketView.expectedMarketIdentity,
      selectedTradeEntryTimeMs,
    });
    const oldFocus = resolveMarketTargetWindow(marketView.view!, selectedTradeEntryTimeMs);
    const oldKey = buildMarketTargetWindowKey(marketView.marketIdentity!, oldFocus);

    expect(marketWindow.focusMode).toBe("around-trade");
    expect(marketWindow.focusWindow).toEqual(oldFocus);
    expect(marketWindow.coverageWindow).toEqual(oldFocus);
    expect(marketWindow.focusWindowKey).toBe(oldKey);
    expect(marketWindow.coverageWindowKey).toBe(oldKey);
    expect(marketWindow.resetReasons).toEqual([
      "initial_focus",
      "coverage_window_initialized",
    ]);
  });

  it("keeps expanded coverage stable when the reset key is unchanged", () => {
    const input = makeInput();
    const marketView = resolveMarketViewRuntime(input);
    const initial = resolveMarketWindowRuntime({
      view: marketView.view,
      marketIdentity: marketView.marketIdentity,
      expectedMarketIdentity: marketView.expectedMarketIdentity,
      selectedTradeEntryTimeMs: null,
    });
    const expandedCoverage = {
      ...initial.coverageWindow!,
      fromMs: Math.max(0, initial.coverageWindow!.fromMs - TARGET_SPAN_MS),
    };
    const next = resolveMarketWindowRuntime({
      view: marketView.view,
      marketIdentity: marketView.marketIdentity,
      expectedMarketIdentity: marketView.expectedMarketIdentity,
      selectedTradeEntryTimeMs: null,
      previous: {
        ...toMarketWindowRuntimeState(initial),
        coverageWindow: expandedCoverage,
      },
    });

    expect(next.focusWindow).toEqual(initial.focusWindow);
    expect(next.coverageWindow).toEqual(expandedCoverage);
    expect(next.resetReasons).toEqual(["unchanged"]);
  });

  it("resets coverage to the new focus window when selected trade changes", () => {
    const input = makeInput();
    const marketView = resolveMarketViewRuntime(input);
    const initial = resolveMarketWindowRuntime({
      view: marketView.view,
      marketIdentity: marketView.marketIdentity,
      expectedMarketIdentity: marketView.expectedMarketIdentity,
      selectedTradeEntryTimeMs: null,
    });
    const selectedTradeEntryTimeMs = TARGET_SPAN_MS + 300 * TIMEFRAME_MS;
    const expandedCoverage = asWindow({
      ...initial.coverageWindow!,
      fromMs: Math.max(0, initial.coverageWindow!.fromMs - TARGET_SPAN_MS),
    });

    const next = resolveMarketWindowRuntime({
      view: marketView.view,
      marketIdentity: marketView.marketIdentity,
      expectedMarketIdentity: marketView.expectedMarketIdentity,
      selectedTradeEntryTimeMs,
      previous: {
        ...toMarketWindowRuntimeState(initial),
        coverageWindow: expandedCoverage,
      },
    });

    expect(next.focusMode).toBe("around-trade");
    expect(next.coverageWindow).toEqual(next.focusWindow);
    expect(next.resetReasons).toContain("selected_trade_changed");
    expect(next.resetReasons).toContain("coverage_window_reset_to_focus");
  });

  it("exposes old-vs-new comparison fields for identity windows keys and resets", () => {
    const input = makeInput();
    const marketView = resolveMarketViewRuntime(input);
    const marketWindow = resolveMarketWindowRuntime({
      view: marketView.view,
      marketIdentity: marketView.marketIdentity,
      expectedMarketIdentity: marketView.expectedMarketIdentity,
      selectedTradeEntryTimeMs: null,
    });
    const newSnapshot = snapshotFromWindow(
      marketView.marketIdentity!,
      marketView.expectedMarketIdentity,
      marketWindow,
    );

    expect(compareMarketWindowSnapshots(newSnapshot, newSnapshot)).toEqual({
      matches: true,
      differences: [],
      oldSnapshot: newSnapshot,
      newSnapshot,
    });

    const mismatch = compareMarketWindowSnapshots(
      {
        ...newSnapshot,
        coverageWindowKey: "old-key",
        resetReasons: ["unchanged"],
      },
      newSnapshot,
    );

    expect(mismatch.matches).toBe(false);
    expect(mismatch.differences).toEqual(["coverageWindowKey", "resetReasons"]);
  });

  it("keeps runtime v2 inactive and side-effect free in the initial output", () => {
    const input = makeInput();
    const output = createInitialChartRuntimeOutput(input);

    expect(output.market.status).toBe("idle");
    expect(output.market.candlesSource).toBe("unavailable");
    expect(output.debug.marketIdentity).not.toBeNull();
    expect(output.debug.focusWindow).not.toBeNull();
    expect(output.debug.marketWindowKeys.focus).toBe(output.debug.marketWindowKeys.coverage);
    expect(output.debug.ownerFlags).toEqual({
      marketWindows: false,
      marketCacheWrites: false,
      renderWindow: false,
      viewportCommands: false,
      traceDisplayCache: false,
      denseLanesTrace: false,
      auxOverlays: false,
      finalChartModel: false,
    });
  });
});
