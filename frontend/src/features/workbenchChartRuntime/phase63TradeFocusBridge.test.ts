import { describe, expect, it } from "vitest";

import {
  createTradeFocusRequest,
  evaluateTradeFocusReadiness,
  isTradeEntryInChartView,
  shouldEmitTradeFocus,
  tradeFocusEmitKey,
  tradeFocusEmitKeysEqual,
} from "@/features/workbenchChartRuntime/phase63TradeFocusBridge";

function candles(fromSec: number, count: number, stepSec = 300) {
  return Array.from({ length: count }, (_, index) => ({
    time: fromSec + index * stepSec,
  }));
}

describe("phase63TradeFocusBridge", () => {
  it("isTradeEntryInChartView checks slice bounds", () => {
    const slice = candles(1_000, 5);
    expect(isTradeEntryInChartView(1_000, slice)).toBe(true);
    expect(isTradeEntryInChartView(1_300, slice)).toBe(true);
    expect(isTradeEntryInChartView(999, slice)).toBe(false);
    expect(isTradeEntryInChartView(2_500, slice)).toBe(false);
  });

  it("evaluateTradeFocusReadiness returns idle without selection", () => {
    expect(
      evaluateTradeFocusReadiness({
        selectedTradeId: null,
        selectedTradeEntryTimeMs: null,
        renderWindowFoundationKey: "key",
        marketLoadStatus: "ready",
        chartView: { mode: "tail", count: 10, candles: candles(1_000, 10) },
      }).status,
    ).toBe("idle");
  });

  it("evaluateTradeFocusReadiness returns ready when trade is in chart view", () => {
    const slice = candles(1_300, 20);
    const readiness = evaluateTradeFocusReadiness({
      selectedTradeId: 1,
      selectedTradeEntryTimeMs: 1_450_000,
      renderWindowFoundationKey: "foundation",
      marketLoadStatus: "ready",
      chartView: { mode: "around-trade", count: slice.length, candles: slice },
    });
    expect(readiness).toEqual({ status: "ready", entryTimeSec: 1_450 });
  });

  it("evaluateTradeFocusReadiness waits when foundation missing", () => {
    const readiness = evaluateTradeFocusReadiness({
      selectedTradeId: 1,
      selectedTradeEntryTimeMs: 1_450_000,
      renderWindowFoundationKey: null,
      marketLoadStatus: "loading",
      chartView: { mode: "empty", count: 0, candles: [] },
    });
    expect(readiness).toEqual({ status: "waiting", reason: "market_loading" });
  });

  it("evaluateTradeFocusReadiness waits when trade outside slice", () => {
    const readiness = evaluateTradeFocusReadiness({
      selectedTradeId: 1,
      selectedTradeEntryTimeMs: 5_000_000,
      renderWindowFoundationKey: "foundation",
      marketLoadStatus: "ready",
      chartView: { mode: "around-trade", count: 10, candles: candles(1_000, 10) },
    });
    expect(readiness).toEqual({ status: "waiting", reason: "trade_outside_slice" });
  });

  it("evaluateTradeFocusReadiness fails on market error", () => {
    const readiness = evaluateTradeFocusReadiness({
      selectedTradeId: 1,
      selectedTradeEntryTimeMs: 1_450_000,
      renderWindowFoundationKey: null,
      marketLoadStatus: "error",
      chartView: { mode: "empty", count: 0, candles: [] },
    });
    expect(readiness).toEqual({ status: "failed", reason: "market_error" });
  });

  it("shouldEmitTradeFocus dedupes same emit key", () => {
    const readiness = { status: "ready" as const, entryTimeSec: 1_450 };
    const emit = tradeFocusEmitKey(1, 1_450, "foundation");
    expect(
      shouldEmitTradeFocus(readiness, null, emit, { suppressedByUserPan: false }),
    ).toBe(true);
    expect(
      shouldEmitTradeFocus(readiness, emit, emit, { suppressedByUserPan: false }),
    ).toBe(false);
  });

  it("shouldEmitTradeFocus rejects when suppressed by user pan", () => {
    const readiness = { status: "ready" as const, entryTimeSec: 1_450 };
    const emit = tradeFocusEmitKey(1, 1_450, "foundation");
    expect(
      shouldEmitTradeFocus(readiness, null, emit, { suppressedByUserPan: true }),
    ).toBe(false);
  });

  it("createTradeFocusRequest builds request with entry time", () => {
    expect(createTradeFocusRequest(3, 42, 1_450_000)).toEqual({
      requestSeq: 3,
      selectedTradeId: 42,
      selectedTradeEntryTimeMs: 1_450_000,
      entryTimeSec: 1_450,
    });
  });

  it("tradeFocusEmitKeysEqual compares foundation keys", () => {
    const left = tradeFocusEmitKey(1, 100, "a");
    const right = tradeFocusEmitKey(1, 100, "b");
    expect(tradeFocusEmitKeysEqual(left, right)).toBe(false);
    expect(tradeFocusEmitKeysEqual(left, left)).toBe(true);
  });
});
