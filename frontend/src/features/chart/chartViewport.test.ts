import { describe, expect, it, vi } from "vitest";

import {
  buildTradeFocusIntentKey,
  centeredVisibleLogicalRange,
  computeRestoredVisibleLogicalRange,
  computeWindowSwapRestorePlan,
  isStaleViewportCommand,
  isTradeCenterVisible,
  restoreVisibleRangeAfterWindowShift,
  restoreVisibleRangeByTimeAnchor,
  shouldBlockViewportApplyWhilePendingRestore,
  shouldScheduleTradeViewportApply,
  shouldSuppressPanShiftRequest,
  tradeFocusIntentChanged,
  TRADE_FOCUS_VIEWPORT_BARS,
  visibleBarSpanFromLogicalRange,
} from "@/features/chart/chartViewport";
import type { IChartApi } from "lightweight-charts";
import { findBarIndexAtOrBefore } from "@/features/chart/chartViewWindow";
import type { ChartBar } from "@/api/types";

function makeBars(count: number, startTime = 1_000_000): ChartBar[] {
  return Array.from({ length: count }, (_, i) => ({
    time: startTime + i * 300,
    open: 100,
    high: 101,
    low: 99,
    close: 100.5,
  }));
}

describe("centeredVisibleLogicalRange", () => {
  it("centers index in the middle of viewport", () => {
    const range = centeredVisibleLogicalRange(5000, 2500, 400);
    expect(2500).toBeGreaterThanOrEqual(range.from);
    expect(2500).toBeLessThan(range.to);
  });

  it("uses 400 bars default trade focus", () => {
    expect(TRADE_FOCUS_VIEWPORT_BARS).toBe(400);
  });
});

describe("isTradeCenterVisible", () => {
  it("detects when center time is inside visible time window", () => {
    const candles = makeBars(5000, 1_000_000);
    const centerIdx = 2500;
    const range = centeredVisibleLogicalRange(candles.length, centerIdx, TRADE_FOCUS_VIEWPORT_BARS);
    const fromBar = candles[range.from]!;
    const toBar = candles[range.to - 1]!;
    expect(
      isTradeCenterVisible(candles, centerIdx, { from: fromBar.time, to: toBar.time }),
    ).toBe(true);
    expect(findBarIndexAtOrBefore(candles, candles[centerIdx]!.time)).toBe(centerIdx);
  });
});

describe("visibleBarSpanFromLogicalRange", () => {
  it("ceil fractional logical widths so bar indices stay integral", () => {
    expect(visibleBarSpanFromLogicalRange({ from: 10.2, to: 46.8 })).toBe(37);
  });

  it("falls back to 1 for invalid span", () => {
    expect(visibleBarSpanFromLogicalRange({ from: 10, to: 10 })).toBe(1);
    expect(visibleBarSpanFromLogicalRange({ from: NaN, to: 5 })).toBe(1);
  });
});

function mockChartForRestore() {
  const fitContent = vi.fn(() => {
    throw new Error("fitContent must not run during window-swap restore");
  });
  const setVisibleRange = vi.fn();
  const setVisibleLogicalRange = vi.fn();
  const chart = {
    timeScale: () => ({
      fitContent,
      setVisibleRange,
      setVisibleLogicalRange,
    }),
  } as unknown as IChartApi;
  return { chart, fitContent, setVisibleRange, setVisibleLogicalRange };
}

