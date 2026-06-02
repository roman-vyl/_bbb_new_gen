import { describe, expect, it } from "vitest";

import type { ComponentCatalog } from "@/api/types";

import { createBlankConfigDraft } from "./composerDraft";
import {
  collectComposerDraftErrors,
  collectComposerStrategyErrors,
  prepareConfigDraftForApi,
  readExitPolicy,
} from "./composerStrategyContexts";

const CATALOG_STUB: ComponentCatalog = {
  family: "ema_pullback",
  schema_version: 1,
  sections: [],
  components: [
    {
      component_id: "untouched_anchor_setup",
      role: "setup",
      label: "Setup",
      supports_context_consumption: false,
    },
  ],
  context_providers: [],
  context_consumption_roles: [],
};

describe("collectComposerStrategyErrors", () => {
  it("rejects legacy exit_policy.context in draft", () => {
    const strategy = {
      trade_management: {
        exit_policy: {
          context: { component_id: "htf_context" },
          profiles: {
            aligned: { exits: [] },
            countertrend: { exits: [] },
            neutral: { exits: [] },
          },
        },
      },
    };
    const errors = collectComposerStrategyErrors(strategy, "instances[0].strategy");
    expect(errors.some((e) => e.path.includes("exit_policy.context"))).toBe(true);
  });

  it("requires context_consumption when profile exits are non-empty", () => {
    const strategy = {
      contexts: { htf: { component_id: "htf_context", timeframe: "4h" } },
      trade_management: {
        exit_policy: {
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
    const errors = collectComposerStrategyErrors(strategy, "instances[0].strategy");
    expect(errors.some((e) => e.path.includes("context_consumption"))).toBe(true);
  });

  it("rejects unsupported setups[].context_consumption when catalog disallows it", () => {
    const strategy = {
      setups: [
        {
          component_id: "untouched_anchor_setup",
          lookback: 50,
          active_bars: 3,
          context_consumption: {
            context_ref: "htf",
            policy: { policy_id: "htf_state_gate" },
          },
        },
      ],
    };
    const errors = collectComposerStrategyErrors(
      strategy,
      "instances[0].strategy",
      CATALOG_STUB,
    );
    expect(
      errors.some((e) => e.path === "instances[0].strategy.setups[0].context_consumption"),
    ).toBe(true);
  });
});

describe("prepareConfigDraftForApi", () => {
  it("does not strip exit_policy.context — client validation must block save", () => {
    const draft = createBlankConfigDraft();
    const inst = draft.instances[0]!;
    inst.strategy = {
      ...inst.strategy,
      trade_management: {
        exit_policy: {
          context: { component_id: "htf_context" },
          always_on: { exits: [] },
          profiles: {
            aligned: { exits: [] },
            countertrend: { exits: [] },
            neutral: { exits: [] },
          },
        },
      },
    };
    expect(collectComposerDraftErrors(draft).length).toBeGreaterThan(0);
    const prepared = prepareConfigDraftForApi(draft);
    expect(readExitPolicy(prepared.instances[0]!.strategy).context).toBeDefined();
  });

  it("collectComposerDraftErrors blocks profile exits without consumption", () => {
    const draft = createBlankConfigDraft();
    const inst = draft.instances[0]!;
    inst.strategy = {
      ...inst.strategy,
      contexts: { htf: { component_id: "htf_context", timeframe: "4h" } },
      trade_management: {
        exit_policy: {
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
    expect(collectComposerDraftErrors(draft).length).toBeGreaterThan(0);
  });
});
