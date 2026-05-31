import type { IChartApi, Time } from "lightweight-charts";

import type { ChartBar } from "@/api/types";
import { findBarIndexAtOrBefore, type ChartViewMode } from "@/features/chart/chartViewWindow";
import { dbgMark, PIPELINE_DEBUG_STEPS as DBG } from "@/shared/diagnostics/pipelineDebug";

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

export type WindowSwapRestoreFallbackMode =
  | "anchor_center"
  | "clamp_left"
  | "clamp_right"
  | "no_op";

export type RestoreByTimeAnchorDebugMeta = {
  anchorTime: number;
  previousVisibleFrom: number;
  previousVisibleTo: number;
  visibleBarSpan: number;
  candleCount: number;
  firstTime: number | null;
  lastTime: number | null;
  resolvedFrom: number | null;
  resolvedTo: number | null;
  failureReason: string | null;
  fallbackMode: WindowSwapRestoreFallbackMode;
};

export type RestoreVisibleRangeResult = {
  method: "time-range" | "no-op";
  fallbackMode: WindowSwapRestoreFallbackMode;
  failureReason: string | null;
  logicalFrom?: number;
  logicalTo?: number;
  fromTimeSec?: number;
  toTimeSec?: number;
  debug: RestoreByTimeAnchorDebugMeta;
};

