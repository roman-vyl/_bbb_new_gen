import { describe, expect, it } from "vitest";

import type { RunReport } from "@/api/types";
import { clearMarketResourceCache } from "@/features/chart/marketResourceCache";
import {
  buildMarketFetchKey,
  composePartialRunMarketBundle,
  composeRunMarketBundle,
  getMissingMarketResources,
  isRunMarketViewReady,
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
    data_range: { from_open_time_ms: 1_000_000, to_open_time_ms: 2_000_000 },
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
  candles: [{ time: 1000, open: 1, high: 2, low: 0.5, close: 1.5 }],
  ema_overlays: [
    { role: "fast" as const, period: 200, points: [{ time: 1000, value: 1, kind: "chart_overlay_ema" as const }] },
    { role: "anchor" as const, period: 500, points: [{ time: 1000, value: 2, kind: "chart_overlay_ema" as const }] },
    { role: "slow" as const, period: 1000, points: [{ time: 1000, value: 3, kind: "chart_overlay_ema" as const }] },
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
});
