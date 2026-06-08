import { describe, expect, it } from "vitest";

import type { JsonObject } from "@/api/types";
import { collectManagedRulesValidationErrors } from "@/features/composer/composerManagedExitManagement";
import {
  collectExitManagementProductValidationErrors,
  collectPhaseRulesValidationErrors,
  createBlankPhaseRule,
  defaultDiagnosticPhaseRules,
  ensureDiagnosticOnlyProductShape,
  normalizeConditionForComponent,
  readPhaseRules,
  replaceLegacyExitManagementWithDefaultDiagnosticPhases,
  replaceLegacyExitManagementWithProductShape,
  updatePhaseRuleField,
  writePhaseRules,
} from "@/features/composer/composerPhaseRulesEditor";
import { createBlankExitManagement } from "@/features/composer/composerExitManagementProduct";

const PATH = "instances[0].strategy";

describe("phaseRulesEditor helpers", () => {
  it("default preset has three monotonic mfe_atr rules", () => {
    const rules = defaultDiagnosticPhaseRules();
    expect(rules).toHaveLength(3);
    expect(rules.map((r) => r.to_phase)).toEqual(["proven", "protected", "runner"]);
    expect((rules[0]?.condition as JsonObject).component_id).toBe("mfe_atr");
  });

  it("writePhaseRules preserves mode and normalizes v2 shape", () => {
    const next = writePhaseRules({}, defaultDiagnosticPhaseRules());
    expect(next.mode).toBe("diagnostic_only");
    expect(readPhaseRules(next)).toHaveLength(3);
    expect(next.stop_management).toEqual([]);
    expect(next.take_management).toEqual([]);
    expect(next.runtime_exits).toEqual([]);

    const managed = writePhaseRules(
      { mode: "managed", stop_management: [{ rule_id: "be" }] },
      defaultDiagnosticPhaseRules(),
    );
    expect(managed.mode).toBe("managed");
    expect(managed.stop_management).toHaveLength(1);
  });

  it("changing condition component updates shape correctly", () => {
    let rule = createBlankPhaseRule();
    rule = updatePhaseRuleField(rule, {
      condition: normalizeConditionForComponent({}, "mfe_pct"),
    });
    expect((rule.condition as JsonObject).component_id).toBe("mfe_pct");
    expect((rule.condition as JsonObject).params).toEqual({ threshold: 0.02 });

    rule = updatePhaseRuleField(rule, {
      condition: normalizeConditionForComponent({}, "bars_in_trade"),
    });
    expect((rule.condition as JsonObject).component_id).toBe("bars_in_trade");
    expect(((rule.condition as JsonObject).params as JsonObject).threshold).toBe(1);

    rule = updatePhaseRuleField(rule, {
      condition: normalizeConditionForComponent({}, "mfe_atr"),
    });
    expect(((rule.condition as JsonObject).params as JsonObject).atr).toEqual({
      timeframe: "base",
      period: 14,
    });

    rule = updatePhaseRuleField(rule, {
      condition: normalizeConditionForComponent({}, "adx_di_threshold"),
    });
    expect((rule.condition as JsonObject).component_id).toBe("adx_di_threshold");
    expect(((rule.condition as JsonObject).params as JsonObject).require_di_alignment).toBe(
      true,
    );
  });

  it("edit threshold updates rule draft", () => {
    const rule = updatePhaseRuleField(createBlankPhaseRule(), {
      condition: { params: { threshold: 2.5 } },
    });
    expect(((rule.condition as JsonObject).params as JsonObject).threshold).toBe(2.5);
  });

  it("flags invalid empty rule_id", () => {
    const em = writePhaseRules(createBlankExitManagement(), [
      {
        rule_id: "  ",
        to_phase: "proven",
        condition: {
          component_id: "mfe_atr",
          params: { threshold: 1, atr: { timeframe: "base", period: 14 } },
        },
      },
    ]);
    const errors = collectPhaseRulesValidationErrors(em, PATH);
    expect(errors.some((e) => e.path.endsWith(".rule_id"))).toBe(true);
  });

  it("flags non-monotonic phase progression", () => {
    const em = writePhaseRules(createBlankExitManagement(), [
      {
        rule_id: "runner_first",
        to_phase: "runner",
        condition: { component_id: "bars_in_trade", params: { threshold: 5 } },
      },
      {
        rule_id: "proven_second",
        to_phase: "proven",
        condition: { component_id: "bars_in_trade", params: { threshold: 3 } },
      },
    ]);
    const errors = collectPhaseRulesValidationErrors(em, PATH);
    expect(errors.some((e) => e.message.includes("non-decreasing phase progression"))).toBe(true);
  });

  it("flags bars_in_trade non-integer threshold", () => {
    const em = writePhaseRules(createBlankExitManagement(), [
      {
        rule_id: "bars",
        to_phase: "proven",
        condition: { component_id: "bars_in_trade", params: { threshold: 1.5 } },
      },
    ]);
    const errors = collectPhaseRulesValidationErrors(em, PATH);
    expect(errors.some((e) => e.message.includes("integer"))).toBe(true);
  });

  it("rejects legacy condition.type", () => {
    const em = writePhaseRules(createBlankExitManagement(), [
      {
        rule_id: "legacy",
        to_phase: "proven",
        condition: { type: "mfe_atr", threshold: 1.0 },
      },
    ]);
    const errors = collectPhaseRulesValidationErrors(em, PATH);
    expect(errors.some((e) => e.message.includes("legacy condition.type"))).toBe(true);
  });

  it("flags mfe_atr missing atr", () => {
    const em = writePhaseRules(createBlankExitManagement(), [
      {
        rule_id: "no_atr",
        to_phase: "proven",
        condition: { component_id: "mfe_atr", params: { threshold: 1.0 } },
      },
    ]);
    const errors = collectPhaseRulesValidationErrors(em, PATH);
    expect(errors.some((e) => e.path.includes(".atr"))).toBe(true);
  });

  it("rejects non-empty stop_management when mode is diagnostic_only", () => {
    const em = {
      ...createBlankExitManagement(),
      phase_rules: defaultDiagnosticPhaseRules(),
      stop_management: [{ rule_id: "x", component_id: "break_even_stop" }],
    };
    const errors = collectManagedRulesValidationErrors(em, PATH);
    expect(errors.some((e) => e.path.endsWith(".stop_management"))).toBe(true);
  });

  it("ensureDiagnosticOnlyProductShape strips legacy always_on/profiles keys", () => {
    const legacy = {
      always_on: { rules: [{ component_id: "break_even_stop" }] },
      profiles: { aligned: { rules: [] }, countertrend: { rules: [] }, neutral: { rules: [] } },
      mode: "diagnostic_only",
      phase_rules: [
        {
          rule_id: "x",
          to_phase: "proven",
          condition: { component_id: "bars_in_trade", params: { threshold: 1 } },
        },
      ],
    };
    const next = ensureDiagnosticOnlyProductShape(legacy);
    expect(next.always_on).toBeUndefined();
    expect(next.profiles).toBeUndefined();
    expect(readPhaseRules(next)).toHaveLength(1);
  });

  it("collectExitManagementProductValidationErrors blocks legacy always_on/profiles", () => {
    const strategy = {
      trade_management: {
        exit_management: {
          always_on: { rules: [{ component_id: "break_even_stop" }] },
          profiles: {
            aligned: { rules: [] },
            countertrend: { rules: [] },
            neutral: { rules: [] },
          },
        },
      },
    };
    const errors = collectExitManagementProductValidationErrors(strategy, PATH);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("unsupported legacy");
  });

  it("replaceLegacyExitManagementWithProductShape resets to blank v2 on explicit user action", () => {
    const strategy = {
      trade_management: {
        exit_management: {
          always_on: { rules: [{ component_id: "break_even_stop" }] },
          profiles: {
            aligned: { rules: [] },
            countertrend: { rules: [] },
            neutral: { rules: [] },
          },
        },
      },
    };
    const next = replaceLegacyExitManagementWithProductShape(strategy);
    const em = (next.trade_management as JsonObject).exit_management as JsonObject;
    expect(em).toEqual(createBlankExitManagement());
    expect(collectExitManagementProductValidationErrors(next, PATH)).toEqual([]);
  });

  it("replaceLegacyExitManagementWithDefaultDiagnosticPhases resets to v2 preset on explicit user action", () => {
    const strategy = {
      trade_management: {
        exit_management: {
          always_on: { rules: [{ component_id: "break_even_stop" }] },
          profiles: {
            aligned: { rules: [] },
            countertrend: { rules: [] },
            neutral: { rules: [] },
          },
        },
      },
    };
    const next = replaceLegacyExitManagementWithDefaultDiagnosticPhases(strategy);
    const em = (next.trade_management as JsonObject).exit_management as JsonObject;
    expect(readPhaseRules(em)).toEqual(defaultDiagnosticPhaseRules());
    expect(em.always_on).toBeUndefined();
    expect(collectExitManagementProductValidationErrors(next, PATH)).toEqual([]);
  });
});
