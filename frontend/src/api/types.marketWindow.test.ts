import { describe, expect, it } from "vitest";

import type { CandlesWindowBundle, EmaWindowBundle } from "@/api/types";
import { CHART_OVERLAY_EMA_KIND } from "@/api/types";

/** Compile-time + runtime shape parity with research_api/contracts/chart.py (Phase 2). */

const candlesWindowSample: CandlesWindowBundle = {
  candles: [
    { time: 1_700_000_000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
  ],
  coverage: {
    requested_from_ms: 1_000,
    requested_to_ms: 2_000,
    actual_from_ms: 1_000,
    actual_to_ms: 2_000,
    truncated: false,
  },
};

const emaWindowSample: EmaWindowBundle = {
  points: [{ time: 1_700_000_000, value: 100, kind: CHART_OVERLAY_EMA_KIND }],
  coverage: {
    requested_from_ms: 1_000,
    requested_to_ms: 2_000,
    actual_from_ms: 1_000,
    actual_to_ms: 2_000,
    calculation_origin_ms: 500,
    coverage_to_ms: 2_000,
    cache_hit: true,
    truncated: false,
  },
};

describe("market window contract types", () => {
  it("candles window bundle is candles-only with coverage", () => {
    expect(Object.keys(candlesWindowSample).sort()).toEqual(["candles", "coverage"]);
    expect(candlesWindowSample.coverage.truncated).toBe(false);
  });

  it("ema window bundle always includes canonical coverage fields", () => {
    const { coverage } = emaWindowSample;
    expect(coverage.calculation_origin_ms).toBe(500);
    expect(coverage.coverage_to_ms).toBe(2_000);
    expect(coverage.cache_hit).toBe(true);
    expect(emaWindowSample.points[0]?.kind).toBe(CHART_OVERLAY_EMA_KIND);
  });
});
