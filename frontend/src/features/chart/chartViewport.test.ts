import { describe, expect, it } from "vitest";

import {
  centeredVisibleLogicalRange,
  isTradeCenterVisible,
  TRADE_FOCUS_VIEWPORT_BARS,
} from "@/features/chart/chartViewport";
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
    const range = centeredVisibleLogicalRange(5000, 2500, 120);
    expect(2500).toBeGreaterThanOrEqual(range.from);
    expect(2500).toBeLessThan(range.to);
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
