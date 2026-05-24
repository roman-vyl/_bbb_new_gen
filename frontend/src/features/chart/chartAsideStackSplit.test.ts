import { describe, expect, it } from "vitest";

import {
  CHART_ASIDE_STACK_SPLIT_HANDLE_HEIGHT,
  clampDiagnosticsHeight,
  DEFAULT_CHART_ASIDE_STACK_DIAGNOSTICS_HEIGHT,
  MIN_CHART_ASIDE_STACK_DIAGNOSTICS_HEIGHT,
  MIN_CHART_ASIDE_STACK_INSPECTOR_HEIGHT,
} from "@/features/chart/chartAsideStackSplit";

describe("clampDiagnosticsHeight", () => {
  it("clamps to min diagnostics height", () => {
    expect(clampDiagnosticsHeight(40, 800)).toBe(MIN_CHART_ASIDE_STACK_DIAGNOSTICS_HEIGHT);
  });

  it("clamps to max based on container", () => {
    const container =
      MIN_CHART_ASIDE_STACK_DIAGNOSTICS_HEIGHT +
      MIN_CHART_ASIDE_STACK_INSPECTOR_HEIGHT +
      CHART_ASIDE_STACK_SPLIT_HANDLE_HEIGHT +
      100;
    const max =
      container -
      MIN_CHART_ASIDE_STACK_INSPECTOR_HEIGHT -
      CHART_ASIDE_STACK_SPLIT_HANDLE_HEIGHT;
    expect(clampDiagnosticsHeight(900, container)).toBe(max);
  });

  it("returns default when in range", () => {
    expect(clampDiagnosticsHeight(DEFAULT_CHART_ASIDE_STACK_DIAGNOSTICS_HEIGHT, 800)).toBe(
      DEFAULT_CHART_ASIDE_STACK_DIAGNOSTICS_HEIGHT,
    );
  });
});
