import { describe, expect, it } from "vitest";

import { resolveChartTimeframeMs } from "@/features/chart/chartTimeframeMs";

describe("resolveChartTimeframeMs", () => {
  it("maps supported chart timeframes to bar duration ms", () => {
    expect(resolveChartTimeframeMs("5m")).toBe(300_000);
    expect(resolveChartTimeframeMs(" 1h ")).toBe(3_600_000);
  });

  it("rejects unsupported timeframes", () => {
    expect(() => resolveChartTimeframeMs("2h")).toThrow(/unsupported chart timeframe/);
  });
});
