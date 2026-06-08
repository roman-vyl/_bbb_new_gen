import type { JsonObject, ValidationErrorItem } from "@/api/types";

import {
  EXIT_MANAGEMENT_PRODUCT_CONTRACT,
  collectLegacyExitManagementUnsupportedErrors,
  createBlankExitManagement,
  createProductExitManagement,
  exitManagementHasLegacyKeys,
  hasLegacyExitManagementRules,
  normalizeExitManagementV2,
} from "@/features/composer/composerExitManagementProduct";
import { collectManagedRulesValidationErrors } from "@/features/composer/composerManagedExitManagement";

export const PHASE_RULE_TARGET_PHASES = [
  "proven",
  "protected",
  "runner",
  "exhaustion",
] as const;

export type PhaseRuleTargetPhase = (typeof PHASE_RULE_TARGET_PHASES)[number];

export const PHASE_RULE_CONDITION_TYPES = ["mfe_atr", "mfe_pct", "bars_in_trade"] as const;

export type PhaseRuleConditionType = (typeof PHASE_RULE_CONDITION_TYPES)[number];

/** Monotonic phase progression order (initial_risk is implicit start). */
export const TRADE_MANAGEMENT_PHASE_ORDER = [
  "initial_risk",
  "proven",
  "protected",
  "runner",
  "exhaustion",
] as const;

export type PhaseRuleDraft = JsonObject;

export function defaultDiagnosticPhaseRules(): PhaseRuleDraft[] {
  return [
    {
      rule_id: "to_proven_at_1atr",
      to_phase: "proven",
      condition: {
        type: "mfe_atr",
        threshold: 1.0,
        atr: { timeframe: "base", period: 14 },
      },
    },
    {
      rule_id: "to_protected_at_1_5atr",
      to_phase: "protected",
      condition: {
        type: "mfe_atr",
        threshold: 1.5,
        atr: { timeframe: "base", period: 14 },
      },
    },
    {
      rule_id: "to_runner_at_2_5atr",
      to_phase: "runner",
      condition: {
        type: "mfe_atr",
        threshold: 2.5,
        atr: { timeframe: "base", period: 14 },
      },
    },
  ];
}

export function createBlankPhaseRule(index = 0): PhaseRuleDraft {
  return {
    rule_id: `phase_rule_${index + 1}`,
    to_phase: "proven",
    condition: {
      type: "mfe_atr",
      threshold: 1.0,
      atr: { timeframe: "base", period: 14 },
    },
  };
}

export function readPhaseRules(exitManagement: JsonObject): PhaseRuleDraft[] {
  const rules = exitManagement.phase_rules;
  return Array.isArray(rules) ? (rules as PhaseRuleDraft[]) : [];
}

export function ensureDiagnosticOnlyProductShape(exitManagement: JsonObject): JsonObject {
  return createProductExitManagement(readPhaseRules(exitManagement));
}

/** Explicitly replace deprecated legacy rules with the empty diagnostic-only product contract. */
export function replaceLegacyExitManagementWithProductShape(strategy: JsonObject): JsonObject {
  return writeExitManagementOnStrategy(strategy, createBlankExitManagement());
}

/** Explicitly replace deprecated legacy rules with the default diagnostic phase_rules preset. */
export function replaceLegacyExitManagementWithDefaultDiagnosticPhases(
  strategy: JsonObject,
): JsonObject {
  return writeExitManagementOnStrategy(strategy, createProductExitManagement(defaultDiagnosticPhaseRules()));
}

export function exitManagementDraftIsUnsupportedLegacy(exitManagement: JsonObject): boolean {
  return exitManagementHasLegacyKeys(exitManagement);
}

export function writePhaseRules(exitManagement: JsonObject, rules: PhaseRuleDraft[]): JsonObject {
  return normalizeExitManagementV2({
    ...exitManagement,
    phase_rules: rules,
  });
}

export function writeExitManagementOnStrategy(
  strategy: JsonObject,
  exitManagement: JsonObject,
): JsonObject {
  const tradeManagement = (strategy.trade_management as JsonObject | undefined) ?? {};
  return {
    ...strategy,
    trade_management: {
      ...tradeManagement,
      exit_management: normalizeExitManagementV2(exitManagement),
    },
  };
}

export function phaseRulePath(pathPrefix: string, index: number, suffix = ""): string {
  const base = `${pathPrefix}.trade_management.exit_management.phase_rules[${index}]`;
  return suffix ? `${base}.${suffix}` : base;
}

