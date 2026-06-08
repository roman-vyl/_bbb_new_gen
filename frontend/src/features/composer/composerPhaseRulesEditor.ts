import type { JsonObject, ValidationErrorItem } from "@/api/types";

import {
  EXIT_MANAGEMENT_PRODUCT_CONTRACT,
  collectLegacyExitManagementUnsupportedErrors,
  createBlankExitManagement,
  createProductExitManagement,
  exitManagementHasLegacyKeys,
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

export const PHASE_RULE_CONDITION_COMPONENT_IDS = [
  "mfe_atr",
  "mfe_pct",
  "bars_in_trade",
  "adx_di_threshold",
] as const;

export type PhaseRuleConditionComponentId =
  (typeof PHASE_RULE_CONDITION_COMPONENT_IDS)[number];

/** @deprecated Use PHASE_RULE_CONDITION_COMPONENT_IDS */
export const PHASE_RULE_CONDITION_TYPES = PHASE_RULE_CONDITION_COMPONENT_IDS;
/** @deprecated Use PhaseRuleConditionComponentId */
export type PhaseRuleConditionType = PhaseRuleConditionComponentId;

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
        component_id: "mfe_atr",
        params: {
          threshold: 1.0,
          atr: { timeframe: "base", period: 14 },
        },
      },
    },
    {
      rule_id: "to_protected_at_1_5atr",
      to_phase: "protected",
      condition: {
        component_id: "mfe_atr",
        params: {
          threshold: 1.5,
          atr: { timeframe: "base", period: 14 },
        },
      },
    },
    {
      rule_id: "to_runner_at_2_5atr",
      to_phase: "runner",
      condition: {
        component_id: "mfe_atr",
        params: {
          threshold: 2.5,
          atr: { timeframe: "base", period: 14 },
        },
      },
    },
  ];
}

