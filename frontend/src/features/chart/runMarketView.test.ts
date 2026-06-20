import { beforeEach, describe, expect, it } from "vitest";

import type { RunReport } from "@/api/types";
import { clearMarketResourceCache, mergeCandlesWindowBundle } from "@/features/chart/marketResourceCache";
import {
  buildMarketFetchKey,
  composeDisplayMarketWindowBundle,
  composePartialRunMarketBundle,
  composePartialRunMarketWindowBundle,
  composeRunMarketBundle,
  composeRunMarketWindowBundle,
  getMissingMarketResources,
  getMissingMarketWindowResources,
  isRunMarketViewReady,
  isRunMarketWindowReady,
  resolveRunMarketView,
  seedChartBundleIntoResourceCaches,
} from "@/features/chart/runMarketView";

const EMPTY_METRICS = {
  long: { trades: 0, pnl: 0, return_pct: 0, profit_factor: null, win_rate: null },
  short: { trades: 0, pnl: 0, return_pct: 0, profit_factor: null, win_rate: null },
  total: { trades: 0, pnl: 0, return_pct: 0, profit_factor: null, win_rate: null, sharpe: 0, max_drawdown: 0 },
  open_trades: { long: 0, short: 0, total: 0 },
};

function makeReport(): RunReport {
  return {
    run_id: "run-a",
    created_at: "2026-01-01T00:00:00Z",
    report_schema_version: 1,
    family: "ema_pullback",
    symbol: "BTCUSDT",
    timeframe: "5m",
    candles: 100,
    data_range: { from_open_time_ms: 1_000_000, to_open_time_ms: 1_900_000 },
    variants_count: 2,
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
      {
        variant: "exp_b",
        config_id: "cfg_b",
        symbol: "BTCUSDT",
        timeframe: "5m",
        strategy_spec: {
          anchor_stack: {
            fast: { period: 100 },
            anchor: { period: 300 },
            slow: { period: 600 },
          },
        },
        metrics: EMPTY_METRICS,
        component_counters: [],
        trade_records: [],
      },
    ],
  };
}

const bundle = {
  candles: [
    { time: 1000, open: 1, high: 2, low: 0.5, close: 1.5 },
    { time: 1300, open: 1, high: 2, low: 0.5, close: 1.5 },
    { time: 1600, open: 1, high: 2, low: 0.5, close: 1.5 },
  ],
  ema_overlays: [
    {
      role: "fast" as const,
      period: 200,
      points: [
        { time: 1000, value: 1, kind: "chart_overlay_ema" as const },
        { time: 1300, value: 1, kind: "chart_overlay_ema" as const },
        { time: 1600, value: 1, kind: "chart_overlay_ema" as const },
      ],
    },
    {
      role: "anchor" as const,
      period: 500,
      points: [
        { time: 1000, value: 2, kind: "chart_overlay_ema" as const },
        { time: 1300, value: 2, kind: "chart_overlay_ema" as const },
        { time: 1600, value: 2, kind: "chart_overlay_ema" as const },
      ],
    },
    {
      role: "slow" as const,
      period: 1000,
      points: [
        { time: 1000, value: 3, kind: "chart_overlay_ema" as const },
        { time: 1300, value: 3, kind: "chart_overlay_ema" as const },
        { time: 1600, value: 3, kind: "chart_overlay_ema" as const },
      ],
    },
  ],
};

