import { beforeEach, describe, expect, it } from "vitest";

import {
  buildOverlayCacheKey,
  clearMarketResourceCache,
} from "@/features/chart/marketResourceCache";
import {
  isMarketCandlesReadyForWindow,
  isMarketOverlaysReadyForWindow,
  planCandlesWindowFetchForView,
  planEmaWindowFetchesForView,
  resolveTargetDisplayWindow,
  resolveTargetDisplayWindowForView,
  seedCandlesWindow,
  seedEmaWindow,
} from "@/features/chart/marketWindowPlanner";
import { CHART_RENDER_WINDOW_SIZE } from "@/features/chart/chartViewWindow";
import { resolveRunMarketView } from "@/features/chart/runMarketView";
import type { RunReport } from "@/api/types";

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

function makeReport(dataRange: { from_open_time_ms: number; to_open_time_ms: number }): RunReport {
  return {
    run_id: "run-a",
    created_at: "2026-01-01T00:00:00Z",
    report_schema_version: 1,
    family: "ema_pullback",
    symbol: "BTCUSDT",
    timeframe: "5m",
    candles: 100,
    data_range: dataRange,
    variants_count: 1,
    variants: [
      {
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
      },
    ],
  };
}

describe("resolveTargetDisplayWindow", () => {
  it("returns tail window capped at render window size", () => {
    const reportFrom = 0;
    const reportTo = CHART_RENDER_WINDOW_SIZE * 300_000 + 300_000;
    const window = resolveTargetDisplayWindow({
      reportFromMs: reportFrom,
      reportToMs: reportTo,
      mode: "tail",
      timeframeMs: 300_000,
    });

    expect(window.toMs).toBe(reportTo);
    expect(window.fromMs).toBe(reportTo - CHART_RENDER_WINDOW_SIZE * 300_000);
  });

  it("uses 1h bar duration for window span (not 5m default)", () => {
    const reportFrom = 0;
    const reportTo = CHART_RENDER_WINDOW_SIZE * 3_600_000 + 3_600_000;
    const window5m = resolveTargetDisplayWindow({
      reportFromMs: reportFrom,
      reportToMs: reportTo,
      mode: "tail",
      timeframeMs: 300_000,
    });
    const window1h = resolveTargetDisplayWindow({
      reportFromMs: reportFrom,
      reportToMs: reportTo,
      mode: "tail",
      timeframeMs: 3_600_000,
    });

    expect(window1h.fromMs).toBe(reportTo - CHART_RENDER_WINDOW_SIZE * 3_600_000);
    expect(window5m.fromMs).toBe(reportTo - CHART_RENDER_WINDOW_SIZE * 300_000);
    expect(window1h.fromMs).toBeLessThan(window5m.fromMs);
  });

  it("resolveTargetDisplayWindowForView derives timeframe from chartTimeframe", () => {
    const report = makeReport({
      from_open_time_ms: 0,
      to_open_time_ms: CHART_RENDER_WINDOW_SIZE * 3_600_000 + 3_600_000,
    });
    const view5m = resolveRunMarketView({
      report,
      chartTimeframe: "5m",
      variant: report.variants[0]!,
      reloadToken: 0,
    });
    const view1h = resolveRunMarketView({
      report,
      chartTimeframe: "1h",
      variant: report.variants[0]!,
      reloadToken: 0,
    });

    const window5m = resolveTargetDisplayWindowForView(view5m, {
      reportFromMs: view5m.fromOpenTimeMs,
      reportToMs: view5m.toOpenTimeMs,
      mode: "tail",
    });
    const window1h = resolveTargetDisplayWindowForView(view1h, {
      reportFromMs: view1h.fromOpenTimeMs,
      reportToMs: view1h.toOpenTimeMs,
      mode: "tail",
    });

    expect(window1h.fromMs).toBeLessThan(window5m.fromMs);
  });
});

