import type { SeriesMarker, Time } from "lightweight-charts";

import { msToChartTime, type TradeRecord } from "@/api/types";
import { tradeIdsEqual } from "@/features/chart/tradeLookup";

export type ExitReasonMarkerKind =
  | "stop_loss"
  | "take_profit"
  | "signal"
  | "break_even"
  | "unknown"
  | "open";

export const EXIT_MARKER_LEGEND: {
  kind: ExitReasonMarkerKind | "entry";
  label: string;
  description: string;
}[] = [
  { kind: "entry", label: "E", description: "Entry (closed trade)" },
  { kind: "open", label: "OPEN", description: "Entry (open trade, no exit marker)" },
  { kind: "stop_loss", label: "SL", description: "Exit · stop_loss:*" },
  { kind: "take_profit", label: "TP", description: "Exit · take_profit:*" },
  { kind: "signal", label: "SIG", description: "Exit · signal:*" },
  { kind: "break_even", label: "BE", description: "Exit · break-even (moved stop)" },
  { kind: "unknown", label: "UNK", description: "Exit · unknown" },
];

export function classifyExitReason(exitReason: string): ExitReasonMarkerKind {
  if (exitReason === "open") return "open";
  if (exitReason === "unknown") return "unknown";
  if (exitReason.startsWith("stop_loss:")) return "stop_loss";
  if (exitReason.startsWith("take_profit:")) return "take_profit";
  if (exitReason.startsWith("signal:")) return "signal";
  if (exitReason.startsWith("break_even:")) return "break_even";
  return "unknown";
}

/** Exit marker label from `exit_reason`; `open` → no exit marker. */
export function exitReasonMarkerLabel(exitReason: string): string | null {
  const kind = classifyExitReason(exitReason);
  if (kind === "open") return null;
  const item = EXIT_MARKER_LEGEND.find((e) => e.kind === kind);
  return item?.label ?? "UNK";
}

function entryMarkerText(trade: TradeRecord, highlighted: boolean): string {
  if (trade.status === "open") {
    return highlighted ? `OPEN#${trade.trade_id}` : "OPEN";
  }
  return highlighted ? `E#${trade.trade_id}` : "E";
}

function exitMarkerColor(kind: ExitReasonMarkerKind, highlighted: boolean): string {
  if (highlighted) return "#fbbf24";
  switch (kind) {
    case "stop_loss":
      return "#f97316";
    case "take_profit":
      return "#22c55e";
    case "signal":
      return "#38bdf8";
    case "break_even":
      return "#a78bfa";
    case "unknown":
      return "#94a3b8";
    default:
      return "#94a3b8";
  }
}

/** Bar-time markers only — `aboveBar`/`belowBar` position is not entry/exit price truth. */
export function buildTradeMarkers(
  trades: TradeRecord[],
  selectedTradeId: number | string | null,
): SeriesMarker<Time>[] {
  const markers: SeriesMarker<Time>[] = [];

  for (const trade of trades) {
    const highlighted = tradeIdsEqual(selectedTradeId, trade.trade_id);
    const entryTime = msToChartTime(trade.entry_time_ms) as Time;

    markers.push({
      time: entryTime,
      position: trade.direction === "long" ? "belowBar" : "aboveBar",
      color: highlighted ? "#fbbf24" : trade.direction === "long" ? "#22c55e" : "#ef4444",
      shape: trade.direction === "long" ? "arrowUp" : "arrowDown",
      text: entryMarkerText(trade, highlighted),
    });

    if (trade.status !== "closed" || trade.exit_time_ms === null) {
      continue;
    }

    const exitLabel = exitReasonMarkerLabel(trade.exit_reason);
    if (exitLabel === null) {
      continue;
    }

    const exitKind = classifyExitReason(trade.exit_reason);
    const exitTime = msToChartTime(trade.exit_time_ms) as Time;
    markers.push({
      time: exitTime,
      position: trade.direction === "long" ? "aboveBar" : "belowBar",
      color: exitMarkerColor(exitKind, highlighted),
      shape: "circle",
      text: highlighted ? `${exitLabel}#${trade.trade_id}` : exitLabel,
    });
  }

  return markers.sort((a, b) => (a.time as number) - (b.time as number));
}

export function filterMarkersToTimeRange(
  markers: SeriesMarker<Time>[],
  fromSec: number,
  toSec: number,
): SeriesMarker<Time>[] {
  return markers.filter((marker) => {
    const t = marker.time as number;
    return t >= fromSec && t <= toSec;
  });
}

export function buildTradeMarkersForView(
  trades: TradeRecord[],
  selectedTradeId: number | string | null,
  viewCandles: { time: number }[],
): SeriesMarker<Time>[] {
  const all = buildTradeMarkers(trades, selectedTradeId);
  if (viewCandles.length === 0) {
    return [];
  }
  const fromSec = viewCandles[0].time;
  const toSec = viewCandles[viewCandles.length - 1].time;
  return filterMarkersToTimeRange(all, fromSec, toSec);
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
