import { describe, expect, it } from "vitest";

import {
  defaultChartContextOverlayRef,
  readStrategyContextsMap,
  strategyContextRefOptions,
} from "@/features/chart/strategyContexts";

const provider = {
  component_id: "htf_context",
  timeframe: "4h",
  fast_period: 100,
  anchor_period: 200,
  slow_period: 1000,
};

describe("readStrategyContextsMap", () => {
  it("reads target dict shape", () => {
    const map = readStrategyContextsMap({
      contexts: { htf_1: provider },
    });
    expect(map.htf_1).toEqual(provider);
  });

  it("reads legacy list-of-pairs from report asdict", () => {
    const map = readStrategyContextsMap({
      contexts: [["htf_1", provider]],
    });
    expect(Object.keys(map)).toEqual(["htf_1"]);
  });

  it("falls back to exit_policy.context for old reports", () => {
    const map = readStrategyContextsMap({
      trade_management: {
        exit_policy: {
          context: provider,
          always_on: { exits: [] },
          profiles: { aligned: { exits: [] }, countertrend: { exits: [] }, neutral: { exits: [] } },
        },
      },
    });
    expect(map.htf).toEqual(provider);
  });
});

describe("defaultChartContextOverlayRef", () => {
  it("uses exit_policy context_consumption ref", () => {
    const spec = {
      contexts: { htf_1: provider, htf_2: provider },
      trade_management: {
        exit_policy: {
          context_consumption: { context_ref: "htf_1", policy: { policy_id: "exit_profile_by_htf_state" } },
          always_on: { exits: [] },
          profiles: { aligned: { exits: [] }, countertrend: { exits: [] }, neutral: { exits: [] } },
        },
      },
    };
    expect(defaultChartContextOverlayRef(spec)).toBe("htf_1");
  });

  it("uses sole context when no consumption ref", () => {
    expect(
      defaultChartContextOverlayRef({
        contexts: { htf_1: provider },
        trade_management: {
          exit_policy: {
            always_on: { exits: [] },
            profiles: { aligned: { exits: [] }, countertrend: { exits: [] }, neutral: { exits: [] } },
          },
        },
      }),
    ).toBe("htf_1");
  });

  it("returns null when multiple contexts and no consumption ref", () => {
    expect(
      defaultChartContextOverlayRef({
        contexts: { htf_1: provider, htf_2: provider },
        trade_management: {
          exit_policy: {
            always_on: { exits: [] },
            profiles: { aligned: { exits: [] }, countertrend: { exits: [] }, neutral: { exits: [] } },
          },
        },
      }),
    ).toBeNull();
  });
});

describe("strategyContextRefOptions", () => {
  it("lists refs from legacy list shape", () => {
    expect(strategyContextRefOptions({ contexts: [["htf_1", provider]] })).toEqual(["htf_1"]);
  });
});