export function createBlankPhaseRule(index = 0): PhaseRuleDraft {
  return {
    rule_id: `phase_rule_${index + 1}`,
    to_phase: "proven",
    condition: {
      component_id: "mfe_atr",
      params: {
        threshold: 1.0,
        atr: { timeframe: "base", period: 14 },
      },
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

export function normalizeConditionForComponent(
  condition: JsonObject,
  componentId: PhaseRuleConditionComponentId,
): JsonObject {
  const params = (condition.params as JsonObject | undefined) ?? {};
  if (componentId === "mfe_atr") {
    const atr = (params.atr as JsonObject | undefined) ?? {};
    return {
      component_id: componentId,
      params: {
        threshold: typeof params.threshold === "number" ? params.threshold : 1.0,
        atr: {
          timeframe: typeof atr.timeframe === "string" ? atr.timeframe : "base",
          period: typeof atr.period === "number" ? atr.period : 14,
        },
      },
    };
  }
  if (componentId === "mfe_pct") {
    return {
      component_id: componentId,
      params: {
        threshold: typeof params.threshold === "number" ? params.threshold : 0.02,
      },
    };
  }
  if (componentId === "bars_in_trade") {
    return {
      component_id: componentId,
      params: {
        threshold: typeof params.threshold === "number" ? params.threshold : 1,
      },
    };
  }
  return {
    component_id: componentId,
    params: {
      timeframe: typeof params.timeframe === "string" ? params.timeframe : "base",
      period: typeof params.period === "number" ? params.period : 14,
      adx_threshold: typeof params.adx_threshold === "number" ? params.adx_threshold : 25,
      require_di_alignment:
        typeof params.require_di_alignment === "boolean"
          ? params.require_di_alignment
          : true,
    },
  };
}

/** @deprecated Use normalizeConditionForComponent */
export function normalizeConditionForType(
  condition: JsonObject,
  type: PhaseRuleConditionComponentId,
): JsonObject {
  return normalizeConditionForComponent(condition, type);
}

export function updatePhaseRuleField(
  rule: PhaseRuleDraft,
  patch: Partial<PhaseRuleDraft> & { condition?: JsonObject },
): PhaseRuleDraft {
  const next: PhaseRuleDraft = { ...rule, ...patch };
  if (patch.condition) {
    const prevCondition = (rule.condition as JsonObject | undefined) ?? {};
    const merged = { ...prevCondition, ...patch.condition };
    const componentId = String(
      merged.component_id ?? prevCondition.component_id ?? "mfe_atr",
    ) as PhaseRuleConditionComponentId;
    next.condition = normalizeConditionForComponent(merged, componentId);
  }
  return next;
}

function validateConditionParams(
  componentId: PhaseRuleConditionComponentId,
  params: JsonObject,
  conditionPath: string,
): ValidationErrorItem[] {
  const errors: ValidationErrorItem[] = [];
  const paramsPath = `${conditionPath}.params`;

  if (componentId === "mfe_atr") {
    const threshold = params.threshold;
    if (!isPositiveFinite(threshold)) {
      errors.push({
        path: `${paramsPath}.threshold`,
        message: "threshold must be a positive number",
      });
    }
    const atr = params.atr;
    if (!atr || typeof atr !== "object" || Array.isArray(atr)) {
      errors.push({
        path: `${paramsPath}.atr`,
        message: "mfe_atr requires params.atr.timeframe and params.atr.period",
      });
    } else {
      const atrObj = atr as JsonObject;
      const timeframe =
        typeof atrObj.timeframe === "string" ? atrObj.timeframe.trim() : "";
      if (!timeframe) {
        errors.push({
          path: `${paramsPath}.atr.timeframe`,
          message: "atr.timeframe is required for mfe_atr",
        });
      }
      if (!isPositiveInteger(atrObj.period)) {
        errors.push({
          path: `${paramsPath}.atr.period`,
          message: "atr.period must be an integer ≥ 1",
        });
      }
    }
    return errors;
  }

  if (componentId === "mfe_pct") {
    if (!isPositiveFinite(params.threshold)) {
      errors.push({
        path: `${paramsPath}.threshold`,
        message: "threshold must be a positive number",
      });
    }
    return errors;
  }

  if (componentId === "bars_in_trade") {
    if (!isPositiveInteger(params.threshold)) {
      errors.push({
        path: `${paramsPath}.threshold`,
        message: "bars_in_trade threshold must be an integer ≥ 1",
      });
    }
    return errors;
  }

  const timeframe = typeof params.timeframe === "string" ? params.timeframe.trim() : "";
  if (!timeframe) {
    errors.push({
      path: `${paramsPath}.timeframe`,
      message: "timeframe is required for adx_di_threshold",
    });
  }
  if (!isPositiveInteger(params.period)) {
    errors.push({
      path: `${paramsPath}.period`,
      message: "period must be an integer ≥ 1",
    });
  }
  if (!isPositiveFinite(params.adx_threshold)) {
    errors.push({
      path: `${paramsPath}.adx_threshold`,
      message: "adx_threshold must be a positive number",
    });
  }
  if (
    params.require_di_alignment !== undefined &&
    typeof params.require_di_alignment !== "boolean"
  ) {
    errors.push({
      path: `${paramsPath}.require_di_alignment`,
      message: "require_di_alignment must be a boolean",
    });
  }
  return errors;
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
    if (typeof condition.type === "string") {
      errors.push({
        path: `${conditionPath}.type`,
        message:
          "unsupported legacy condition.type; use condition.component_id and params",
      });
      return;
    }

    const componentId =
      typeof condition.component_id === "string" ? condition.component_id : "";
    if (
      !PHASE_RULE_CONDITION_COMPONENT_IDS.includes(
        componentId as PhaseRuleConditionComponentId,
      )
    ) {
      errors.push({
        path: `${conditionPath}.component_id`,
        message: `condition.component_id must be one of: ${PHASE_RULE_CONDITION_COMPONENT_IDS.join(", ")}`,
      });
      return;
    }

    const params = condition.params;
    if (!params || typeof params !== "object" || Array.isArray(params)) {
      errors.push({
        path: `${conditionPath}.params`,
        message: "condition.params must be an object",
      });
      return;
    }

    errors.push(
      ...validateConditionParams(
        componentId as PhaseRuleConditionComponentId,
        params as JsonObject,
        conditionPath,
      ),
    );
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
