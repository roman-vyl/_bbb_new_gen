import { describe, expect, it } from "vitest";

import {
  createChartDataWindowManager,
  CHART_RENDER_SAFE_ZONE,
  CHART_RENDER_WINDOW_SIZE,
} from "@/features/chart/chartDataWindowManager";
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

describe("chartDataWindowManager", () => {
  it("starts with tail window on reset", () => {
    const manager = createChartDataWindowManager({
      renderWindowSize: 100,
      safeZoneSize: 20,
    });
    manager.reset(500);
    manager.buildTailWindow();
    expect(manager.getWindowIndices()).toEqual({ windowStartIndex: 400, windowEndIndex: 500 });
    expect(manager.sliceCandles(makeBars(500))).toHaveLength(100);
  });

  it("buildWindowAroundIndex centers entry", () => {
    const manager = createChartDataWindowManager({ renderWindowSize: 40, safeZoneSize: 10 });
    manager.reset(200);
    manager.buildWindowAroundIndex(100);
    const { windowStartIndex, windowEndIndex } = manager.getWindowIndices();
    expect(windowEndIndex - windowStartIndex).toBe(40);
    expect(100).toBeGreaterThanOrEqual(windowStartIndex);
    expect(100).toBeLessThan(windowEndIndex);
  });

  it("shouldRebuildForTrade is false when entry is in safe zone", () => {
    const manager = createChartDataWindowManager({ renderWindowSize: 100, safeZoneSize: 20 });
    manager.reset(500);
    manager.buildWindowAroundIndex(250);
    expect(manager.shouldRebuildForTrade(250)).toBe(false);
    expect(manager.shouldRebuildForTrade(30)).toBe(true);
    expect(manager.shouldRebuildForTrade(480)).toBe(true);
  });

  it("maybeShiftWindowForVisibleRange no-ops inside safe zone", () => {
    const manager = createChartDataWindowManager({ renderWindowSize: 100, safeZoneSize: 20 });
    manager.reset(500);
    manager.buildWindowAroundIndex(250);
    const before = manager.getWindowIndices();
    expect(manager.maybeShiftWindowForVisibleRange({ from: 30, to: 70 })).toBeNull();
    expect(manager.getWindowIndices()).toEqual(before);
  });

  it("maybeShiftWindowForVisibleRange shifts right near end", () => {
    const manager = createChartDataWindowManager({ renderWindowSize: 100, safeZoneSize: 20 });
    manager.reset(500);
    manager.buildWindowAroundIndex(150);
    const shifted = manager.maybeShiftWindowForVisibleRange({ from: 70, to: 95 });
    expect(shifted).not.toBeNull();
    expect(manager.getWindowIndices().windowStartIndex).toBeGreaterThan(0);
  });

  it("maybeShiftWindowForVisibleRange shifts left near start", () => {
    const manager = createChartDataWindowManager({ renderWindowSize: 100, safeZoneSize: 20 });
    manager.reset(500);
    manager.buildWindowAroundIndex(350);
    const beforeStart = manager.getWindowIndices().windowStartIndex;
    const shifted = manager.maybeShiftWindowForVisibleRange({ from: 5, to: 30 });
    expect(shifted).not.toBeNull();
    expect(manager.getWindowIndices().windowStartIndex).toBeLessThan(beforeStart);
  });

  it("does not shift past global end", () => {
    const manager = createChartDataWindowManager({ renderWindowSize: 100, safeZoneSize: 20 });
    manager.reset(150);
    manager.buildTailWindow();
    expect(manager.maybeShiftWindowForVisibleRange({ from: 70, to: 99 })).toBeNull();
    expect(manager.getWindowIndices().windowEndIndex).toBe(150);
  });

  it("uses default constants", () => {
    expect(CHART_RENDER_WINDOW_SIZE).toBe(25_000);
    expect(CHART_RENDER_SAFE_ZONE).toBe(5_000);
  });

  it("does not shift when already repositioned to safe center", () => {
    const manager = createChartDataWindowManager({ renderWindowSize: 100, safeZoneSize: 20 });
    manager.reset(500);
    manager.buildWindowAroundIndex(250);
    expect(manager.maybeShiftWindowForVisibleRange({ from: 35, to: 65 })).toBeNull();
    const shifted = manager.maybeShiftWindowForVisibleRange({ from: 5, to: 15 });
    expect(shifted).not.toBeNull();
    expect(manager.maybeShiftWindowForVisibleRange({ from: 40, to: 60 })).toBeNull();
  });
});