function phaseRank(phase: string): number | null {
  const idx = TRADE_MANAGEMENT_PHASE_ORDER.indexOf(
    phase as (typeof TRADE_MANAGEMENT_PHASE_ORDER)[number],
  );
  return idx >= 0 ? idx : null;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

export function normalizeConditionForType(
  condition: JsonObject,
  type: PhaseRuleConditionType,
): JsonObject {
  const threshold = condition.threshold;
  if (type === "mfe_atr") {
    const atr = (condition.atr as JsonObject | undefined) ?? {};
    return {
      type,
      threshold: typeof threshold === "number" ? threshold : 1.0,
      atr: {
        timeframe: typeof atr.timeframe === "string" ? atr.timeframe : "base",
        period: typeof atr.period === "number" ? atr.period : 14,
      },
    };
  }
  if (type === "mfe_pct") {
    return {
      type,
      threshold: typeof threshold === "number" ? threshold : 0.02,
    };
  }
  return {
    type,
    threshold: typeof threshold === "number" ? threshold : 1,
  };
}

export function updatePhaseRuleField(
  rule: PhaseRuleDraft,
  patch: Partial<PhaseRuleDraft> & { condition?: JsonObject },
): PhaseRuleDraft {
  const next: PhaseRuleDraft = { ...rule, ...patch };
  if (patch.condition) {
    const prevCondition = (rule.condition as JsonObject | undefined) ?? {};
    const merged = { ...prevCondition, ...patch.condition };
    const type = String(
      merged.type ?? prevCondition.type ?? "mfe_atr",
    ) as PhaseRuleConditionType;
    next.condition = normalizeConditionForType(merged, type);
  }
  return next;
}

export function collectPhaseRulesValidationErrors(
  exitManagement: JsonObject,
  pathPrefix: string,
): ValidationErrorItem[] {
  const errors: ValidationErrorItem[] = [];
  const emPath = `${pathPrefix}.trade_management.exit_management`;

  const mode = exitManagement.mode;
  if (mode !== undefined && mode !== "diagnostic_only" && mode !== "managed") {
    errors.push({
      path: `${emPath}.mode`,
      message: "mode must be diagnostic_only or managed",
    });
  }

  if (!Array.isArray(exitManagement.phase_rules)) {
    errors.push({
      path: `${emPath}.phase_rules`,
      message: "phase_rules must be an array",
    });
    return errors;
  }

  const seenRuleIds = new Set<string>();
  let lastPhaseRank = 0;

  exitManagement.phase_rules.forEach((raw, index) => {
    const rule = raw as JsonObject;
    const rulePath = phaseRulePath(pathPrefix, index);
    const ruleId = typeof rule.rule_id === "string" ? rule.rule_id.trim() : "";
    if (!ruleId) {
      errors.push({ path: `${rulePath}.rule_id`, message: "rule_id is required" });
    } else if (seenRuleIds.has(ruleId)) {
      errors.push({ path: `${rulePath}.rule_id`, message: `duplicate rule_id: ${ruleId}` });
    } else {
      seenRuleIds.add(ruleId);
    }

    const toPhase = typeof rule.to_phase === "string" ? rule.to_phase : "";
    if (!PHASE_RULE_TARGET_PHASES.includes(toPhase as PhaseRuleTargetPhase)) {
      errors.push({
        path: `${rulePath}.to_phase`,
        message: `to_phase must be one of: ${PHASE_RULE_TARGET_PHASES.join(", ")}`,
      });
    } else {
      const rank = phaseRank(toPhase);
      if (rank !== null && rank < lastPhaseRank) {
        errors.push({
          path: rulePath,
          message:
            "phase_rules must follow non-decreasing phase progression (initial_risk → proven → protected → runner → exhaustion)",
        });
      }
      if (rank !== null) {
        lastPhaseRank = rank;
      }
    }

    const condition = (rule.condition as JsonObject | undefined) ?? {};
    const conditionPath = `${rulePath}.condition`;
    const condType = typeof condition.type === "string" ? condition.type : "";
    if (!PHASE_RULE_CONDITION_TYPES.includes(condType as PhaseRuleConditionType)) {
      errors.push({
        path: `${conditionPath}.type`,
        message: `condition.type must be one of: ${PHASE_RULE_CONDITION_TYPES.join(", ")}`,
      });
      return;
    }

    const threshold = condition.threshold;
    if (!isPositiveFinite(threshold)) {
      errors.push({
        path: `${conditionPath}.threshold`,
        message: "threshold must be a positive number",
      });
    }

    if (condType === "bars_in_trade") {
      if (!isPositiveInteger(threshold)) {
        errors.push({
          path: `${conditionPath}.threshold`,
          message: "bars_in_trade threshold must be an integer ≥ 1",
        });
      }
      if (condition.atr !== undefined) {
        errors.push({
          path: `${conditionPath}.atr`,
          message: "atr is only allowed for mfe_atr conditions",
        });
      }
    }

    if (condType === "mfe_pct") {
      if (condition.atr !== undefined) {
        errors.push({
          path: `${conditionPath}.atr`,
          message: "atr is only allowed for mfe_atr conditions",
        });
      }
    }

    if (condType === "mfe_atr") {
      const atr = condition.atr;
      if (!atr || typeof atr !== "object" || Array.isArray(atr)) {
        errors.push({
          path: `${conditionPath}.atr`,
          message: "mfe_atr requires atr.timeframe and atr.period",
        });
      } else {
        const atrObj = atr as JsonObject;
        const timeframe =
          typeof atrObj.timeframe === "string" ? atrObj.timeframe.trim() : "";
        if (!timeframe) {
          errors.push({
            path: `${conditionPath}.atr.timeframe`,
            message: "atr.timeframe is required for mfe_atr",
          });
        }
        if (!isPositiveInteger(atrObj.period)) {
          errors.push({
            path: `${conditionPath}.atr.period`,
            message: "atr.period must be an integer ≥ 1",
          });
        }
      }
    }
  });

  return errors;
}

export function collectExitManagementProductValidationErrors(
  strategy: JsonObject,
  pathPrefix: string,
): ValidationErrorItem[] {
  const tradeManagement = (strategy.trade_management as JsonObject | undefined) ?? {};
  const exitManagement = (tradeManagement.exit_management as JsonObject | undefined) ?? {};

  const legacyErrors = collectLegacyExitManagementUnsupportedErrors(exitManagement, pathPrefix);
  if (legacyErrors.length > 0) {
    return legacyErrors;
  }

  const hasProductAuthoring =
    exitManagement.mode === "diagnostic_only" ||
    exitManagement.mode === "managed" ||
    Array.isArray(exitManagement.phase_rules);

  if (!hasProductAuthoring) {
    return [];
  }

  const normalized = normalizeExitManagementV2(exitManagement);
  return [
    ...collectPhaseRulesValidationErrors(normalized, pathPrefix),
    ...collectManagedRulesValidationErrors(normalized, pathPrefix),
  ];
}

export { EXIT_MANAGEMENT_PRODUCT_CONTRACT };
