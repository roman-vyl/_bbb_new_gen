import { beforeEach, describe, expect, it } from "vitest";

import type { ChartBar } from "@/api/types";
import {
  buildCandlesCacheKey,
  buildOverlayCacheKey,
  clearMarketResourceCache,
  createMarketCandlesCacheStore,
  createMarketOverlayCacheStore,
  getCandles,
  getOverlay,
  hasCandles,
  hasOverlay,
  marketCandlesReady,
  marketOverlaysReady,
  mergeCandlesWindowBundle,
  mergeEmaWindowBundle,
  setCandlesIfAbsent,
  setOverlayIfAbsent,
} from "@/features/chart/marketResourceCache";

function bar(timeSec: number): ChartBar {
  return { time: timeSec, open: 1, high: 1, low: 1, close: 1 };
}

describe("marketResourceCache keys", () => {
  it("builds candle identity without variant, periods, or report range", () => {
    const key = buildCandlesCacheKey({
      symbol: "BTCUSDT",
      timeframe: "5m",
      reloadToken: 0,
    });
    expect(key).toBe("BTCUSDT\u001e5m\u001e0");
    expect(key.split("\u001e")).toHaveLength(3);
  });

  it("builds overlay identity with source, role, and period", () => {
    const key = buildOverlayCacheKey({
      symbol: "BTCUSDT",
      timeframe: "5m",
      source: "anchor_stack",
      role: "fast",
      period: 200,
      reloadToken: 0,
    });
    expect(key).toContain("anchor_stack");
    expect(key).toContain("fast");
    expect(key).toContain("200");
    expect(key.split("\u001e")).toHaveLength(6);
  });
});

