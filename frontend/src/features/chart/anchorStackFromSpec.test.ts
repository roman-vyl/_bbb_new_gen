import { describe, expect, it } from "vitest";

import {
  AnchorStackParseError,
  anchorStackPeriodsFromStrategySpec,
} from "@/features/chart/anchorStackFromSpec";

describe("anchorStackPeriodsFromStrategySpec", () => {
  it("reads fast, anchor, slow periods", () => {
    const periods = anchorStackPeriodsFromStrategySpec({
      anchor_stack: {
        fast: { period: 200, source: "close", timeframe: "base" },
        anchor: { period: 500, source: "close", timeframe: "base" },
        slow: { period: 1000, source: "close", timeframe: "base" },
      },
    });
    expect(periods).toEqual({ fast: 200, anchor: 500, slow: 1000 });
  });

  it("rejects missing anchor_stack", () => {
    expect(() => anchorStackPeriodsFromStrategySpec({})).toThrow(AnchorStackParseError);
  });

  it("rejects invalid period order", () => {
    expect(() =>
      anchorStackPeriodsFromStrategySpec({
        anchor_stack: {
          fast: { period: 500 },
          anchor: { period: 200 },
          slow: { period: 1000 },
        },
      }),
    ).toThrow(/fast.period < anchor.period < slow.period/);
  });
});
