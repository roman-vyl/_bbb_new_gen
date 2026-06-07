import { describe, expect, it } from "vitest";

import type { JsonObject } from "@/api/types";
import {
  collectPhaseRulesValidationErrors,
  createBlankPhaseRule,
  defaultDiagnosticPhaseRules,
  normalizeConditionForType,
  readPhaseRules,
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
  });

  it("writePhaseRules enforces diagnostic_only product shape", () => {
    const next = writePhaseRules({}, defaultDiagnosticPhaseRules());
    expect(next.mode).toBe("diagnostic_only");
    expect(readPhaseRules(next)).toHaveLength(3);
    expect(next.stop_management).toEqual([]);
    expect(next.runtime_exits).toEqual([]);
  });

  it("changing condition type updates shape correctly", () => {
    let rule = createBlankPhaseRule();
    rule = updatePhaseRuleField(rule, {
      condition: normalizeConditionForType({}, "mfe_pct"),
    });
    expect((rule.condition as JsonObject).type).toBe("mfe_pct");
    expect((rule.condition as JsonObject).atr).toBeUndefined();

    rule = updatePhaseRuleField(rule, {
      condition: normalizeConditionForType({}, "bars_in_trade"),
    });
    expect((rule.condition as JsonObject).type).toBe("bars_in_trade");
    expect((rule.condition as JsonObject).threshold).toBe(1);

    rule = updatePhaseRuleField(rule, {
      condition: normalizeConditionForType({}, "mfe_atr"),
    });
    expect((rule.condition as JsonObject).atr).toEqual({ timeframe: "base", period: 14 });
  });

  it("edit threshold updates rule draft", () => {
    const rule = updatePhaseRuleField(createBlankPhaseRule(), {
      condition: { threshold: 2.5 },
    });
    expect((rule.condition as JsonObject).threshold).toBe(2.5);
  });

  it("flags invalid empty rule_id", () => {
    const em = writePhaseRules(createBlankExitManagement(), [
      { rule_id: "  ", to_phase: "proven", condition: { type: "mfe_atr", threshold: 1, atr: { timeframe: "base", period: 14 } } },
    ]);
    const errors = collectPhaseRulesValidationErrors(em, PATH);
    expect(errors.some((e) => e.path.endsWith(".rule_id"))).toBe(true);
  });

  it("flags non-monotonic phase progression", () => {
    const em = writePhaseRules(createBlankExitManagement(), [
      {
        rule_id: "runner_first",
        to_phase: "runner",
        condition: { type: "bars_in_trade", threshold: 5 },
      },
      {
        rule_id: "proven_second",
        to_phase: "proven",
        condition: { type: "bars_in_trade", threshold: 3 },
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
        condition: { type: "bars_in_trade", threshold: 1.5 },
      },
    ]);
    const errors = collectPhaseRulesValidationErrors(em, PATH);
    expect(errors.some((e) => e.message.includes("integer"))).toBe(true);
  });

  it("flags mfe_atr missing atr", () => {
    const em = writePhaseRules(createBlankExitManagement(), [
      {
        rule_id: "no_atr",
        to_phase: "proven",
        condition: { type: "mfe_atr", threshold: 1.0 },
      },
    ]);
    const errors = collectPhaseRulesValidationErrors(em, PATH);
    expect(errors.some((e) => e.path.includes(".atr"))).toBe(true);
  });

  it("rejects non-empty stop_management in v1", () => {
    const em = {
      ...createBlankExitManagement(),
      phase_rules: defaultDiagnosticPhaseRules(),
      stop_management: [{ id: "x" }],
    };
    const errors = collectPhaseRulesValidationErrors(em, PATH);
    expect(errors.some((e) => e.path.endsWith(".stop_management"))).toBe(true);
  });
});