describe("marketResourceCache interval storage", () => {
  const candlesKey = buildCandlesCacheKey({
    symbol: "BTCUSDT",
    timeframe: "5m",
    reloadToken: 0,
  });

  beforeEach(() => {
    clearMarketResourceCache();
  });

  it("covers merged ranges and reports missing gaps", () => {
    const store = createMarketCandlesCacheStore();
    store.mergeChunk({
      fromMs: 100_000,
      toMs: 200_000,
      candles: [bar(100), bar(150), bar(199)],
    });
    store.mergeChunk({
      fromMs: 250_000,
      toMs: 350_000,
      candles: [bar(250), bar(300), bar(349)],
    });

    expect(store.coversRange(100_000, 200_000)).toBe(true);
    expect(store.coversRange(250_000, 350_000)).toBe(true);
    expect(store.coversRange(100_000, 350_000)).toBe(false);
    expect(store.missingRange(100_000, 350_000)).toEqual({ fromMs: 200_000, toMs: 350_000 });
  });

  it("sliceForRange returns bars in half-open window", () => {
    const store = createMarketCandlesCacheStore();
    store.mergeChunk({
      fromMs: 1_000_000,
      toMs: 1_900_000,
      candles: [bar(1000), bar(1300), bar(1600)],
    });

    expect(store.sliceForRange(1_000_000, 1_600_000)).toEqual([bar(1000), bar(1300)]);
  });

  it("seeds candles-window bundle via coverage bounds", () => {
    mergeCandlesWindowBundle(candlesKey, {
      candles: [bar(1000), bar(1300)],
      coverage: {
        requested_from_ms: 1_000_000,
        requested_to_ms: 1_600_000,
        actual_from_ms: 1_000_000,
        actual_to_ms: 1_600_000,
        truncated: false,
      },
    });

    expect(marketCandlesReady(candlesKey, 1_000_000, 1_600_000)).toBe(true);
    expect(getCandles(candlesKey, 1_000_000, 1_600_000)).toHaveLength(2);
  });

  it("dual-interval candles leave distant gap uncovered", () => {
    mergeCandlesWindowBundle(candlesKey, {
      candles: [bar(1_700_000_000), bar(1_700_000_300)],
      coverage: {
        requested_from_ms: 1_700_000_000_000,
        requested_to_ms: 1_700_000_600_000,
        actual_from_ms: 1_700_000_000_000,
        actual_to_ms: 1_700_000_600_000,
        truncated: false,
      },
    });
    mergeCandlesWindowBundle(candlesKey, {
      candles: [bar(1_500_000_000), bar(1_500_000_300)],
      coverage: {
        requested_from_ms: 1_500_000_000_000,
        requested_to_ms: 1_500_000_600_000,
        actual_from_ms: 1_500_000_000_000,
        actual_to_ms: 1_500_000_600_000,
        truncated: false,
      },
    });

    expect(marketCandlesReady(candlesKey, 1_700_000_000_000, 1_700_000_600_000)).toBe(true);
    expect(marketCandlesReady(candlesKey, 1_500_000_000_000, 1_500_000_600_000)).toBe(true);
    expect(marketCandlesReady(candlesKey, 1_500_000_000_000, 1_700_000_600_000)).toBe(false);
  });

  it("overlays track independent interval sets", () => {
    const fastKey = buildOverlayCacheKey({
      symbol: "BTCUSDT",
      timeframe: "5m",
      source: "anchor_stack",
      role: "fast",
      period: 200,
      reloadToken: 0,
    });
    const slowKey = buildOverlayCacheKey({
      symbol: "BTCUSDT",
      timeframe: "5m",
      source: "anchor_stack",
      role: "slow",
      period: 1000,
      reloadToken: 0,
    });

    mergeEmaWindowBundle(fastKey, {
      points: [{ time: 1000, value: 1, kind: "chart_overlay_ema" }],
      coverage: {
        requested_from_ms: 1_000_000,
        requested_to_ms: 1_300_000,
        actual_from_ms: 1_000_000,
        actual_to_ms: 1_300_000,
        calculation_origin_ms: 1_000_000,
        coverage_to_ms: 1_300_000,
        cache_hit: false,
        truncated: false,
      },
    });

    expect(marketOverlaysReady([fastKey, slowKey], 1_000_000, 1_300_000)).toBe(false);
    expect(marketOverlaysReady([fastKey], 1_000_000, 1_300_000)).toBe(true);
  });

  it("setCandlesIfAbsent skips when chunk bounds already covered", () => {
    setCandlesIfAbsent(candlesKey, [bar(1000), bar(1300)]);
    setCandlesIfAbsent(candlesKey, [bar(1000), bar(1300)]);

    expect(hasCandles(candlesKey, 1_000_000, 1_600_000)).toBe(true);
    expect(getCandles(candlesKey, 1_000_000, 1_600_000)).toHaveLength(2);
  });

  it("setOverlayIfAbsent dedupes by time within merged store", () => {
    const overlayKey = buildOverlayCacheKey({
      symbol: "BTCUSDT",
      timeframe: "5m",
      source: "anchor_stack",
      role: "anchor",
      period: 500,
      reloadToken: 0,
    });

    setOverlayIfAbsent(overlayKey, {
      role: "anchor",
      period: 500,
      points: [{ time: 1000, value: 1, kind: "chart_overlay_ema" }],
    });
    setOverlayIfAbsent(overlayKey, {
      role: "anchor",
      period: 500,
      points: [{ time: 1000, value: 99, kind: "chart_overlay_ema" }],
    });

    expect(hasOverlay(overlayKey, 1_000_000, 1_300_000)).toBe(true);
    expect(getOverlay(overlayKey, 1_000_000, 1_300_000)?.points[0]?.value).toBe(1);
  });

  it("evicts oldest chunks when cap exceeded", () => {
    const store = createMarketOverlayCacheStore();
    for (let i = 0; i < 12; i += 1) {
      store.mergeChunk({
        fromMs: i * 100_000,
        toMs: i * 100_000 + 50_000,
        points: [{ time: i * 100, value: i, kind: "chart_overlay_ema" }],
      });
    }
    expect(store.chunkCount()).toBe(10);
    expect(store.coversRange(0, 50_000)).toBe(false);
    expect(store.coversRange(200_000, 250_000)).toBe(true);
  });
});
