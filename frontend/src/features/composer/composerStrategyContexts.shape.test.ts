import { describe, expect, it } from "vitest";

import { createDefaultInstance } from "./composerDraft";
import {
  exitPolicyRequiresContextConsumption,
  normalizeStrategyForTargetShape,
  prepareStrategyForApi,
  readExitPolicy,
  readExitPolicyContextConsumption,
  readStrategyContexts,
} from "./composerStrategyContexts";

describe("createDefaultInstance target shape", () => {
  it("uses strategy.contexts and no exit_policy.context", () => {
    const inst = createDefaultInstance("i1");
    const strategy = inst.strategy as Record<string, unknown>;
    expect(strategy.contexts).toEqual({});
    const exitPolicy = (
      (strategy.trade_management as Record<string, unknown>)?.exit_policy ?? {}
    ) as Record<string, unknown>;
    expect(exitPolicy.context).toBeUndefined();
  });
});

describe("prepareStrategyForApi", () => {
  it("strips legacy exit_policy.context", () => {
    const strategy = {
      contexts: { htf: { component_id: "htf_context", timeframe: "4h" } },
      trade_management: {
        exit_policy: {
          context: { component_id: "htf_context" },
          profiles: {
            aligned: {
              exits: [{ instance_id: "x", component_id: "no_signal_exit" }],
            },
            countertrend: { exits: [] },
            neutral: { exits: [] },
          },
        },
      },
    };
    const prepared = prepareStrategyForApi(strategy);
    expect(readExitPolicy(prepared).context).toBeUndefined();
  });

  it("keeps context_consumption when profile exits are non-empty", () => {
    const strategy = {
      contexts: { htf: { component_id: "htf_context", timeframe: "4h" } },
      trade_management: {
        exit_policy: {
          context_consumption: {
            context_ref: "htf",
            policy: { policy_id: "exit_profile_by_htf_state" },
          },
          profiles: {
            aligned: {
              exits: [{ instance_id: "x", component_id: "no_signal_exit" }],
            },
            countertrend: { exits: [] },
            neutral: { exits: [] },
          },
        },
      },
    };
    const prepared = prepareStrategyForApi(strategy);
    expect(readExitPolicyContextConsumption(prepared)?.context_ref).toBe("htf");
  });

  it("drops context_consumption when profile exits are empty", () => {
    const strategy = {
      contexts: { htf: { component_id: "htf_context" } },
      trade_management: {
        exit_policy: {
          context_consumption: {
            context_ref: "htf",
            policy: { policy_id: "exit_profile_by_htf_state" },
          },
          profiles: {
            aligned: { exits: [] },
            countertrend: { exits: [] },
            neutral: { exits: [] },
          },
        },
      },
    };
    const prepared = normalizeStrategyForTargetShape(strategy);
    expect(readExitPolicyContextConsumption(prepared)).toBeNull();
  });
});

describe("exitPolicyRequiresContextConsumption", () => {
  it("is false for always_on-only default instance", () => {
    const inst = createDefaultInstance("i1");
    expect(exitPolicyRequiresContextConsumption(inst.strategy as Record<string, unknown>)).toBe(
      false,
    );
    expect(readStrategyContexts(inst.strategy as Record<string, unknown>)).toEqual({});
  });
});
