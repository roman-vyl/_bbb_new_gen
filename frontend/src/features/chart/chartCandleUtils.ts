import type { CandlestickData, Time } from "lightweight-charts";

import type { ChartBar } from "@/api/types";

/** Bars on each side of trade entry when focusing the chart (logical-range helpers). */
export const TRADE_FOCUS_VISIBLE_BARS = 15;

const DEFAULT_CANDLE_INTERVAL_SEC = 300;

/**
 * Infer bar spacing in seconds from loaded candles (median of positive deltas).
 * Falls back to 5m when the series is too short or irregular.
 */
export function inferCandleIntervalSec(candles: ChartBar[]): number {
  if (candles.length < 2) {
    return DEFAULT_CANDLE_INTERVAL_SEC;
  }

  const deltas: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const delta = candles[i].time - candles[i - 1].time;
    if (delta > 0) {
      deltas.push(delta);
    }
  }

  if (deltas.length === 0) {
    return DEFAULT_CANDLE_INTERVAL_SEC;
  }

  deltas.sort((a, b) => a - b);
  const mid = Math.floor(deltas.length / 2);
  return deltas.length % 2 === 0 ? (deltas[mid - 1] + deltas[mid]) / 2 : deltas[mid];
}

/** Half-width of the visible time window when focusing a trade (seconds). */
export function tradeFocusHalfWindowSec(
  candles: ChartBar[],
  visibleBars: number = TRADE_FOCUS_VISIBLE_BARS,
): number {
  const intervalSec = inferCandleIntervalSec(candles);
  return visibleBars * intervalSec;
}

export function toCandlestickSeriesData(candles: ChartBar[]): CandlestickData<Time>[] {
  return candles.map((bar) => ({
    time: bar.time as Time,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
  }));
}
