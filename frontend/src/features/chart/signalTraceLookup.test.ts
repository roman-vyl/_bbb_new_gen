import { describe, expect, it } from "vitest";

import type { SideSignalTrace } from "@/api/types";
import {
  barIndexAtTime,
  firstBlockingGate,
  formatChartPrice,
  ohlcPriceDecimals,
} from "@/features/chart/signalTraceLookup";

describe("signalTraceLookup", () => {
  it("finds bar index at or before time", () => {
    expect(barIndexAtTime([10, 20, 30], 25)).toBe(1);
    expect(barIndexAtTime([10, 20, 30], 5)).toBe(0);
  });

  it("returns first false gate in order", () => {
    const side: SideSignalTrace = {
      direction_ok: [true],
      blockers_ok: [true],
      setup_ok: [false],
      trigger_ok: [true],
      risk_ok: [true],
      signal_entry: [false],
      stop_ready: [true],
      portfolio_entry: [false],
      internals: {},
    };
    expect(firstBlockingGate(side, 0)?.gate).toBe("setup_ok");
  });

  it("formats prices to OHLC decimal precision", () => {
    const candle = {
      time: 1,
      open: 79413.6,
      high: 79572.6,
      low: 79413.6,
      close: 79551.3,
    };
    expect(ohlcPriceDecimals(candle)).toBe(1);
    expect(formatChartPrice(79607.41466010294, 1)).toBe("79607.4");
    expect(formatChartPrice(null, 1)).toBe("—");
  });
});
