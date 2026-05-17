import { describe, expect, it } from "vitest";

import type { ChartBar, IndicatorPoint } from "@/api/types";
import { CHART_OVERLAY_EMA_KIND } from "@/api/types";
import {
  buildChartViewWindow,
  CHART_RENDER_BAR_LIMIT,
  findBarIndexAtOrBefore,
  sliceAroundTime,
  sliceEmaToCandleWindow,
  sliceTailBars,
} from "@/features/chart/chartViewWindow";

function makeBars(count: number, startTime = 1_000_000): ChartBar[] {
  return Array.from({ length: count }, (_, i) => ({
    time: startTime + i * 300,
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100.5 + i,
  }));
}

function makeEmaForBars(bars: ChartBar[]): IndicatorPoint[] {
  return bars.map((bar) => ({
    time: bar.time,
    value: bar.close,
    kind: CHART_OVERLAY_EMA_KIND,
  }));
}

describe("sliceTailBars", () => {
  it("returns last limit bars when series is longer", () => {
    const bars = makeBars(10);
    const tail = sliceTailBars(bars, 3);
    expect(tail).toHaveLength(3);
    expect(tail[0].time).toBe(bars[7].time);
    expect(tail[2].time).toBe(bars[9].time);
  });

  it("returns full series when length <= limit", () => {
    const bars = makeBars(5);
    expect(sliceTailBars(bars, 10)).toEqual(bars);
  });
});

describe("findBarIndexAtOrBefore", () => {
  const bars = makeBars(5, 0);

  it("finds exact time", () => {
    expect(findBarIndexAtOrBefore(bars, 600)).toBe(2);
  });

  it("finds index before next bar", () => {
    expect(findBarIndexAtOrBefore(bars, 750)).toBe(2);
  });

  it("clamps before first bar", () => {
    expect(findBarIndexAtOrBefore(bars, -100)).toBe(0);
  });

  it("clamps after last bar", () => {
    expect(findBarIndexAtOrBefore(bars, 10_000)).toBe(4);
  });
});

describe("sliceAroundTime", () => {
  it("returns symmetric window in the middle", () => {
    const bars = makeBars(100, 0);
    const window = sliceAroundTime(bars, bars[50].time, 20);
    expect(window).toHaveLength(20);
    expect(window[0].time).toBe(bars[40].time);
    expect(window[19].time).toBe(bars[59].time);
  });

  it("clamps at left edge", () => {
    const bars = makeBars(50, 0);
    const window = sliceAroundTime(bars, bars[2].time, 20);
    expect(window).toHaveLength(20);
    expect(window[0].time).toBe(bars[0].time);
    expect(window[19].time).toBe(bars[19].time);
  });

  it("clamps at right edge", () => {
    const bars = makeBars(50, 0);
    const window = sliceAroundTime(bars, bars[48].time, 20);
    expect(window).toHaveLength(20);
    expect(window[0].time).toBe(bars[30].time);
    expect(window[19].time).toBe(bars[49].time);
  });
});

describe("sliceEmaToCandleWindow", () => {
  it("keeps only EMA points within candle time range", () => {
    const candles = makeBars(5, 1_000);
    const ema = [
      ...makeEmaForBars(candles),
      { time: candles[0].time - 300, value: 1, kind: CHART_OVERLAY_EMA_KIND },
      { time: candles[4].time + 300, value: 2, kind: CHART_OVERLAY_EMA_KIND },
    ];
    const filtered = sliceEmaToCandleWindow(ema, candles);
    expect(filtered).toHaveLength(5);
    expect(filtered.every((p) => p.time >= candles[0].time && p.time <= candles[4].time)).toBe(
      true,
    );
  });
});

describe("buildChartViewWindow", () => {
  it("uses tail when no trade selected", () => {
    const candles = makeBars(CHART_RENDER_BAR_LIMIT + 100);
    const ema = makeEmaForBars(candles);
    const view = buildChartViewWindow({
      candles,
      ema,
      selectedTradeEntryTimeMs: null,
    });
    expect(view.candles).toHaveLength(CHART_RENDER_BAR_LIMIT);
    expect(view.candles[0].time).toBe(candles[100].time);
  });

  it("uses around-trade window when trade selected", () => {
    const candles = makeBars(200, 0);
    const ema = makeEmaForBars(candles);
    const entryMs = candles[100].time * 1000;
    const view = buildChartViewWindow({
      candles,
      ema,
      selectedTradeEntryTimeMs: entryMs,
      limit: 40,
    });
    expect(view.candles).toHaveLength(40);
    expect(view.candles.some((b) => b.time === candles[100].time)).toBe(true);
    expect(view.candles[0].time).not.toBe(candles[0].time);
  });

  it("returns full series when shorter than limit", () => {
    const candles = makeBars(10);
    const ema = makeEmaForBars(candles);
    const view = buildChartViewWindow({
      candles,
      ema,
      selectedTradeEntryTimeMs: null,
      limit: 5000,
    });
    expect(view.candles).toHaveLength(10);
    expect(view.ema).toHaveLength(10);
  });
});
