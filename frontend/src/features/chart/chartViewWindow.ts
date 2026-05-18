import type { ChartBar, ChartEmaOverlay, IndicatorPoint } from "@/api/types";

export const CHART_RENDER_BAR_LIMIT = 5000;

export type TimeBar = { time: number };

export function sliceTailBars<T extends TimeBar>(bars: readonly T[], limit: number): T[] {
  if (bars.length <= limit) {
    return [...bars];
  }
  return bars.slice(bars.length - limit);
}

export function findBarIndexAtOrBefore(bars: readonly TimeBar[], timeSec: number): number {
  if (bars.length === 0) {
    return 0;
  }
  if (timeSec < bars[0].time) {
    return 0;
  }

  let lo = 0;
  let hi = bars.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (bars[mid].time <= timeSec) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

export function sliceAroundTime<T extends TimeBar>(
  bars: readonly T[],
  centerTimeSec: number,
  limit: number,
): T[] {
  if (bars.length === 0) {
    return [];
  }

  const windowSize = Math.min(limit, bars.length);
  const centerIdx = findBarIndexAtOrBefore(bars, centerTimeSec);
  const half = Math.floor(windowSize / 2);
  let start = centerIdx - half;
  let end = start + windowSize;

  if (start < 0) {
    start = 0;
    end = windowSize;
  }
  if (end > bars.length) {
    end = bars.length;
    start = Math.max(0, end - windowSize);
  }

  return bars.slice(start, end);
}

export function sliceEmaToCandleWindow(
  ema: readonly IndicatorPoint[],
  candles: readonly ChartBar[],
): IndicatorPoint[] {
  if (candles.length === 0) {
    return [];
  }
  const fromSec = candles[0].time;
  const toSec = candles[candles.length - 1].time;
  return ema.filter((point) => point.time >= fromSec && point.time <= toSec);
}

export function sliceOverlaysToCandleWindow(
  overlays: readonly ChartEmaOverlay[],
  candles: readonly ChartBar[],
): ChartEmaOverlay[] {
  return overlays.map((overlay) => ({
    ...overlay,
    points: sliceEmaToCandleWindow(overlay.points, candles),
  }));
}

export type BuildChartViewWindowParams = {
  candles: readonly ChartBar[];
  emaOverlays: readonly ChartEmaOverlay[];
  selectedTradeEntryTimeMs: number | null;
  limit?: number;
};

export type ChartViewWindow = {
  candles: ChartBar[];
  emaOverlays: ChartEmaOverlay[];
};

export function buildChartViewWindow({
  candles,
  emaOverlays,
  selectedTradeEntryTimeMs,
  limit = CHART_RENDER_BAR_LIMIT,
}: BuildChartViewWindowParams): ChartViewWindow {
  const viewCandles =
    selectedTradeEntryTimeMs === null
      ? sliceTailBars(candles, limit)
      : sliceAroundTime(candles, Math.floor(selectedTradeEntryTimeMs / 1000), limit);

  return {
    candles: viewCandles,
    emaOverlays: sliceOverlaysToCandleWindow(emaOverlays, viewCandles),
  };
}
