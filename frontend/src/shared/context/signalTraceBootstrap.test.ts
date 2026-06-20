import { describe, expect, it } from "vitest";

import type { ChartBar, RunReport, RunVariant } from "@/api/types";
import {
  buildRunMarketViewIdentity,
  resolveRunMarketView,
} from "@/features/chart/runMarketView";
import {
  chartWindowKeyMatchesRunVariant,
  evaluateSignalTraceBootstrap,
  resolveSignalTraceFetchSource,
  variantBelongsToReport,
} from "@/shared/context/signalTraceBootstrap";

const VARIANT: RunVariant = {
  variant: "exp_a",
  config_id: "cfg",
  symbol: "BTCUSDT",
  timeframe: "5m",
  strategy_spec: {
    anchor_stack: {
      fast: { period: 200 },
      anchor: { period: 500 },
      slow: { period: 1000 },
    },
  },
  metrics: {
    long: { trades: 0, pnl: 0, return_pct: 0, profit_factor: null, win_rate: null },
    short: { trades: 0, pnl: 0, return_pct: 0, profit_factor: null, win_rate: null },
    total: { trades: 0, pnl: 0, return_pct: 0, profit_factor: null, win_rate: null, sharpe: 0, max_drawdown: 0 },
    open_trades: { long: 0, short: 0, total: 0 },
  },
  component_counters: [],
  trade_records: [],
};

const REPORT: RunReport = {
  run_id: "run-a",
  created_at: "2026-01-01T00:00:00Z",
  report_schema_version: 1,
  family: "ema_pullback",
  symbol: "BTCUSDT",
  timeframe: "5m",
  candles: 100,
  data_range: { from_open_time_ms: 1_000_000, to_open_time_ms: 2_000_000 },
  variants_count: 1,
  variants: [VARIANT],
};

function makeCandles(count: number, start = 1_700_000_000): ChartBar[] {
  return Array.from({ length: count }, (_, index) => ({
    time: start + index * 300,
    open: 100,
    high: 101,
    low: 99,
    close: 100.5,
  }));
}

function marketIdentityForReport(report: RunReport = REPORT): string {
  return buildRunMarketViewIdentity(
    resolveRunMarketView({
      report,
      chartTimeframe: "5m",
      variant: VARIANT,
      reloadToken: 0,
    }),
  );
}

function bootstrapInput(
  overrides: Partial<Parameters<typeof evaluateSignalTraceBootstrap>[0]> = {},
) {
  const candles = makeCandles(10);
  const first = candles[0]!.time;
  const last = candles.at(-1)!.time;
  const windowKey = `run-a:exp_a:${first}:${last}:`;
  const identity = marketIdentityForReport();
  return {
    report: REPORT,
    reportLoadStatus: "ready" as const,
    selectedRunId: "run-a",
    selectedVariantKey: VARIANT.variant,
    marketLoadStatus: "ready" as const,
    runMarketViewIdentity: identity,
    expectedRunMarketViewIdentity: identity,
    chartWindowKey: windowKey,
    candles,
    renderWindowBounds: { fromSec: first, toSec: last },
    previousWindowKey: null,
    ...overrides,
  };
}

describe("signalTraceBootstrap", () => {
  it("blocks when market is not ready", () => {
    const result = evaluateSignalTraceBootstrap(
      bootstrapInput({ marketLoadStatus: "loading" }),
    );
    expect(result).toEqual({ ready: false, reason: "market_not_ready" });
  });

  it("blocks when report run_id mismatches selectedRunId during run switch", () => {
    const result = evaluateSignalTraceBootstrap(
      bootstrapInput({ selectedRunId: "run-b" }),
    );
    expect(result).toEqual({ ready: false, reason: "report_run_mismatch" });
  });

  it("blocks when report is still loading after run switch", () => {
    const result = evaluateSignalTraceBootstrap(
      bootstrapInput({ reportLoadStatus: "loading", report: null }),
    );
    expect(result).toEqual({ ready: false, reason: "run_switch_not_ready" });
  });

  it("blocks when market view identity is stale after run switch", () => {
    const result = evaluateSignalTraceBootstrap(
      bootstrapInput({ runMarketViewIdentity: "stale-market-view" }),
    );
    expect(result).toEqual({ ready: false, reason: "run_switch_not_ready" });
  });

  it("blocks when render window key does not match current run/variant", () => {
    const candles = makeCandles(10);
    const result = evaluateSignalTraceBootstrap(
      bootstrapInput({
        chartWindowKey: "run-b:exp_a:1:2:",
        candles,
        renderWindowBounds: { fromSec: candles[0]!.time, toSec: candles.at(-1)!.time },
      }),
    );
    expect(result).toEqual({ ready: false, reason: "render_window_not_ready" });
  });

  it("returns load request on initial render window readiness", () => {
    const candles = makeCandles(50);
    const first = candles[0]!.time;
    const last = candles.at(-1)!.time;
    const windowKey = `run-a:exp_a:${first}:${last}:`;
    const result = evaluateSignalTraceBootstrap(bootstrapInput({ candles, chartWindowKey: windowKey }));
    expect(result.ready).toBe(true);
    if (!result.ready) {
      return;
    }
    expect(result.fetchSource).toBe("initial");
    expect(result.request).toEqual({
      windowKey,
      runId: "run-a",
      variant: "exp_a",
      fromMs: first * 1000,
      toOpenTimeMs: last * 1000,
    });
  });

  it("marks window shift when chart window key changes", () => {
    expect(resolveSignalTraceFetchSource("run-a:exp_a:1:2:", "run-a:exp_a:3:4:")).toBe(
      "window_shift",
    );
    expect(resolveSignalTraceFetchSource(null, "run-a:exp_a:1:2:")).toBe("initial");
  });

  it("validates variant membership and window prefix helpers", () => {
    expect(variantBelongsToReport(REPORT, "exp_a")).toBe(true);
    expect(variantBelongsToReport(REPORT, "missing")).toBe(false);
    expect(chartWindowKeyMatchesRunVariant("run-a:exp_a:1:2:", "run-a", "exp_a")).toBe(true);
    expect(chartWindowKeyMatchesRunVariant("run-b:exp_a:1:2:", "run-a", "exp_a")).toBe(false);
  });
});
