/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ComponentCatalog, StrategyConfigDraft } from "@/api/types";
import { applyComponentDefaults, createBlankConfigDraft } from "@/features/composer/composerDraft";
import { ParamFields, coerceParamBoolean } from "@/features/composer/ParamFields";
import { prepareConfigDraftForApi } from "@/features/composer/composerStrategyContexts";

afterEach(() => cleanup());

const TREND_STRENGTH_CATALOG: ComponentCatalog = {
  family: "ema_pullback",
  schema_version: 1,
  sections: [{ section_id: "blockers", label: "Blockers", role: "blockers", list_slot: true }],
  components: [
    {
      component_id: "trend_strength_episode_blocker",
      role: "blockers",
      label: "Trend strength episode blocker",
      list_slot: true,
      params_schema: {
        require_di_alignment_on_peak: {
          type: "boolean",
          label: "Require DI alignment at confirmation",
          default: true,
        },
        block_on_opposite_di_flip: {
          type: "boolean",
          label: "Block on opposite DI flip",
          default: true,
        },
      },
    },
  ],
  context_providers: [],
  context_consumption_roles: [],
};

describe("coerceParamBoolean", () => {
  it("parses string false as unchecked", () => {
    expect(coerceParamBoolean("false")).toBe(false);
    expect(coerceParamBoolean("false", true)).toBe(false);
  });

  it("parses string true as checked", () => {
    expect(coerceParamBoolean("true")).toBe(true);
  });
});

describe("ParamFields boolean", () => {
  it("shows unchecked when value is string false", () => {
    render(
      <ParamFields
        paramsSchema={{
          flag: { type: "boolean", label: "Flag", default: true },
        }}
        value={{ flag: "false" }}
        onChange={() => undefined}
      />,
    );
    const box = screen.getByRole("checkbox", { name: "Flag" }) as HTMLInputElement;
    expect(box.checked).toBe(false);
  });

  it("writes boolean false on uncheck", () => {
    let slot = { flag: true };
    render(
      <ParamFields
        paramsSchema={{
          flag: { type: "boolean", label: "Flag", default: true },
        }}
        value={slot}
        onChange={(next) => {
          slot = next as typeof slot;
        }}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Flag" }));
    expect(slot.flag).toBe(false);
  });
});

describe("prepareConfigDraftForApi trend_strength booleans", () => {
  it("keeps explicit false flags in saved blocker payload", () => {
    const schema = TREND_STRENGTH_CATALOG.components[0]!;
    const slot = applyComponentDefaults(
      {
        instance_id: "ts1",
        component_id: "trend_strength_episode_blocker",
        require_di_alignment_on_peak: false,
        block_on_opposite_di_flip: false,
      },
      schema,
    );
    const draft: StrategyConfigDraft = {
      ...createBlankConfigDraft("ema_pullback"),
      instances: [
        {
          instance_id: "inst_1",
          variant: "inst_1",
          symbol: "BTCUSDT",
          base_timeframe: "1h",
          strategy: {
            ...createBlankConfigDraft("ema_pullback").instances[0]!.strategy,
            blockers: [slot],
          },
        },
      ],
    };
    const prepared = prepareConfigDraftForApi(draft, TREND_STRENGTH_CATALOG);
    const blocker = (prepared.instances[0]!.strategy.blockers as Record<string, unknown>[])[0]!;
    expect(blocker.require_di_alignment_on_peak).toBe(false);
    expect(blocker.block_on_opposite_di_flip).toBe(false);
  });
});