describe("window-swap restore never calls fitContent", () => {
  it("anchor inside window restores around anchor time", () => {
    const { chart, fitContent, setVisibleRange } = mockChartForRestore();
    const newCandles = makeBars(100);
    const anchorTimeSec = newCandles[50]!.time;
    const result = restoreVisibleRangeByTimeAnchor(chart, {
      anchorTimeSec,
      newCandles,
      previousVisible: { from: 40, to: 80 },
    });
    expect(result.method).toBe("time-range");
    expect(result.fallbackMode).toBe("anchor_center");
    expect(fitContent).not.toHaveBeenCalled();
    expect(setVisibleRange).toHaveBeenCalledTimes(1);
    const range = setVisibleRange.mock.calls[0]![0] as { from: number; to: number };
    expect(range.from).toBeGreaterThanOrEqual(newCandles[0]!.time);
    expect(range.to).toBeLessThanOrEqual(newCandles[99]!.time);
  });

  it("anchor left of window clamps to left edge with visible span", () => {
    const { chart, fitContent, setVisibleRange } = mockChartForRestore();
    const newCandles = makeBars(100, 1_700_000_000);
    const result = restoreVisibleRangeByTimeAnchor(chart, {
      anchorTimeSec: newCandles[0]!.time - 10_000,
      newCandles,
      previousVisible: { from: 10, to: 50 },
    });
    expect(result.method).toBe("time-range");
    expect(result.fallbackMode).toBe("clamp_left");
    expect(fitContent).not.toHaveBeenCalled();
    expect(setVisibleRange).toHaveBeenCalledTimes(1);
    const range = setVisibleRange.mock.calls[0]![0] as { from: number; to: number };
    expect(range.from).toBe(newCandles[0]!.time);
  });

  it("anchor right of window clamps to right edge with visible span", () => {
    const { chart, fitContent, setVisibleRange } = mockChartForRestore();
    const newCandles = makeBars(100, 1_700_000_000);
    const result = restoreVisibleRangeByTimeAnchor(chart, {
      anchorTimeSec: newCandles[99]!.time + 10_000,
      newCandles,
      previousVisible: { from: 10, to: 50 },
    });
    expect(result.method).toBe("time-range");
    expect(result.fallbackMode).toBe("clamp_right");
    expect(fitContent).not.toHaveBeenCalled();
    expect(setVisibleRange).toHaveBeenCalledTimes(1);
    const range = setVisibleRange.mock.calls[0]![0] as { from: number; to: number };
    expect(range.to).toBe(newCandles[99]!.time);
  });

  it("empty candles is no-op without throw or fitContent", () => {
    const { chart, fitContent, setVisibleRange } = mockChartForRestore();
    const result = restoreVisibleRangeAfterWindowShift(chart, {
      anchorTimeSec: 0,
      newCandles: [],
      previousVisible: { from: 0, to: 40 },
    });
    expect(result.method).toBe("no-op");
    expect(result.fallbackMode).toBe("no_op");
    expect(result.debug.failureReason).toBe("empty_candles");
    expect(fitContent).not.toHaveBeenCalled();
    expect(setVisibleRange).not.toHaveBeenCalled();
  });

  it("fractional logical range does not throw and never fitContent", () => {
    const { chart, fitContent, setVisibleRange } = mockChartForRestore();
    const newCandles = makeBars(500, 1_700_000_000);
    const anchorTimeSec = newCandles[250]!.time;
    expect(() =>
      restoreVisibleRangeByTimeAnchor(chart, {
        anchorTimeSec,
        newCandles,
        previousVisible: { from: 120.4, to: 380.9 },
        windowStartIndex: 50_000,
        fullLength: 200_000,
      }),
    ).not.toThrow();
    expect(fitContent).not.toHaveBeenCalled();
    expect(setVisibleRange).toHaveBeenCalledTimes(1);
  });

  it("repeated left shifts at historical edge stay clamp_left without fitContent", () => {
    const { chart, fitContent, setVisibleRange } = mockChartForRestore();
    const newCandles = makeBars(50, 1_000_000);
    for (let shift = 0; shift < 5; shift += 1) {
      const plan = computeWindowSwapRestorePlan({
        anchorTimeSec: 500_000,
        newCandles,
        previousVisible: { from: 12.3, to: 48.7 },
        windowStartIndex: 0,
        fullLength: 200_000,
      });
      expect(plan?.fallbackMode).toBe("clamp_left");
      restoreVisibleRangeByTimeAnchor(chart, {
        anchorTimeSec: 500_000,
        newCandles,
        previousVisible: { from: 12.3, to: 48.7 },
        windowStartIndex: 0,
        fullLength: 200_000,
      });
    }
    expect(fitContent).not.toHaveBeenCalled();
    expect(setVisibleRange).toHaveBeenCalledTimes(5);
  });
});