/** @deprecated Window-swap restore never uses fitContent; kept for trade/tail apply only. */
export type LegacyRestoreComputeResult = {
  method: "logical-range" | "no-op";
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

/** Integer bar span from chart logical range (fractional logical widths are common). */
export function visibleBarSpanFromLogicalRange(visible: ChartLogicalRange): number {
  const raw = visible.to - visible.from;
  if (!Number.isFinite(raw) || raw <= 0) {
    return 1;
  }
  return Math.max(1, Math.ceil(raw));
}

export type WindowSwapRestorePlan = {
  fallbackMode: WindowSwapRestoreFallbackMode;
  logicalFrom: number;
  logicalTo: number;
  failureReason: string | null;
};

function clampLogicalRangeToCandleCount(
  logical: { from: number; to: number },
  candleCount: number,
): { from: number; to: number } {
  if (candleCount <= 0) {
    return { from: 0, to: 0 };
  }
  let from = Math.max(0, Math.floor(logical.from));
  let to = Math.min(candleCount, Math.max(from + 1, Math.ceil(logical.to)));
  if (to > candleCount) {
    to = candleCount;
  }
  if (from >= to) {
    from = Math.max(0, to - 1);
  }
  return { from, to };
}

export function buildRestoreByTimeAnchorDebugMeta(
  params: RestoreVisibleRangeAfterWindowShiftParams,
  overrides: Partial<RestoreByTimeAnchorDebugMeta> = {},
): RestoreByTimeAnchorDebugMeta {
  const { anchorTimeSec, newCandles, previousVisible } = params;
  const count = newCandles.length;
  return {
    anchorTime: anchorTimeSec,
    previousVisibleFrom: previousVisible.from,
    previousVisibleTo: previousVisible.to,
    visibleBarSpan: visibleBarSpanFromLogicalRange(previousVisible),
    candleCount: count,
    firstTime: count > 0 ? newCandles[0]!.time : null,
    lastTime: count > 0 ? newCandles[count - 1]!.time : null,
    resolvedFrom: null,
    resolvedTo: null,
    failureReason: null,
    fallbackMode: "no_op",
    ...overrides,
  };
}

/**
 * Plan post-swap restore window: anchor center or edge clamp — never fitContent.
 */
export function computeWindowSwapRestorePlan(
  params: RestoreVisibleRangeAfterWindowShiftParams,
): WindowSwapRestorePlan | null {
  const { anchorTimeSec, newCandles, previousVisible, windowStartIndex = 0, fullLength } =
    params;

  if (newCandles.length === 0) {
    return null;
  }

  const visibleWidth = visibleBarSpanFromLogicalRange(previousVisible);
  const count = newCandles.length;
  const firstTime = newCandles[0]!.time;
  const lastTime = newCandles[count - 1]!.time;

  let fallbackMode: WindowSwapRestoreFallbackMode;
  let failureReason: string | null;
  let logical: { from: number; to: number };

  if (anchorTimeSec < firstTime) {
    fallbackMode = "clamp_left";
    failureReason = "anchor_before_window";
    logical = { from: 0, to: Math.min(count, visibleWidth) };
  } else if (anchorTimeSec > lastTime) {
    fallbackMode = "clamp_right";
    failureReason = "anchor_after_window";
    logical = { from: Math.max(0, count - visibleWidth), to: count };
  } else {
    fallbackMode = "anchor_center";
    failureReason = null;
    const anchorIndex = findBarIndexAtOrBefore(newCandles, anchorTimeSec);
    logical = centeredVisibleLogicalRange(count, anchorIndex, visibleWidth);

    if (windowStartIndex === 0 && logical.from < 0) {
      fallbackMode = "clamp_left";
      failureReason = "global_start_edge";
      logical = { from: 0, to: Math.min(count, visibleWidth) };
    }

    if (
      fullLength !== undefined &&
      windowStartIndex + count >= fullLength &&
      logical.to > count
    ) {
      fallbackMode = "clamp_right";
      failureReason = failureReason ?? "global_end_edge";
      logical = { from: Math.max(0, count - visibleWidth), to: count };
    }
  }

  const clamped = clampLogicalRangeToCandleCount(logical, count);
  return {
    fallbackMode,
    logicalFrom: clamped.from,
    logicalTo: clamped.to,
    failureReason,
  };
}

function resolveRestoreBarTimes(
  newCandles: readonly ChartBar[],
  logical: { from: number; to: number },
): {
  fromTimeSec: number;
  toTimeSec: number;
  resolvedFrom: number;
  resolvedTo: number;
} | null {
  if (newCandles.length === 0) {
    return null;
  }

  const clamped = clampLogicalRangeToCandleCount(logical, newCandles.length);
  const resolvedFrom = clamped.from;
  const resolvedTo = Math.max(
    resolvedFrom,
    Math.min(newCandles.length - 1, clamped.to - 1),
  );
  const fromBar = newCandles[resolvedFrom];
  const toBar = newCandles[resolvedTo];
  if (fromBar === undefined || toBar === undefined) {
    return null;
  }

  const firstTime = newCandles[0]!.time;
  const lastTime = newCandles[newCandles.length - 1]!.time;
  let fromTimeSec = fromBar.time;
  let toTimeSec = toBar.time;
  if (fromTimeSec > toTimeSec) {
    [fromTimeSec, toTimeSec] = [toTimeSec, fromTimeSec];
  }
  fromTimeSec = Math.max(firstTime, Math.min(fromTimeSec, lastTime));
  toTimeSec = Math.max(firstTime, Math.min(toTimeSec, lastTime));
  if (fromTimeSec > toTimeSec) {
    return null;
  }

  return { fromTimeSec, toTimeSec, resolvedFrom, resolvedTo };
}

/** Pure logical plan (tests / diagnostics); window-swap path never returns fitContent. */
export function computeRestoredVisibleLogicalRange(
  params: RestoreVisibleRangeAfterWindowShiftParams,
): LegacyRestoreComputeResult {
  const plan = computeWindowSwapRestorePlan(params);
  if (plan === null) {
    return { method: "no-op" };
  }
  return {
    method: "logical-range",
    logicalFrom: plan.logicalFrom,
    logicalTo: plan.logicalTo,
  };
}

function emitRestoreDebug(
  step: (typeof DBG.chart)[keyof typeof DBG.chart],
  debug: RestoreByTimeAnchorDebugMeta,
): void {
  dbgMark(step, debug as unknown as Record<string, unknown>);
}

/**
 * Window-swap restore: time anchor → clamped setVisibleRange. Never fitContent.
 */
export function restoreVisibleRangeByTimeAnchor(
  chart: IChartApi,
  params: RestoreVisibleRangeAfterWindowShiftParams,
): RestoreVisibleRangeResult {
  const { newCandles, previousVisible } = params;

  if (newCandles.length === 0) {
    const debug = buildRestoreByTimeAnchorDebugMeta(params, {
      fallbackMode: "no_op",
      failureReason: "empty_candles",
    });
    emitRestoreDebug(DBG.chart.restoreByTimeAnchorFailed, debug);
    return {
      method: "no-op",
      fallbackMode: "no_op",
      failureReason: "empty_candles",
      debug,
    };
  }

  const plan = computeWindowSwapRestorePlan(params);
  if (plan === null) {
    const debug = buildRestoreByTimeAnchorDebugMeta(params, {
      fallbackMode: "no_op",
      failureReason: "empty_candles",
    });
    emitRestoreDebug(DBG.chart.restoreByTimeAnchorFailed, debug);
    return {
      method: "no-op",
      fallbackMode: "no_op",
      failureReason: "empty_candles",
      debug,
    };
  }

  const times = resolveRestoreBarTimes(newCandles, {
    from: plan.logicalFrom,
    to: plan.logicalTo,
  });

  if (times === null) {
    const debug = buildRestoreByTimeAnchorDebugMeta(params, {
      fallbackMode: plan.fallbackMode,
      failureReason: "invalid_resolved_range",
      resolvedFrom: plan.logicalFrom,
      resolvedTo: plan.logicalTo,
    });
    emitRestoreDebug(DBG.chart.restoreByTimeAnchorFailed, debug);
    return {
      method: "no-op",
      fallbackMode: plan.fallbackMode,
      failureReason: "invalid_resolved_range",
      logicalFrom: plan.logicalFrom,
      logicalTo: plan.logicalTo,
      debug,
    };
  }

  chart.timeScale().setVisibleRange({
    from: times.fromTimeSec as Time,
    to: times.toTimeSec as Time,
  });

  const debug = buildRestoreByTimeAnchorDebugMeta(params, {
    fallbackMode: plan.fallbackMode,
    failureReason: plan.failureReason,
    resolvedFrom: times.resolvedFrom,
    resolvedTo: times.resolvedTo,
  });
  emitRestoreDebug(DBG.chart.restoreByTimeAnchorApplied, debug);

  return {
    method: "time-range",
    fallbackMode: plan.fallbackMode,
    failureReason: plan.failureReason,
    logicalFrom: plan.logicalFrom,
    logicalTo: plan.logicalTo,
    fromTimeSec: times.fromTimeSec,
    toTimeSec: times.toTimeSec,
    debug,
  };
}

/** Apply restored visible range after Context-driven setData (time-based only). */
export function restoreVisibleRangeAfterWindowShift(
  chart: IChartApi,
  params: RestoreVisibleRangeAfterWindowShiftParams,
): RestoreVisibleRangeResult {
  return restoreVisibleRangeByTimeAnchor(chart, params);
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
