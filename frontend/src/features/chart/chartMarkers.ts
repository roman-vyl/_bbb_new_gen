import type { SeriesMarker, Time } from "lightweight-charts";

import { msToChartTime, type TradeRecord } from "@/api/types";

export function buildTradeMarkers(
  trades: TradeRecord[],
  selectedTradeId: number | null,
): SeriesMarker<Time>[] {
  const markers: SeriesMarker<Time>[] = [];

  for (const trade of trades) {
    const highlighted = selectedTradeId === trade.trade_id;
    const entryTime = msToChartTime(trade.entry_time_ms) as Time;

    markers.push({
      time: entryTime,
      position: trade.direction === "long" ? "belowBar" : "aboveBar",
      color: highlighted ? "#fbbf24" : trade.direction === "long" ? "#22c55e" : "#ef4444",
      shape: trade.direction === "long" ? "arrowUp" : "arrowDown",
      text: highlighted ? `E#${trade.trade_id}` : "E",
    });

    if (trade.status === "closed" && trade.exit_time_ms !== null) {
      const exitTime = msToChartTime(trade.exit_time_ms) as Time;
      markers.push({
        time: exitTime,
        position: trade.direction === "long" ? "aboveBar" : "belowBar",
        color: highlighted ? "#fbbf24" : "#94a3b8",
        shape: "circle",
        text: highlighted ? `X#${trade.trade_id}` : "X",
      });
    }
  }

  return markers.sort((a, b) => (a.time as number) - (b.time as number));
}

export function candleRangeMs(candles: { time: number }[]): { min: number; max: number } | null {
  if (candles.length === 0) return null;
  const min = candles[0].time * 1000;
  const max = candles[candles.length - 1].time * 1000;
  return { min, max };
}

export function tradeOutsideCandleRange(
  entryTimeMs: number,
  range: { min: number; max: number } | null,
): boolean {
  if (!range) return false;
  return entryTimeMs < range.min || entryTimeMs > range.max;
}
