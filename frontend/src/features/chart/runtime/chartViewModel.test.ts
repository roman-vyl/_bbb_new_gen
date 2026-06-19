import { describe, expect, it } from "vitest";

import { buildChartViewModel } from "@/features/chart/runtime/chartViewModel";

describe("buildChartViewModel", () => {
  it("builds stable seriesKey from window bounds and view mode", () => {
    const vm = buildChartViewModel({
      candles: [{ time: 1000, open: 1, high: 2, low: 0.5, close: 1.5 }],
      emaOverlays: [],
      auxEmaOverlays: [],
      displayAuxEmaOverlays: [],
      componentEvents: [],
      htfOverlayStale: false,
      componentEventsStale: false,
      traceDisplayStatus: "empty",
      traceDisplayMissingRange: null,
      viewMode: "tail",
      centerTimeSec: null,
      firstTimeSec: 1000,
      lastTimeSec: 1000,
      count: 1,
    });
    expect(vm.seriesKey).toBe("1000:1000:1:tail:");
    expect(vm.candles).toHaveLength(1);
  });
});
