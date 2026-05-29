import { describe, expect, it } from "vitest";

import type { ComponentCatalog } from "@/api/types";

import {
  collectComposerStrategyErrors,
  HTF_REGIME_GATE_POLICY_ID,
  prepareStrategyForApi,
} from "./composerStrategyContexts";

const catalog: ComponentCatalog = {
  family: "ema_pullback",
  schema_version: 1,
  sections: [],
  components: [
    {
      role: "blockers",
      component_id: "counter_candle_blocker",
      label: "Counter candle",
      supports_context_consumption: true,
      context_consumption_policies: [
        {
          policy_id: HTF_REGIME_GATE_POLICY_ID,
          label: "HTF regime gate",
          params_schema: {
            allowed_regimes: {
              type: "array",
              enum: ["aligned", "countertrend", "neutral"],
            },
          },
        },
      ],
    },
  ],
  context_providers: [],
  context_consumption_roles: [],
};

describe("htf_regime_gate composer validation", () => {
  const baseStrategy = {
    contexts: { htf_4h: { component_id: "htf_context", timeframe: "4h" } },
    blockers: [
      {
        instance_id: "b1",
        component_id: "counter_candle_blocker",
        context_consumption: {
          context_ref: "htf_4h",
          policy: {
            policy_id: HTF_REGIME_GATE_POLICY_ID,
            params: { allowed_regimes: ["aligned", "neutral"] },
          },
        },
      },
    ],
    trade_management: {
      exit_policy: {
        profiles: { aligned: { exits: [] }, countertrend: { exits: [] }, neutral: { exits: [] } },
      },
    },
  };

  it("accepts non-empty allowed_regimes", () => {
    const errors = collectComposerStrategyErrors(baseStrategy, "instances[0].strategy", catalog);
    expect(errors.some((e) => e.path.includes("allowed_regimes"))).toBe(false);
  });

  it("rejects empty allowed_regimes", () => {
    const strategy = {
      ...baseStrategy,
      blockers: [
        {
          ...baseStrategy.blockers[0],
          context_consumption: {
            context_ref: "htf_4h",
            policy: { policy_id: HTF_REGIME_GATE_POLICY_ID, params: { allowed_regimes: [] } },
          },
        },
      ],
    };
    const errors = collectComposerStrategyErrors(strategy, "instances[0].strategy", catalog);
    expect(
      errors.some(
        (e) =>
          e.path.includes("allowed_regimes") && e.message.includes("non-empty"),
      ),
    ).toBe(true);
  });

  it("rejects missing context_ref when consumption enabled", () => {
    const strategy = {
      ...baseStrategy,
      blockers: [
        {
          ...baseStrategy.blockers[0],
          context_consumption: {
            context_ref: "",
            policy: {
              policy_id: HTF_REGIME_GATE_POLICY_ID,
              params: { allowed_regimes: ["aligned"] },
            },
          },
        },
      ],
    };
    const errors = collectComposerStrategyErrors(strategy, "instances[0].strategy", catalog);
    expect(errors.some((e) => e.path.includes("context_ref") && e.message.includes("required"))).toBe(
      true,
    );
  });

  it("prepareStrategyForApi preserves htf_regime_gate shape", () => {
    const prepared = prepareStrategyForApi(baseStrategy);
    const blocker = (prepared.blockers as { context_consumption: { policy: { params: { allowed_regimes: string[] } } } }[])[0]!;
    expect(blocker.context_consumption.policy.policy_id).toBe(HTF_REGIME_GATE_POLICY_ID);
    expect(blocker.context_consumption.policy.params.allowed_regimes).toEqual(["aligned", "neutral"]);
    expect(blocker.context_consumption.policy.params).not.toHaveProperty("allowed_states");
  });

  it("rejects policy_id not listed in component context_consumption_policies", () => {
    const catalogRegimeOnly: ComponentCatalog = {
      ...catalog,
      components: [
        {
          ...catalog.components[0]!,
          context_consumption_policies: [
            {
              policy_id: HTF_REGIME_GATE_POLICY_ID,
              label: "HTF regime gate",
              params_schema: {
                allowed_regimes: {
                  type: "array",
                  enum: ["aligned", "countertrend", "neutral"],
                },
              },
            },
          ],
        },
      ],
    };
    const strategy = {
      ...baseStrategy,
      blockers: [
        {
          instance_id: "b1",
          component_id: "counter_candle_blocker",
          context_consumption: {
            context_ref: "htf_4h",
            policy: {
              policy_id: "htf_state_gate",
              params: { allowed_states: ["up"] },
            },
          },
        },
      ],
    };
    const errors = collectComposerStrategyErrors(
      strategy,
      "instances[0].strategy",
      catalogRegimeOnly,
    );
    expect(
      errors.some(
        (e) =>
          e.path.includes("policy.policy_id") &&
          e.message === "context_consumption.policy.policy_id is not supported for this component",
      ),
    ).toBe(true);
  });

  it("rejects legacy htf_state_gate policy_id", () => {
    const strategy = {
      ...baseStrategy,
      blockers: [
        {
          instance_id: "b1",
          component_id: "counter_candle_blocker",
          context_consumption: {
            context_ref: "htf_4h",
            policy: {
              policy_id: "htf_state_gate",
              params: { allowed_states: ["up"] },
            },
          },
        },
      ],
    };
    const errors = collectComposerStrategyErrors(strategy, "instances[0].strategy", catalog);
    expect(
      errors.some(
        (e) =>
          e.path.includes("policy.policy_id") &&
          e.message === "context_consumption.policy.policy_id is not supported for this component",
      ),
    ).toBe(true);
  });
});