describe("runMarketView", () => {
  it("reuses candles across variants with identical symbol/timeframe/range", () => {
    clearMarketResourceCache();
    const report = makeReport();
    const viewA = resolveRunMarketView({
      report,
      chartTimeframe: "5m",
      variant: report.variants[0]!,
      reloadToken: 0,
    });
    seedChartBundleIntoResourceCaches(viewA, bundle);

    const viewB = resolveRunMarketView({
      report,
      chartTimeframe: "5m",
      variant: report.variants[1]!,
      reloadToken: 0,
    });

    expect(viewA.candlesKey).toBe(viewB.candlesKey);
    const missingB = getMissingMarketResources(viewB);
    expect(missingB.candles).toBe(false);
    expect(missingB.overlays).toHaveLength(3);
    expect(composePartialRunMarketBundle(viewB)?.candles).toEqual(bundle.candles);
    expect(isRunMarketViewReady(viewB)).toBe(false);
  });

  it("seeds chart-bundle candles and overlays into split caches", () => {
    clearMarketResourceCache();
    const report = makeReport();
    const view = resolveRunMarketView({
      report,
      chartTimeframe: "5m",
      variant: report.variants[0]!,
      reloadToken: 0,
    });
    seedChartBundleIntoResourceCaches(view, bundle);
    expect(isRunMarketViewReady(view)).toBe(true);
    expect(composeRunMarketBundle(view)).toEqual(bundle);
  });

  it("builds fetch key only for missing resources", () => {
    clearMarketResourceCache();
    const report = makeReport();
    const viewA = resolveRunMarketView({
      report,
      chartTimeframe: "5m",
      variant: report.variants[0]!,
      reloadToken: 0,
    });
    seedChartBundleIntoResourceCaches(viewA, bundle);
    const viewB = resolveRunMarketView({
      report,
      chartTimeframe: "5m",
      variant: report.variants[1]!,
      reloadToken: 0,
    });
    const missingB = getMissingMarketResources(viewB);
    const fetchKey = buildMarketFetchKey(viewB, missingB);
    expect(fetchKey).not.toContain(`c:${viewB.candlesKey}`);
    expect(missingB.overlays).toHaveLength(3);
    expect(fetchKey.split("|")).toHaveLength(3);
  });

  it("window-aware compose reads target display window, not full report range", () => {
    clearMarketResourceCache();
    const report = makeReport();
    const view = resolveRunMarketView({
      report,
      chartTimeframe: "5m",
      variant: report.variants[0]!,
      reloadToken: 0,
    });
    const targetWindow = { fromMs: 1_000_000, toMs: 1_600_000 };

    mergeCandlesWindowBundle(view.candlesKey, {
      candles: [bundle.candles[0]!, bundle.candles[1]!],
      coverage: {
        requested_from_ms: targetWindow.fromMs,
        requested_to_ms: targetWindow.toMs,
        actual_from_ms: targetWindow.fromMs,
        actual_to_ms: targetWindow.toMs,
        truncated: false,
      },
    });

    expect(getMissingMarketWindowResources(view, targetWindow).candles).toBe(false);
    expect(getMissingMarketResources(view).candles).toBe(true);
    expect(isRunMarketWindowReady(view, targetWindow)).toBe(false);
    expect(isRunMarketViewReady(view)).toBe(false);
    expect(composePartialRunMarketWindowBundle(view, targetWindow)?.candles).toHaveLength(2);
    expect(composeRunMarketWindowBundle(view, targetWindow)).toBeNull();
    expect(composeRunMarketBundle(view)).toBeNull();
    expect(composePartialRunMarketBundle(view)).toBeNull();
  });
});

describe("composeDisplayMarketWindowBundle", () => {
  beforeEach(() => {
    clearMarketResourceCache();
  });

  it("falls back to focus window when coverage prefetch is not cached yet", () => {
    const report = makeReport();
    const view = resolveRunMarketView({
      report,
      chartTimeframe: "5m",
      variant: report.variants[0]!,
      reloadToken: 0,
    });
    const focusWindow = { fromMs: 1_300_000, toMs: 1_900_000, toOpenTimeMs: 1_600_000 };
    const coverageWindow = { fromMs: 1_000_000, toMs: 1_900_000, toOpenTimeMs: 1_600_000 };
    mergeCandlesWindowBundle(view.candlesKey, {
      candles: [{ time: 1300, open: 1, high: 1, low: 1, close: 1 }],
      coverage: {
        requested_from_ms: focusWindow.fromMs,
        requested_to_ms: focusWindow.toMs,
        actual_from_ms: focusWindow.fromMs,
        actual_to_ms: focusWindow.toMs,
        truncated: false,
      },
    });

    expect(composePartialRunMarketWindowBundle(view, coverageWindow)).toBeNull();
    const composed = composeDisplayMarketWindowBundle(view, focusWindow, coverageWindow);
    expect(composed?.source).toBe("focus");
    expect(composed?.bundle.candles).toHaveLength(1);
  });
});
