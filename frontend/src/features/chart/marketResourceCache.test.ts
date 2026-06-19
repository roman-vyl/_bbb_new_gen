import { describe, expect, it } from "vitest";

import {
  buildCandlesCacheKey,
  buildOverlayCacheKey,
  getCandles,
  getOverlay,
  hasCandles,
  hasOverlay,
  setCandlesIfAbsent,
  setOverlayIfAbsent,
} from "@/features/chart/marketResourceCache";

describe("marketResourceCache", () => {
  const range = {
    fromOpenTimeMs: 1_000_000,
    toOpenTimeMs: 2_000_000,
    reloadToken: 0,
  };

  it("builds candle identity without variant or EMA periods", () => {
    const key = buildCandlesCacheKey({
      symbol: "BTCUSDT",
      timeframe: "5m",
      ...range,
    });
    expect(key).toBe("BTCUSDT\u001e5m\u001e1000000\u001e2000000\u001e0");
    expect(key).not.toContain("exp_a");
    expect(key.split("\u001e")).toHaveLength(5);
  });

  it("builds overlay identity with source, role, and period", () => {
    const key = buildOverlayCacheKey({
      symbol: "BTCUSDT",
      timeframe: "5m",
      source: "anchor_stack",
      role: "fast",
      period: 200,
      ...range,
    });
    expect(key).toContain("anchor_stack");
    expect(key).toContain("fast");
    expect(key).toContain("200");
  });

  it("does not overwrite existing candle or overlay entries", () => {
    const candlesKey = buildCandlesCacheKey({
      symbol: "BTCUSDT",
      timeframe: "5m",
      ...range,
    });
    const overlayKey = buildOverlayCacheKey({
      symbol: "BTCUSDT",
      timeframe: "5m",
      source: "anchor_stack",
      role: "anchor",
      period: 500,
      ...range,
    });

    setCandlesIfAbsent(candlesKey, [{ time: 1, open: 1, high: 1, low: 1, close: 1 }]);
    setCandlesIfAbsent(candlesKey, [{ time: 2, open: 2, high: 2, low: 2, close: 2 }]);
    setOverlayIfAbsent(overlayKey, {
      role: "anchor",
      period: 500,
      points: [{ time: 1, value: 1, kind: "chart_overlay_ema" }],
    });
    setOverlayIfAbsent(overlayKey, {
      role: "anchor",
      period: 500,
      points: [{ time: 2, value: 2, kind: "chart_overlay_ema" }],
    });

    expect(hasCandles(candlesKey)).toBe(true);
    expect(getCandles(candlesKey)?.[0]?.time).toBe(1);
    expect(hasOverlay(overlayKey)).toBe(true);
    expect(getOverlay(overlayKey)?.points[0]?.value).toBe(1);
  });
});
