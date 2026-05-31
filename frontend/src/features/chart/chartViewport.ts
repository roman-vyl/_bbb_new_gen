import type { IChartApi, Time } from "lightweight-charts";

import type { ChartBar } from "@/api/types";
import { findBarIndexAtOrBefore, type ChartViewMode } from "@/features/chart/chartViewWindow";

/** Bars visible on screen when focusing a trade (subset of loaded chunk). */
export const TRADE_FOCUS_VIEWPORT_BARS = 400;

export type ChartLogicalRange = { from: number; to: number };

export type RestoreVisibleRangeAfterWindowShiftParams = {
  anchorTimeSec: number;
  newCandles: ChartBar[];
  previousVisible: ChartLogicalRange;
  windowStartIndex?: number;
  fullLength?: number;
};

export type RestoreVisibleRangeResult = {
  method: "time-range" | "logical-range" | "fitContent";
  logicalFrom?: number;
  logicalTo?: number;
};

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

/** Resolve anchor bar time from visible logical range (center bar). */
export function resolveAnchorTimeFromVisibleRange(
  visible: ChartLogicalRange,
  candles: readonly ChartBar[],
): number | null {
  if (candles.length === 0) {
    return null;
  }
  const centerLogical = Math.floor((visible.from + visible.to) / 2);
  const idx = Math.max(0, Math.min(Math.floor(centerLogical), candles.length - 1));
  return candles[idx]?.time ?? null;
}

/**
 * Compute restored visible logical range after render window shift.
 * Primary: time anchor; fallbacks: nearest bar, edge clamp, fitContent.
 */
export function computeRestoredVisibleLogicalRange(
  params: RestoreVisibleRangeAfterWindowShiftParams,
): RestoreVisibleRangeResult {
  const { anchorTimeSec, newCandles, previousVisible, windowStartIndex = 0, fullLength } =
    params;

  if (newCandles.length === 0) {
    return { method: "fitContent" };
  }

  const visibleWidth = Math.max(1, previousVisible.to - previousVisible.from);
  let anchorIndex = findBarIndexAtOrBefore(newCandles, anchorTimeSec);

  if (!Number.isFinite(anchorIndex) || anchorIndex < 0) {
    anchorIndex = 0;
  }
  if (anchorIndex >= newCandles.length) {
    anchorIndex = newCandles.length - 1;
  }

  let logical = centeredVisibleLogicalRange(newCandles.length, anchorIndex, visibleWidth);

  if (windowStartIndex === 0 && logical.from < 0) {
    logical = { from: 0, to: Math.min(newCandles.length, visibleWidth) };
  }

  if (
    fullLength !== undefined &&
    windowStartIndex + newCandles.length >= fullLength &&
    logical.to > newCandles.length
  ) {
    logical = {
      from: Math.max(0, newCandles.length - visibleWidth),
      to: newCandles.length,
    };
  }

  if (
    !Number.isFinite(logical.from) ||
    !Number.isFinite(logical.to) ||
    logical.from >= logical.to ||
    logical.to > newCandles.length
  ) {
    return { method: "fitContent" };
  }

  return {
    method: "logical-range",
    logicalFrom: logical.from,
    logicalTo: logical.to,
  };
}

/**
 * Primary restore path: map time anchor to visible time range (not pre-swap logical indexes).
 */
