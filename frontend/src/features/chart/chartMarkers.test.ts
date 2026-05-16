import type { SeriesMarker, Time } from "lightweight-charts";
import { describe, expect, it } from "vitest";

import type { TradeRecord } from "@/api/types";
import {
  buildTradeMarkersForView,
  filterMarkersToTimeRange,
} from "@/features/chart/chartMarkers";

function markerAt(time: number): SeriesMarker<Time> {
  return {
    time: time as Time,
    position: "aboveBar",
    color: "#fff",
    shape: "circle",
    text: "M",
  };
}

describe("filterMarkersToTimeRange", () => {
  it("keeps markers inside inclusive range", () => {
    const markers = [markerAt(100), markerAt(200), markerAt(300)];
    const filtered = filterMarkersToTimeRange(markers, 150, 250);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].time).toBe(200);
  });
});

describe("buildTradeMarkersForView", () => {
  const trades: TradeRecord[] = [
    {
      trade_id: 1,
      direction: "long",
      status: "closed",
      entry_time_ms: 100_000,
      exit_time_ms: 200_000,
      entry_price: 1,
      exit_price: 2,
      exit_reason: "signal:foo",
      size: 1,
      pnl: 1,
      return_pct: 0.01,
    },
    {
      trade_id: 2,
      direction: "short",
      status: "closed",
      entry_time_ms: 900_000,
      exit_time_ms: 950_000,
      entry_price: 1,
      exit_price: 2,
      exit_reason: "stop_loss:sl",
      size: 1,
      pnl: -1,
      return_pct: -0.01,
    },
  ];

  it("excludes markers outside view candle window", () => {
    const viewCandles = [{ time: 50 }, { time: 150 }, { time: 250 }];
    const markers = buildTradeMarkersForView(trades, null, viewCandles);
    const times = markers.map((m) => m.time as number);
    expect(times.every((t) => t >= 50 && t <= 250)).toBe(true);
    expect(times.some((t) => t === 900)).toBe(false);
  });
});