describe("computeRestoredVisibleLogicalRange", () => {
  it("restores around anchor time in new window", () => {
    const oldCandles = makeBars(100, 1_000_000);
    const newCandles = makeBars(100, 1_000_000 + 50 * 300);
    const anchorTimeSec = oldCandles[50]!.time;
    const result = computeRestoredVisibleLogicalRange({
      anchorTimeSec,
      newCandles,
      previousVisible: { from: 40, to: 80 },
    });
    expect(result.method).toBe("logical-range");
    expect(result.logicalFrom).toBeDefined();
    expect(result.logicalTo! - result.logicalFrom!).toBe(40);
  });

  it("clamps at global start", () => {
    const newCandles = makeBars(50, 1_000_000);
    const result = computeRestoredVisibleLogicalRange({
      anchorTimeSec: newCandles[0]!.time,
      newCandles,
      previousVisible: { from: 10, to: 30 },
      windowStartIndex: 0,
      fullLength: 500,
    });
    expect(result.method).toBe("logical-range");
    expect(result.logicalFrom).toBe(0);
  });

  it("returns no-op plan on empty candles (never fitContent)", () => {
    const result = computeRestoredVisibleLogicalRange({
      anchorTimeSec: 0,
      newCandles: [],
      previousVisible: { from: 0, to: 0 },
    });
    expect(result.method).toBe("no-op");
  });
});

describe("shouldSuppressPanShiftRequest", () => {
  it("suppresses during programmatic viewport apply", () => {
    expect(shouldSuppressPanShiftRequest(true, 0)).toBe(true);
  });

  it("suppresses until deadline after restore", () => {
    expect(shouldSuppressPanShiftRequest(false, Date.now() + 500, Date.now())).toBe(true);
    expect(shouldSuppressPanShiftRequest(false, Date.now() - 1, Date.now())).toBe(false);
  });
});

describe("buildTradeFocusIntentKey", () => {
  it("excludes render-window bounds from trade focus intent", () => {
    const intentA = buildTradeFocusIntentKey({
      selectedTradeId: 1,
      selectedVariantKey: "exp_a",
      chartViewMode: "around-trade",
      centerTimeSec: 1_100,
    });
    const intentB = buildTradeFocusIntentKey({
      selectedTradeId: 1,
      selectedVariantKey: "exp_a",
      chartViewMode: "around-trade",
      centerTimeSec: 1_100,
    });
    expect(intentA).toBe("1|exp_a|around-trade|1100");
    expect(intentA).toBe(intentB);
  });

  it("changes when selected trade or center changes", () => {
    const base = {
      selectedVariantKey: "exp_a",
      chartViewMode: "around-trade" as const,
      centerTimeSec: 1_100,
    };
    const trade1 = buildTradeFocusIntentKey({ ...base, selectedTradeId: 1 });
    const trade2 = buildTradeFocusIntentKey({ ...base, selectedTradeId: 2 });
    expect(trade1).not.toBe(trade2);
  });
});

describe("shouldScheduleTradeViewportApply", () => {
  it("skips when user pan is active and render window bounds changed but intent did not", () => {
    const intentKey = buildTradeFocusIntentKey({
      selectedTradeId: 1,
      selectedVariantKey: "exp_a",
      chartViewMode: "around-trade",
      centerTimeSec: 1_100,
    });
    expect(tradeFocusIntentChanged(intentKey, intentKey)).toBe(false);
    expect(
      shouldScheduleTradeViewportApply({
        userPanActive: true,
        tradeFocusIntentChanged: false,
      }),
    ).toBe(false);
  });

  it("allows apply when trade focus intent changes even during user pan", () => {
    expect(
      shouldScheduleTradeViewportApply({
        userPanActive: true,
        tradeFocusIntentChanged: true,
      }),
    ).toBe(true);
  });

  it("skips bounds-only updates without user pan", () => {
    expect(
      shouldScheduleTradeViewportApply({
        userPanActive: false,
        tradeFocusIntentChanged: false,
      }),
    ).toBe(false);
  });
});

describe("viewport command guards", () => {
  it("blocks apply while pending restore is active", () => {
    expect(shouldBlockViewportApplyWhilePendingRestore(null)).toBe(false);
    expect(shouldBlockViewportApplyWhilePendingRestore({ shiftSeq: 1 })).toBe(true);
  });

  it("detects stale viewport command seq", () => {
    expect(isStaleViewportCommand(2, 3)).toBe(true);
    expect(isStaleViewportCommand(3, 3)).toBe(false);
  });
});
