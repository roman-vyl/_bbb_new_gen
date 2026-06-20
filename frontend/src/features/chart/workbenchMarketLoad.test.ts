import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RunReport } from "@/api/types";
import { clearMarketResourceCache, mergeCandlesWindowBundle } from "@/features/chart/marketResourceCache";
import { resolveRunMarketView } from "@/features/chart/runMarketView";
import {
  evaluateMarketPanPrefetchExpansion,
  executeMarketWindowLoad,
  marketCandlesReadyForTarget,
  marketWindowChunkMs,
  resolveMarketTargetWindow,
} from "@/features/chart/workbenchMarketLoad";
import { CHART_RENDER_SAFE_ZONE } from "@/features/chart/chartViewWindow";

const fetchCandlesWindow = vi.fn<typeof import("@/api/client").fetchCandlesWindow>();
const fetchEmaWindow = vi.fn<typeof import("@/api/client").fetchEmaWindow>();

vi.mock("@/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/client")>();
  return {
    ...actual,
    fetchCandlesWindow: (...args: Parameters<typeof fetchCandlesWindow>) =>
      fetchCandlesWindow(...args),
    fetchEmaWindow: (...args: Parameters<typeof fetchEmaWindow>) => fetchEmaWindow(...args),
  };
});

function makeReport(): RunReport {
  return {
    run_id: "run-a",
    created_at: "2026-01-01T00:00:00Z",
    report_schema_version: 1,
    family: "ema_pullback",
    symbol: "BTCUSDT",
    timeframe: "5m",
    candles: 100,
    data_range: { from_open_time_ms: 1_700_000_000_000, to_open_time_ms: 1_700_010_000_000 },
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
        metrics: {
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
        },
        component_counters: [],
        trade_records: [],
      },
    ],
  };
}

describe("workbenchMarketLoad", () => {
  beforeEach(() => {
    clearMarketResourceCache();
    vi.clearAllMocks();
  });

  it("fetches candles first then ema-window per period", async () => {
    const report = makeReport();
    const view = resolveRunMarketView({
      report,
      chartTimeframe: "5m",
      variant: report.variants[0]!,
      reloadToken: 0,
    });
    const target = resolveMarketTargetWindow(view, null);

    fetchCandlesWindow.mockResolvedValue({
      candles: [{ time: 1_700_000_000, open: 1, high: 1, low: 1, close: 1 }],
      coverage: {
        requested_from_ms: target.fromMs,
        requested_to_ms: target.toMs,
        actual_from_ms: target.fromMs,
        actual_to_ms: target.toMs,
        truncated: false,
      },
    });
    fetchEmaWindow.mockResolvedValue({
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

    const controller = new AbortController();
    const result = await executeMarketWindowLoad({
      view,
      targetWindow: target,
      symbol: report.symbol,
      timeframe: "5m",
      signal: controller.signal,
      inFlightKeys: new Set(),
    });

    expect(result.candlesFetched).toBe(true);
    expect(result.emaFetched).toBe(3);
    expect(fetchCandlesWindow).toHaveBeenCalledTimes(1);
    expect(fetchEmaWindow).toHaveBeenCalledTimes(3);
    expect(marketCandlesReadyForTarget(view, target)).toBe(true);
  });

  it("skips candles fetch when window already cached", async () => {
    const report = makeReport();
    const view = resolveRunMarketView({
      report,
      chartTimeframe: "5m",
      variant: report.variants[0]!,
      reloadToken: 0,
    });
    const target = resolveMarketTargetWindow(view, null);
    mergeCandlesWindowBundle(view.candlesKey, {
      candles: [{ time: 1_700_000_000, open: 1, high: 1, low: 1, close: 1 }],
      coverage: {
        requested_from_ms: target.fromMs,
        requested_to_ms: target.toMs,
        actual_from_ms: target.fromMs,
        actual_to_ms: target.toMs,
        truncated: false,
      },
    });
    fetchEmaWindow.mockResolvedValue({
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

    const result = await executeMarketWindowLoad({
      view,
      targetWindow: target,
      symbol: report.symbol,
      timeframe: "5m",
      signal: new AbortController().signal,
      inFlightKeys: new Set(),
    });

    expect(result.candlesFetched).toBe(false);
    expect(fetchCandlesWindow).not.toHaveBeenCalled();
    expect(fetchEmaWindow).toHaveBeenCalledTimes(3);
  });
});

describe("evaluateMarketPanPrefetchExpansion", () => {
  const timeframeMs = 300_000;
  const chunkMs = marketWindowChunkMs(timeframeMs);
  const marginMs = CHART_RENDER_SAFE_ZONE * timeframeMs;
  const reportFromMs = 0;
  const reportToMs = chunkMs * 4;

  function targetWindow(fromMs: number, toMs: number) {
    return {
      fromMs,
      toMs,
      toOpenTimeMs: Math.max(fromMs, toMs - timeframeMs),
    };
  }

  it("returns not_user_pan when interaction is programmatic", () => {
    const target = targetWindow(chunkMs, chunkMs * 2);
    const decision = evaluateMarketPanPrefetchExpansion({
      targetWindow: target,
      visibleFromSec: chunkMs / 1000,
      visibleToSec: chunkMs / 1000,
      reportFromMs,
      reportToMs,
      timeframeMs,
      isUserPan: false,
    });
    expect(decision.reason).toBe("not_user_pan");
    expect(decision.expanded).toBeNull();
  });

  it("expands target left by one chunk when visible range is near left edge", () => {
    const target = targetWindow(chunkMs, chunkMs * 2);
    const decision = evaluateMarketPanPrefetchExpansion({
      targetWindow: target,
      visibleFromSec: chunkMs / 1000,
      visibleToSec: (chunkMs + timeframeMs) / 1000,
      reportFromMs,
      reportToMs,
      timeframeMs,
      isUserPan: true,
    });
    expect(decision.reason).toBe("near_left_edge");
    expect(decision.expanded?.fromMs).toBe(0);
    expect(decision.expanded?.toMs).toBe(target.toMs);
    expect(decision.meta.margin_ms).toBe(marginMs);
  });

  it("expands target right by one chunk when visible range is near right edge", () => {
    const target = targetWindow(chunkMs, chunkMs * 2);
    const visibleToOpenMs = target.toOpenTimeMs;
    const decision = evaluateMarketPanPrefetchExpansion({
      targetWindow: target,
      visibleFromSec: (visibleToOpenMs - marginMs) / 1000,
      visibleToSec: visibleToOpenMs / 1000,
      reportFromMs,
      reportToMs,
      timeframeMs,
      isUserPan: true,
    });
    expect(decision.reason).toBe("near_right_edge");
    expect(decision.expanded?.toMs).toBe(chunkMs * 3);
  });

  it("returns clamped when already at report boundary", () => {
    const target = targetWindow(0, chunkMs);
    const decision = evaluateMarketPanPrefetchExpansion({
      targetWindow: target,
      visibleFromSec: 0,
      visibleToSec: timeframeMs / 1000,
      reportFromMs,
      reportToMs,
      timeframeMs,
      isUserPan: true,
    });
    expect(decision.reason).toBe("clamped");
    expect(decision.expanded).toBeNull();
  });
});