export function restoreVisibleRangeByTimeAnchor(
  chart: IChartApi,
  params: RestoreVisibleRangeAfterWindowShiftParams,
): RestoreVisibleRangeResult {
  const { anchorTimeSec, newCandles, previousVisible, windowStartIndex = 0, fullLength } = params;
  const timeScale = chart.timeScale();

  if (newCandles.length === 0) {
    timeScale.fitContent();
    return { method: "fitContent" };
  }

  const visibleWidth = Math.max(1, previousVisible.to - previousVisible.from);
  let anchorIndex = findBarIndexAtOrBefore(newCandles, anchorTimeSec);
  if (!Number.isFinite(anchorIndex) || anchorIndex < 0) {
    anchorIndex = 0;
  }
  if (anchorIndex >= newCandles.length) {
    anchorIndex = newCandles.length - 1;
  }

  let fromIdx = anchorIndex - Math.floor(visibleWidth / 2);
  let toIdx = fromIdx + visibleWidth;

  if (fromIdx < 0) {
    fromIdx = 0;
    toIdx = Math.min(newCandles.length, visibleWidth);
  }
  if (toIdx > newCandles.length) {
    toIdx = newCandles.length;
    fromIdx = Math.max(0, toIdx - visibleWidth);
  }

  if (windowStartIndex === 0 && fromIdx < 0) {
    fromIdx = 0;
    toIdx = Math.min(newCandles.length, visibleWidth);
  }

  if (
    fullLength !== undefined &&
    windowStartIndex + newCandles.length >= fullLength &&
    toIdx > newCandles.length
  ) {
    toIdx = newCandles.length;
    fromIdx = Math.max(0, toIdx - visibleWidth);
  }

  if (fromIdx >= toIdx || toIdx > newCandles.length) {
    timeScale.fitContent();
    return { method: "fitContent" };
  }

  const fromBar = newCandles[fromIdx]!;
  const toBar = newCandles[Math.min(newCandles.length - 1, toIdx - 1)]!;
  timeScale.setVisibleRange({
    from: fromBar.time as Time,
    to: toBar.time as Time,
  });

  return {
    method: "time-range",
    logicalFrom: fromIdx,
    logicalTo: toIdx,
  };
}

/** Apply restored visible range after Context-driven setData. */
export function restoreVisibleRangeAfterWindowShift(
  chart: IChartApi,
  params: RestoreVisibleRangeAfterWindowShiftParams,
): RestoreVisibleRangeResult {
  const timeResult = restoreVisibleRangeByTimeAnchor(chart, params);
  if (timeResult.method === "time-range") {
    return timeResult;
  }

  const result = computeRestoredVisibleLogicalRange(params);
  const timeScale = chart.timeScale();

  if (result.method === "fitContent" || result.logicalFrom === undefined || result.logicalTo === undefined) {
    timeScale.fitContent();
    return result;
  }

  timeScale.setVisibleLogicalRange({
    from: result.logicalFrom,
    to: result.logicalTo,
  });

  return result;
}

/** True when a programmatic viewport restore should suppress pan shift requests. */
export function shouldSuppressPanShiftRequest(
  isApplyingViewport: boolean,
  suppressUntilMs: number,
  nowMs: number = Date.now(),
): boolean {
  return isApplyingViewport || nowMs < suppressUntilMs;
}

export type TradeFocusIntentKeyParams = {
  selectedTradeId: number | null;
  selectedVariantKey: string;
  chartViewMode: ChartViewMode;
  centerTimeSec: number | null;
};

/** Whether programmatic viewport apply must wait until restore-after-shift completes. */
export function shouldBlockViewportApplyWhilePendingRestore(
  pendingRestore: unknown,
): boolean {
  return pendingRestore !== null;
}

/** True when a scheduled viewport command was superseded by a newer pan/shift/trade change. */
export function isStaleViewportCommand(requestedSeq: number, currentSeq: number): boolean {
  return requestedSeq !== currentSeq;
}

/** User trade-focus intent — excludes render-window bounds (first/last/count). */
export function buildTradeFocusIntentKey(params: TradeFocusIntentKeyParams): string {
  return `${params.selectedTradeId ?? "none"}|${params.selectedVariantKey}|${params.chartViewMode}|${params.centerTimeSec ?? "none"}`;
}

export function tradeFocusIntentChanged(
  previousIntentKey: string | null,
  nextIntentKey: string,
): boolean {
  return previousIntentKey !== nextIntentKey;
}

/** Whether programmatic trade/tail viewport apply should run (not restore-after-shift). */
export function shouldScheduleTradeViewportApply(input: {
  userPanActive: boolean;
  tradeFocusIntentChanged: boolean;
}): boolean {
  if (!input.tradeFocusIntentChanged) {
    return false;
  }
  if (input.userPanActive && !input.tradeFocusIntentChanged) {
    return false;
  }
  return true;
}
