import { describe, expect, it } from "vitest";

import { missingMarketRange } from "@/features/chart/marketIntervalCoverage";

describe("missingMarketRange", () => {
  it("returns gap only until the next covered interval, not through target end", () => {
    const intervals = [
      { fromMs: 100_000, toMs: 200_000 },
      { fromMs: 400_000, toMs: 500_000 },
    ];

    expect(missingMarketRange(intervals, 100_000, 500_000)).toEqual({
      fromMs: 200_000,
      toMs: 400_000,
    });
  });

  it("returns trailing gap when no later interval exists", () => {
    const intervals = [{ fromMs: 100_000, toMs: 200_000 }];

    expect(missingMarketRange(intervals, 100_000, 500_000)).toEqual({
      fromMs: 200_000,
      toMs: 500_000,
    });
  });
});
