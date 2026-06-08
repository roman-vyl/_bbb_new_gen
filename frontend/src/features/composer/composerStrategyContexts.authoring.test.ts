import { describe, expect, it } from "vitest";

import type { ComponentCatalog } from "@/api/types";
import {
  addStrategyContext,
  collectComposerStrategyErrors,
  collectUndefinedConsumerContextRefErrors,
  contextRefOptions,
  generateUniqueContextRef,
  readExitPolicyContextConsumption,
  readStrategyContexts,
  renameStrategyContext,
  writeExitPolicyContextConsumption,
} from "./composerStrategyContexts";

const catalog: ComponentCatalog = {
  family: "ema_pullback",
  schema_version: 1,
  sections: [],
  components: [
    {
      role: "setup",
      component_id: "untouched_anchor_setup",
      label: "Untouched anchor setup",
      supports_context_consumption: true,
      context_consumption_policies: [
        {
          policy_id: "htf_regime_gate",
          label: "HTF regime gate",
          params_schema: {
            allowed_regimes: { type: "array", enum: ["aligned", "countertrend", "neutral"] },
          },
        },
      ],
    },
    {
      role: "blockers",
      component_id: "counter_candle_blocker",
      label: "Counter candle",
      supports_context_consumption: true,
      context_consumption_policies: [
        {
          policy_id: "htf_regime_gate",
          label: "HTF regime gate",
          params_schema: {
            allowed_regimes: { type: "array", enum: ["aligned", "countertrend", "neutral"] },
          },
        },
      ],
    },
  ],
  context_providers: [
    {
      component_id: "htf_context",
      label: "HTF",
      params_schema: {
        timeframe: { type: "string", default: "4h" },
        source: { type: "string", default: "close" },
        fast_period: { type: "integer", default: 100 },
        anchor_period: { type: "integer", default: 200 },
        slow_period: { type: "integer", default: 1000 },
      },
    },
  ],
  context_consumption_roles: [
    {
      role: "exit_policy",
      label: "Exit policy",
      policies: [{ policy_id: "exit_profile_by_htf_state", label: "Exit profile by HTF" }],
    },
  ],
};

