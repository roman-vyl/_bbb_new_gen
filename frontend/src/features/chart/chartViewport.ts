import type { IChartApi, Time } from "lightweight-charts";

import type { ChartBar } from "@/api/types";
import { findBarIndexAtOrBefore, type ChartViewMode } from "@/features/chart/chartViewWindow";

/** Bars visible on screen when focusing a trade (subset of loaded chunk). */
export const TRADE_FOCUS_VIEWPORT_BARS = 120;

export type ApplyChartViewportParams = {
  chart: IChartApi;
  mode: ChartViewMode;
  candles: ChartBar[];
  centerTimeSec: number | null;
  viewportBars?: number;
};

export type ChartViewportResult = {
  method: "fitContent" | "center-on-trade";
  centerIndex?: number;
  logicalFrom?: number;
  logicalTo?: number;
  fromTimeSec?: number;
  toTimeSec?: number;
};

export function centeredVisibleLogicalRange(
  candleCount: number,
  centerIndex: number,
  viewportBars: number = TRADE_FOCUS_VIEWPORT_BARS,
): { from: number; to: number } {
  if (candleCount <= 0) {
    return { from: 0, to: 0 };
  }

  const visible = Math.min(viewportBars, candleCount);
  const half = Math.floor(visible / 2);
  let from = centerIndex - half;
  let to = from + visible;

  if (from < 0) {
    from = 0;
    to = visible;
  }
  if (to > candleCount) {
    to = candleCount;
    from = Math.max(0, to - visible);
  }

  return { from, to };
}

/** Tail: fit all loaded bars. Trade focus: center viewport on entry bar. */
export function applyChartViewport({
  chart,
  mode,
  candles,
  centerTimeSec,
  viewportBars = TRADE_FOCUS_VIEWPORT_BARS,
}: ApplyChartViewportParams): ChartViewportResult {
  const timeScale = chart.timeScale();

  if (mode !== "around-trade" || centerTimeSec === null || candles.length === 0) {
    timeScale.fitContent();
    return { method: "fitContent" };
  }

  const centerIndex = findBarIndexAtOrBefore(candles, centerTimeSec);
  const logical = centeredVisibleLogicalRange(candles.length, centerIndex, viewportBars);
  const fromBar = candles[logical.from]!;
  const toBar = candles[Math.min(candles.length - 1, Math.max(logical.from, logical.to - 1))]!;

  timeScale.setVisibleRange({
    from: fromBar.time as Time,
    to: toBar.time as Time,
  });

  return {
    method: "center-on-trade",
    centerIndex,
    logicalFrom: logical.from,
    logicalTo: logical.to,
    fromTimeSec: fromBar.time,
    toTimeSec: toBar.time,
  };
}

function visibleTimeRangeToSeconds(
  range: { from: Time; to: Time } | null,
): { from: number; to: number } | null {
  if (!range) {
    return null;
  }
  const from = typeof range.from === "number" ? range.from : null;
  const to = typeof range.to === "number" ? range.to : null;
  if (from === null || to === null) {
    return null;
  }
  return { from, to };
}

export function readChartViewportDebug(chart: IChartApi): {
  visibleLogical: { from: number; to: number } | null;
  visibleTime: { from: number; to: number } | null;
} {
  const timeScale = chart.timeScale();
  return {
    visibleLogical: timeScale.getVisibleLogicalRange(),
    visibleTime: visibleTimeRangeToSeconds(timeScale.getVisibleRange()),
  };
}

export function isTradeCenterVisible(
  candles: ChartBar[],
  centerIndex: number,
  visibleTime: { from: number; to: number } | null,
): boolean {
  if (!visibleTime || candles.length === 0) {
    return false;
  }
  const centerTime = candles[centerIndex]?.time;
  if (centerTime === undefined) {
    return false;
  }
  return centerTime >= visibleTime.from && centerTime <= visibleTime.to;
}
