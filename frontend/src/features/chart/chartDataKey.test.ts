import { describe, expect, it } from "vitest";

import { buildChartDataKey } from "@/features/chart/chartDataKey";

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
