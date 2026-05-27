import { describe, expect, it } from "vitest";

import {
  collectComposerDraftErrors,
  collectComposerStrategyErrors,
  prepareConfigDraftForApi,
  readExitPolicy,
} from "./composerStrategyContexts";
import { createBlankConfigDraft } from "./composerDraft";

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
});

describe("prepareConfigDraftForApi", () => {
  it("strips exit_policy.context before save shape", () => {
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
    const prepared = prepareConfigDraftForApi(draft);
    const exitPolicy = readExitPolicy(prepared.instances[0]!.strategy);
    expect(exitPolicy.context).toBeUndefined();
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