describe("strategy context authoring helpers", () => {
  it("generateUniqueContextRef returns htf_1, htf_2, …", () => {
    expect(generateUniqueContextRef({})).toBe("htf_1");
    expect(generateUniqueContextRef({ htf_1: { component_id: "htf_context" } })).toBe("htf_2");
  });

  it("addStrategyContext creates htf_1 with provider defaults from catalog", () => {
    const { ref, contexts } = addStrategyContext({}, catalog);
    expect(ref).toBe("htf_1");
    expect(contexts.htf_1).toMatchObject({
      component_id: "htf_context",
      timeframe: "4h",
      fast_period: 100,
      anchor_period: 200,
      slow_period: 1000,
    });
    expect(contextRefOptions(contexts)).toEqual(["htf_1"]);
  });

  it("does not auto-attach new context to exit_policy consumption", () => {
    const strategy = {
      contexts: {},
      trade_management: {
        exit_policy: {
          profiles: {
            aligned: { exits: [{ instance_id: "x", component_id: "no_signal_exit" }] },
            countertrend: { exits: [] },
            neutral: { exits: [] },
          },
        },
      },
    };
    const { contexts } = addStrategyContext(readStrategyContexts(strategy), catalog);
    const next = { ...strategy, contexts };
    expect(readExitPolicyContextConsumption(next)?.context_ref).toBeUndefined();
  });

  it("renameStrategyContext moves provider key without updating consumers", () => {
    let contexts: Record<string, { component_id: string; timeframe?: string }> = {
      htf_1: { component_id: "htf_context", timeframe: "4h" },
    };
    const renamed = renameStrategyContext(contexts, "htf_1", "htf_renamed");
    expect(renamed).not.toBeNull();
    contexts = renamed!;
    expect(contexts.htf_renamed).toBeDefined();
    expect(contexts.htf_1).toBeUndefined();

    const strategy = writeExitPolicyContextConsumption(
      { contexts, trade_management: { exit_policy: { profiles: { aligned: { exits: [{}] }, countertrend: { exits: [] }, neutral: { exits: [] } } } } },
      {
        context_ref: "htf_1",
        policy: { policy_id: "exit_profile_by_htf_state" },
      },
    );
    const errors = collectUndefinedConsumerContextRefErrors(
      strategy,
      "instances[0].strategy",
    );
    expect(errors.some((e) => e.message.includes('"htf_1"'))).toBe(true);
    expect(errors.some((e) => e.message.includes("not defined"))).toBe(true);
  });

  it("rejects consumer context_ref not in strategy.contexts", () => {
    const strategy = {
      contexts: { htf_1: { component_id: "htf_context" } },
      trade_management: {
        exit_policy: {
          context_consumption: {
            context_ref: "12",
            policy: { policy_id: "exit_profile_by_htf_state" },
          },
          profiles: {
            aligned: { exits: [{ instance_id: "x", component_id: "no_signal_exit" }] },
            countertrend: { exits: [] },
            neutral: { exits: [] },
          },
        },
      },
    };
    const errors = collectComposerStrategyErrors(strategy, "instances[0].strategy", catalog);
    expect(
      errors.some(
        (e) =>
          e.path.includes("context_consumption.context_ref") &&
          e.message.includes('"12"'),
      ),
    ).toBe(true);
    expect(contextRefOptions(readStrategyContexts(strategy))).toEqual(["htf_1"]);
    expect(contextRefOptions(readStrategyContexts(strategy))).not.toContain("12");
  });

  it("flags blockers with orphan context_ref after context delete", () => {
    const strategy = {
      contexts: {},
      blockers: [
        {
          instance_id: "b1",
          component_id: "counter_candle_blocker",
          context_consumption: {
            context_ref: "htf_1",
            policy: { policy_id: "htf_regime_gate", params: { allowed_regimes: ["aligned"] } },
          },
        },
      ],
      trade_management: {
        exit_policy: {
          profiles: {
            aligned: { exits: [] },
            countertrend: { exits: [] },
            neutral: { exits: [] },
          },
        },
      },
    };
    const errors = collectUndefinedConsumerContextRefErrors(strategy, "instances[0].strategy");
    expect(errors.some((e) => e.path.includes("blockers[0]"))).toBe(true);
  });

  it("flags setups[] with orphan context_ref", () => {
    const strategy = {
      contexts: {},
      setups: [
        {
          instance_id: "setup_ctx",
          component_id: "untouched_anchor_setup",
          context_consumption: {
            context_ref: "htf_1",
            policy: { policy_id: "htf_regime_gate", params: { allowed_regimes: ["aligned"] } },
          },
        },
      ],
      trade_management: {
        exit_policy: {
          profiles: {
            aligned: { exits: [] },
            countertrend: { exits: [] },
            neutral: { exits: [] },
          },
        },
      },
    };
    const errors = collectUndefinedConsumerContextRefErrors(strategy, "instances[0].strategy");
    expect(errors.some((e) => e.path.includes("setups[0]"))).toBe(true);
  });

  it("flags setups[] unsupported context consumption when catalog disallows", () => {
    const restrictedCatalog: ComponentCatalog = {
      ...catalog,
      components: catalog.components.map((component) =>
        component.role === "setup"
          ? { ...component, supports_context_consumption: false, context_consumption_policies: [] }
          : component,
      ),
    };
    const strategy = {
      contexts: { htf_1: { component_id: "htf_context" } },
      setups: [
        {
          instance_id: "setup_ctx",
          component_id: "untouched_anchor_setup",
          context_consumption: {
            context_ref: "htf_1",
            policy: { policy_id: "htf_regime_gate", params: { allowed_regimes: ["aligned"] } },
          },
        },
      ],
      trade_management: {
        exit_policy: {
          profiles: {
            aligned: { exits: [] },
            countertrend: { exits: [] },
            neutral: { exits: [] },
          },
        },
      },
    };
    const errors = collectComposerStrategyErrors(strategy, "instances[0].strategy", restrictedCatalog);
    expect(errors.some((e) => e.path.includes("setups[0].context_consumption"))).toBe(true);
  });
});

describe("collectComposerStrategyErrors exit_management phase_rules", () => {
  it("validates phase_rules when profile-scoped exits are absent", () => {
    const strategy = {
      trade_management: {
        exit_policy: {
          always_on: {
            exits: [
              {
                instance_id: "atr_sl",
                component_id: "atr_stop_loss",
                distance: { timeframe: "base", period: 14, multiplier: 2.0 },
              },
            ],
          },
          profiles: {
            aligned: { exits: [] },
            countertrend: { exits: [] },
            neutral: { exits: [] },
          },
        },
        exit_management: {
          mode: "diagnostic_only",
          phase_rules: [
            {
              rule_id: "",
              to_phase: "runner",
              condition: {
                component_id: "bars_in_trade",
                params: { threshold: 3 },
              },
            },
            {
              rule_id: "proven_late",
              to_phase: "proven",
              condition: {
                component_id: "bars_in_trade",
                params: { threshold: 1 },
              },
            },
          ],
          stop_management: [],
          runtime_exits: [],
        },
      },
    };

    const errors = collectComposerStrategyErrors(strategy, "instances[0].strategy", null);
    expect(errors.some((e) => e.message.includes("rule_id is required"))).toBe(true);
    expect(errors.some((e) => e.message.includes("non-decreasing phase progression"))).toBe(
      true,
    );
    expect(errors.some((e) => e.path.includes("exit_policy.context_consumption"))).toBe(false);
  });
});
