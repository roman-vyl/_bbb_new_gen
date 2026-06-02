/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";

import type { ComponentCatalog, StrategyConfigDraft } from "@/api/types";
import { createBlankConfigDraft } from "@/features/composer/composerDraft";

const CATALOG: ComponentCatalog = {
  family: "ema_pullback",
  schema_version: 1,
  sections: [],
  components: [
    {
      component_id: "break_even_stop",
      role: "exit_management",
      label: "Break-even stop",
      params_schema: {
        trigger_r: { type: "number", default: 1.0 },
        offset_r: { type: "number", default: 0.0 },
        apply_once: { type: "boolean", default: true },
      },
    },
    {
      component_id: "atr_stop_loss",
      role: "exits",
      label: "ATR SL",
    },
  ],
  context_providers: [],
  context_consumption_roles: [],
};

describe("composer exit_management draft shape", () => {
  it("blank instance includes empty exit_management groups", () => {
    const draft = createBlankConfigDraft("test_exp");
    const tm = draft.instances[0]?.strategy?.trade_management as Record<string, unknown>;
    const em = tm?.exit_management as Record<string, unknown>;
    expect(em).toBeTruthy();
    const alwaysOn = em?.always_on as Record<string, unknown>;
    expect(Array.isArray(alwaysOn?.rules)).toBe(true);
    expect((alwaysOn?.rules as unknown[]).length).toBe(0);
  });

  it("can author always_on and profile break_even rules in draft JSON", () => {
    const draft = createBlankConfigDraft("test_exp") as StrategyConfigDraft;
    const strategy = draft.instances[0].strategy as Record<string, unknown>;
    const tm = strategy.trade_management as Record<string, unknown>;
    const exitPolicy = tm.exit_policy as Record<string, unknown>;
    const alwaysOnPolicy = exitPolicy.always_on as Record<string, unknown>;
    alwaysOnPolicy.exits = [
      {
        instance_id: "atr_sl",
        component_id: "atr_stop_loss",
        distance: { timeframe: "base", period: 14, multiplier: 2 },
      },
    ];
    const em = tm.exit_management as Record<string, unknown>;
    const alwaysOnEm = em.always_on as Record<string, unknown>;
    alwaysOnEm.rules = [
      {
        instance_id: "be_ao",
        component_id: "break_even_stop",
        trigger_r: 1,
        offset_r: 0,
        apply_once: true,
      },
    ];
    const profiles = em.profiles as Record<string, Record<string, unknown>>;
    profiles.aligned.rules = [
      {
        instance_id: "be_al",
        component_id: "break_even_stop",
        trigger_r: 1.5,
        offset_r: 0,
        apply_once: true,
      },
    ];
    expect(CATALOG.components.some((c) => c.role === "exit_management")).toBe(true);
    const rules = (em.always_on as Record<string, unknown>).rules as unknown[];
    expect(rules[0]).toMatchObject({ component_id: "break_even_stop" });
  });
});
