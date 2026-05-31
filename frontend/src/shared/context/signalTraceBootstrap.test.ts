import { describe, expect, it } from "vitest";

import type { ChartBar, RunReport, RunVariant } from "@/api/types";
import {
  evaluateSignalTraceBootstrap,
  resolveSignalTraceFetchSource,
} from "@/shared/context/signalTraceBootstrap";

const VARIANT: RunVariant = {
  variant: "exp_a",
  config_id: "cfg",
  symbol: "BTCUSDT",
  timeframe: "5m",
  strategy_spec: { anchor_stack: { fast: 200, anchor: 500, slow: 1000 } },
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

describe("signalTraceBootstrap", () => {
  it("blocks when market is not ready", () => {
    const candles = makeCandles(10);
    const result = evaluateSignalTraceBootstrap({
      report: REPORT,
      selectedRunId: "run-a",
      selectedVariant: VARIANT,
      marketLoadStatus: "loading",
      chartWindowKey: "run-a:exp_a:1:2:",
      candles,
      renderWindowBounds: { fromSec: candles[0]!.time, toSec: candles.at(-1)!.time },
      previousWindowKey: null,
    });
    expect(result).toEqual({ ready: false, reason: "market_not_ready" });
  });

  it("returns load request on initial render window readiness", () => {
    const candles = makeCandles(50);
    const first = candles[0]!.time;
    const last = candles.at(-1)!.time;
    const windowKey = `run-a:exp_a:${first}:${last}:`;
    const result = evaluateSignalTraceBootstrap({
      report: REPORT,
      selectedRunId: "run-a",
      selectedVariant: VARIANT,
      marketLoadStatus: "ready",
      chartWindowKey: windowKey,
      candles,
      renderWindowBounds: { fromSec: first, toSec: last },
      previousWindowKey: null,
    });
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
});
