/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";

import type { ComponentCatalog } from "@/api/types";
import {
  componentsForRole,
  createBlankConfigDraft,
} from "@/features/composer/composerDraft";
import {
  EXIT_MANAGEMENT_PRODUCT_CONTRACT,
  countLegacyExitManagementRules,
  createBlankExitManagement,
} from "@/features/composer/composerExitManagementProduct";

const CATALOG_WITH_LEGACY_BE: ComponentCatalog = {
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

describe("composer exit_management product contract", () => {
  it("blank instance uses diagnostic_only product contract, not legacy always_on/rules", () => {
    const draft = createBlankConfigDraft("test_exp");
    const strategy = draft.instances[0]?.strategy as Record<string, unknown> | undefined;
    const tm = strategy?.trade_management as Record<string, unknown> | undefined;
    const em = tm?.exit_management as Record<string, unknown> | undefined;
    expect(em).toEqual(createBlankExitManagement());
    expect(em?.mode).toBe("diagnostic_only");
    expect(em?.always_on).toBeUndefined();
  });

  it("componentsForRole hides deprecated break_even_stop from authoring options", () => {
    expect(componentsForRole(CATALOG_WITH_LEGACY_BE, "exit_management")).toEqual([]);
    expect(componentsForRole(CATALOG_WITH_LEGACY_BE, "exits")).toHaveLength(1);
  });

  it("counts legacy rules on loaded deprecated configs", () => {
    const legacy = {
      always_on: {
        rules: [{ instance_id: "be_ao", component_id: "break_even_stop" }],
      },
      profiles: {
        aligned: { rules: [{ instance_id: "be_al", component_id: "break_even_stop" }] },
        countertrend: { rules: [] },
        neutral: { rules: [] },
      },
    };
    expect(countLegacyExitManagementRules(legacy)).toBe(2);
  });

  it("product contract reserves empty stop_management and runtime_exits", () => {
    expect(EXIT_MANAGEMENT_PRODUCT_CONTRACT.stop_management).toEqual([]);
    expect(EXIT_MANAGEMENT_PRODUCT_CONTRACT.runtime_exits).toEqual([]);
  });
});
