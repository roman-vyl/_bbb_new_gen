import { describe, expect, it } from "vitest";

import { buildChartDataKey, buildChartSeriesDataKey } from "@/features/chart/chartDataKey";

describe("buildChartDataKey", () => {
  it("returns empty key for empty window", () => {
    expect(
      buildChartDataKey({
        firstTimeSec: null,
        lastTimeSec: null,
        count: 0,
        selectedTradeId: null,
        centerTimeSec: null,
      }),
    ).toBe("");
  });

  it("includes trade id and center time", () => {
    const key = buildChartDataKey({
      firstTimeSec: 100,
      lastTimeSec: 200,
      count: 50,
      selectedTradeId: 7,
      centerTimeSec: 150,
    });
    expect(key).toBe("100:200:50:trade=7:center=150");
  });

  it("changes when selected trade window changes", () => {
    const base = {
      count: 5000,
      selectedTradeId: 1 as number | null,
      centerTimeSec: 1_000_000,
    };
    const a = buildChartDataKey({ ...base, firstTimeSec: 900_000, lastTimeSec: 910_000 });
    const b = buildChartDataKey({ ...base, firstTimeSec: 950_000, lastTimeSec: 960_000 });
    expect(a).not.toBe(b);
  });
});

describe("buildChartSeriesDataKey", () => {
  it("excludes trade and center from series key", () => {
    const bounds = { firstTimeSec: 100, lastTimeSec: 200, count: 50 };
    expect(buildChartSeriesDataKey(bounds)).toBe("100:200:50");
    expect(buildChartDataKey({ ...bounds, selectedTradeId: 1, centerTimeSec: 150 })).toBe(
      "100:200:50:trade=1:center=150",
    );
  });

  it("is stable across adjacent in-zone trade selection", () => {
    const bounds = { firstTimeSec: 900_000, lastTimeSec: 910_000, count: 50_000 };
    const seriesKey = buildChartSeriesDataKey(bounds);
    const trade1 = buildChartDataKey({ ...bounds, selectedTradeId: 1, centerTimeSec: 905_000 });
    const trade2 = buildChartDataKey({ ...bounds, selectedTradeId: 2, centerTimeSec: 906_000 });
    expect(buildChartSeriesDataKey(bounds)).toBe(seriesKey);
    expect(trade1).not.toBe(trade2);
  });
});