describe("marketWindowPlanner", () => {
  beforeEach(() => {
    clearMarketResourceCache();
  });

  it("plans candles fetch when target window is missing", () => {
    const report = makeReport({
      from_open_time_ms: 1_700_000_000_000,
      to_open_time_ms: 1_700_100_000_000,
    });
    const view = resolveRunMarketView({
      report,
      chartTimeframe: "5m",
      variant: report.variants[0]!,
      reloadToken: 0,
    });
    const target = resolveTargetDisplayWindowForView(view, {
      reportFromMs: view.fromOpenTimeMs,
      reportToMs: view.toOpenTimeMs,
      mode: "tail",
    });

    const planned = planCandlesWindowFetchForView({ view, targetWindow: target });
    expect(planned).not.toBeNull();
    expect(planned!.candlesKey).toBe(view.candlesKey);
    expect(planned!.inFlightKey).toContain("candles");
  });

  it("returns null candles plan when interval already covers target", () => {
    const report = makeReport({
      from_open_time_ms: 1_700_000_000_000,
      to_open_time_ms: 1_700_010_000_000,
    });
    const view = resolveRunMarketView({
      report,
      chartTimeframe: "5m",
      variant: report.variants[0]!,
      reloadToken: 0,
    });
    const target = resolveTargetDisplayWindowForView(view, {
      reportFromMs: view.fromOpenTimeMs,
      reportToMs: view.toOpenTimeMs,
      mode: "tail",
    });

    seedCandlesWindow(view.candlesKey, {
      candles: [{ time: 1_700_000_000, open: 1, high: 1, low: 1, close: 1 }],
      coverage: {
        requested_from_ms: target.fromMs,
        requested_to_ms: target.toMs,
        actual_from_ms: target.fromMs,
        actual_to_ms: target.toMs,
        truncated: false,
      },
    });

    expect(planCandlesWindowFetchForView({ view, targetWindow: target })).toBeNull();
    expect(isMarketCandlesReadyForWindow(view, target)).toBe(true);
  });

  it("candles ready before overlays when only candles seeded", () => {
    const report = makeReport({
      from_open_time_ms: 1_700_000_000_000,
      to_open_time_ms: 1_700_010_000_000,
    });
    const view = resolveRunMarketView({
      report,
      chartTimeframe: "5m",
      variant: report.variants[0]!,
      reloadToken: 0,
    });
    const target = resolveTargetDisplayWindowForView(view, {
      reportFromMs: view.fromOpenTimeMs,
      reportToMs: view.toOpenTimeMs,
      mode: "tail",
    });

    seedCandlesWindow(view.candlesKey, {
      candles: [{ time: 1_700_000_000, open: 1, high: 1, low: 1, close: 1 }],
      coverage: {
        requested_from_ms: target.fromMs,
        requested_to_ms: target.toMs,
        actual_from_ms: target.fromMs,
        actual_to_ms: target.toMs,
        truncated: false,
      },
    });

    expect(isMarketCandlesReadyForWindow(view, target)).toBe(true);
    expect(isMarketOverlaysReadyForWindow(view, target)).toBe(false);
    expect(planEmaWindowFetchesForView({ view, targetWindow: target })).toHaveLength(3);
  });

  it("distant trade second interval does not cover gap", () => {
    const report = makeReport({
      from_open_time_ms: 1_500_000_000_000,
      to_open_time_ms: 1_700_010_000_000,
    });
    const view = resolveRunMarketView({
      report,
      chartTimeframe: "5m",
      variant: report.variants[0]!,
      reloadToken: 0,
    });

    const tailTarget = resolveTargetDisplayWindowForView(view, {
      reportFromMs: view.fromOpenTimeMs,
      reportToMs: view.toOpenTimeMs,
      mode: "tail",
    });
    seedCandlesWindow(view.candlesKey, {
      candles: [{ time: 1_700_000_000, open: 1, high: 1, low: 1, close: 1 }],
      coverage: {
        requested_from_ms: tailTarget.fromMs,
        requested_to_ms: tailTarget.toMs,
        actual_from_ms: tailTarget.fromMs,
        actual_to_ms: tailTarget.toMs,
        truncated: false,
      },
    });

    const distantTarget = resolveTargetDisplayWindowForView(view, {
      reportFromMs: view.fromOpenTimeMs,
      reportToMs: view.toOpenTimeMs,
      mode: "around-trade",
      centerTimeSec: 1_500_000_300,
    });
    seedCandlesWindow(view.candlesKey, {
      candles: [{ time: 1_500_000_000, open: 1, high: 1, low: 1, close: 1 }],
      coverage: {
        requested_from_ms: distantTarget.fromMs,
        requested_to_ms: distantTarget.toMs,
        actual_from_ms: distantTarget.fromMs,
        actual_to_ms: distantTarget.toMs,
        truncated: false,
      },
    });

    expect(isMarketCandlesReadyForWindow(view, tailTarget)).toBe(true);
    expect(isMarketCandlesReadyForWindow(view, distantTarget)).toBe(true);
    expect(isMarketCandlesReadyForWindow(view, {
      fromMs: view.fromOpenTimeMs,
      toMs: view.toOpenTimeMs,
      toOpenTimeMs: view.toOpenTimeMs - 300_000,
    })).toBe(false);

    const gapPlan = planCandlesWindowFetchForView({
      view,
      targetWindow: {
        fromMs: view.fromOpenTimeMs,
        toMs: view.toOpenTimeMs,
        toOpenTimeMs: view.toOpenTimeMs - 300_000,
      },
    });
    expect(gapPlan).not.toBeNull();
    expect(gapPlan!.missingRange.fromMs).toBeGreaterThanOrEqual(distantTarget.toMs);
    expect(gapPlan!.missingRange.toMs).toBeLessThanOrEqual(tailTarget.fromMs);
    expect(gapPlan!.missingRange.toMs).toBeGreaterThan(gapPlan!.missingRange.fromMs);
  });

  it("plans per-period ema fetches only for missing overlay intervals", () => {
    const report = makeReport({
      from_open_time_ms: 1_700_000_000_000,
      to_open_time_ms: 1_700_010_000_000,
    });
    const view = resolveRunMarketView({
      report,
      chartTimeframe: "5m",
      variant: report.variants[0]!,
      reloadToken: 0,
    });
    const target = resolveTargetDisplayWindowForView(view, {
      reportFromMs: view.fromOpenTimeMs,
      reportToMs: view.toOpenTimeMs,
      mode: "tail",
    });

    const fastKey = buildOverlayCacheKey({
      symbol: view.symbol,
      timeframe: view.chartTimeframe,
      source: "anchor_stack",
      role: "fast",
      period: view.periods.fast,
      reloadToken: view.reloadToken,
    });

    seedEmaWindow(fastKey, {
      points: [{ time: 1_700_000_000, value: 1, kind: "chart_overlay_ema" }],
      coverage: {
        requested_from_ms: target.fromMs,
        requested_to_ms: target.toMs,
        actual_from_ms: target.fromMs,
        actual_to_ms: target.toMs,
        calculation_origin_ms: target.fromMs,
        coverage_to_ms: target.toMs,
        cache_hit: false,
        truncated: false,
      },
    });

    const planned = planEmaWindowFetchesForView({ view, targetWindow: target });
    expect(planned).toHaveLength(2);
    expect(planned.every((item) => item.role !== "fast")).toBe(true);
  });
});
