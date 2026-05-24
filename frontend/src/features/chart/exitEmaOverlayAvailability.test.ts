import { describe, expect, it } from "vitest";

import { CHART_OVERLAY_EMA_KIND } from "@/api/types";
import { classifyEmaPeriodAvailability } from "@/features/chart/exitEmaOverlayAvailability";

describe("classifyEmaPeriodAvailability", () => {
  const anchorStack = { fast: 200, anchor: 500, slow: 1000 };

  it("detects anchor stack coverage", () => {
    const info = classifyEmaPeriodAvailability(500, anchorStack, []);
    expect(info.status).toBe("anchor_stack");
    expect(info.anchorRole).toBe("anchor");
  });

  it("detects unavailable period", () => {
    const info = classifyEmaPeriodAvailability(21, anchorStack, []);
    expect(info.status).toBe("unavailable");
  });

  it("detects period in chart bundle", () => {
    const info = classifyEmaPeriodAvailability(
      21,
      anchorStack,
      [{ role: "fast", period: 21, points: [{ time: 1, value: 1, kind: CHART_OVERLAY_EMA_KIND }] }],
    );
    expect(info.status).toBe("in_bundle");
  });
});
