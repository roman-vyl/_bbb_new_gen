import { describe, expect, it } from "vitest";

import { readEmaRuleParams } from "@/features/chart/exitPolicyEmaParams";

describe("readEmaRuleParams", () => {
  it("formats v4 EMA object params", () => {
    const { parameters, emaPeriods } = readEmaRuleParams({
      ema: { source: "close", timeframe: "base", period: 500 },
      confirm_bars: 10,
    });
    expect(parameters.ema).toBe("close/base/500");
    expect(parameters.confirm_bars).toBe("10");
    expect(emaPeriods).toEqual([500]);
  });

  it("formats fast_ema and slow_ema objects", () => {
    const { parameters, emaPeriods } = readEmaRuleParams({
      fast_ema: { source: "close", timeframe: "base", period: 200 },
      slow_ema: { source: "close", timeframe: "base", period: 500 },
    });
    expect(parameters.fast_ema).toBe("close/base/200");
    expect(parameters.slow_ema).toBe("close/base/500");
    expect(emaPeriods).toEqual([200, 500]);
  });
});
