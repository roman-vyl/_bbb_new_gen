import { describe, expect, it } from "vitest";

import {
  clampAsideWidth,
  CHART_SPLIT_HANDLE_WIDTH,
  DEFAULT_CHART_ASIDE_WIDTH,
  MIN_CHART_ASIDE_WIDTH,
  MIN_CHART_MAIN_WIDTH,
} from "@/features/chart/chartPanelSplit";

describe("clampAsideWidth", () => {
  it("clamps to min aside width", () => {
    expect(clampAsideWidth(100, 1200)).toBe(MIN_CHART_ASIDE_WIDTH);
  });

  it("clamps to max based on container", () => {
    const container = MIN_CHART_MAIN_WIDTH + MIN_CHART_ASIDE_WIDTH + CHART_SPLIT_HANDLE_WIDTH + 200;
    const max = container - MIN_CHART_MAIN_WIDTH - CHART_SPLIT_HANDLE_WIDTH;
    expect(clampAsideWidth(900, container)).toBe(max);
  });

  it("returns default when in range", () => {
    expect(clampAsideWidth(DEFAULT_CHART_ASIDE_WIDTH, 1200)).toBe(DEFAULT_CHART_ASIDE_WIDTH);
  });
});
