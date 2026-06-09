import type { ComponentCatalog, JsonObject, ValidationErrorItem } from "@/api/types";

import { normalizeExitManagementV2 } from "@/features/composer/composerExitManagementProduct";
import {
  RUNTIME_EXIT_KINDS,
  RUNTIME_EXIT_ROLE,
  defaultEmaCrossRuntimeExitParams,
  defaultPhaseRuntimeExitParams,
  defaultRsiRuntimeExitParams,
  normalizeRuntimeExitRule,
  normalizeRuntimeExitRules,
  runtimeExitComponentIds,
} from "@/features/composer/composerRuntimeExitAuthoring";

export const EXIT_MANAGEMENT_MODES = ["diagnostic_only", "managed"] as const;
export type ExitManagementMode = (typeof EXIT_MANAGEMENT_MODES)[number];

export const ACTIVATE_WHEN_PHASES = [
  "initial_risk",
  "proven",
  "protected",
  "runner",
  "exhaustion",
] as const;

export const STOP_MANAGEMENT_COMPONENT_IDS = ["break_even_stop", "lock_profit_stop"] as const;
export const TAKE_MANAGEMENT_COMPONENT_IDS = ["take_profile_switch"] as const;
export const TAKE_PROFILE_SWITCH_ACTIONS = ["keep_initial", "disable_initial_tp"] as const;

export {
  RUNTIME_EXIT_KINDS,
  RUNTIME_EXIT_ROLE,
  runtimeExitComponentIds,
  runtimeExitComponents,
} from "@/features/composer/composerRuntimeExitAuthoring";

export type ManagementRuleLayer =
  | "stop_management"
  | "take_management"
  | "runtime_exits";

export type ManagementRuleDraft = JsonObject;

export function readManagementRules(
  exitManagement: JsonObject,
  layer: ManagementRuleLayer,
): ManagementRuleDraft[] {
  const rules = exitManagement[layer];
  return Array.isArray(rules) ? (rules as ManagementRuleDraft[]) : [];
}

export function writeManagementRules(
  exitManagement: JsonObject,
  layer: ManagementRuleLayer,
  rules: ManagementRuleDraft[],
): JsonObject {
  const normalizedRules =
    layer === "runtime_exits" ? normalizeRuntimeExitRules(rules) : rules;
  return normalizeExitManagementV2({
    ...exitManagement,
    [layer]: normalizedRules,
  });
}

export function writeExitManagementMode(
  exitManagement: JsonObject,
  mode: ExitManagementMode,
): JsonObject {
  return normalizeExitManagementV2({
    ...exitManagement,
    mode,
  });
}

export function managementRulePath(
  pathPrefix: string,
  layer: ManagementRuleLayer,
  index: number,
  suffix = "",
): string {
  const base = `${pathPrefix}.trade_management.exit_management.${layer}[${index}]`;
  return suffix ? `${base}.${suffix}` : base;
}

export function defaultBreakEvenStopParams(): JsonObject {
  return { buffer_type: "none", buffer: 0.0 };
}

export function defaultLockProfitStopParams(): JsonObject {
  return {
    lock_atr: 1.0,
    atr: { timeframe: "base", period: 14 },
  };
}

export function defaultTakeProfileSwitchParams(): JsonObject {
  return { action: "disable_initial_tp" };
}

export function defaultActivateWhen(phase: string = "protected"): JsonObject {
  return { phase_at_least: phase };
}

export function createBlankManagementRule(
  layer: ManagementRuleLayer,
  index = 0,
  componentId?: string,
): ManagementRuleDraft {
  const slot = index + 1;
  if (layer === "stop_management") {
    const cid = componentId ?? "break_even_stop";
    return {
      rule_id: `${cid}_${slot}`,
      component_id: cid,
      activate_when: defaultActivateWhen("protected"),
      params: cid === "lock_profit_stop" ? defaultLockProfitStopParams() : defaultBreakEvenStopParams(),
    };
  }
  if (layer === "take_management") {
    return {
      rule_id: `take_profile_switch_${slot}`,
      component_id: "take_profile_switch",
      activate_when: defaultActivateWhen("runner"),
      params: defaultTakeProfileSwitchParams(),
    };
  }
  const runtimeComponentId = componentId ?? "phase_runtime_exit";
  const params =
    runtimeComponentId === "rsi_signal_exit"
      ? defaultRsiRuntimeExitParams()
      : runtimeComponentId === "ema_cross_loss_exit"
        ? defaultEmaCrossRuntimeExitParams()
        : defaultPhaseRuntimeExitParams();
  const activatePhase =
    runtimeComponentId === "phase_runtime_exit" ? "exhaustion" : "runner";
  return normalizeRuntimeExitRule({
    rule_id: `${runtimeComponentId}_${slot}`,
    component_id: runtimeComponentId,
    activate_when: defaultActivateWhen(activatePhase),
    params,
  });
}

export function updateManagementRule(
  rule: ManagementRuleDraft,
  patch: Partial<ManagementRuleDraft> & {
    activate_when?: JsonObject;
    params?: JsonObject;
  },
  options?: { layer?: ManagementRuleLayer },
): ManagementRuleDraft {
  const next: ManagementRuleDraft = { ...rule, ...patch };
  if (patch.activate_when) {
    next.activate_when = { ...(rule.activate_when as JsonObject | undefined), ...patch.activate_when };
  }
  if (patch.params) {
    next.params = { ...(rule.params as JsonObject | undefined), ...patch.params };
  }
  if (patch.component_id && patch.component_id !== rule.component_id) {
    const componentId = String(patch.component_id);
    if (componentId === "break_even_stop") {
      next.params = defaultBreakEvenStopParams();
    } else if (componentId === "lock_profit_stop") {
      next.params = defaultLockProfitStopParams();
    } else if (componentId === "take_profile_switch") {
      next.params = defaultTakeProfileSwitchParams();
    } else if (componentId === "rsi_signal_exit") {
      next.params = defaultRsiRuntimeExitParams();
      next.exit_kind = "take_profit";
      next.activate_when = defaultActivateWhen("runner");
      next.role = RUNTIME_EXIT_ROLE;
    } else if (componentId === "ema_cross_loss_exit") {
      next.params = defaultEmaCrossRuntimeExitParams();
      next.exit_kind = "protective_exit";
      next.activate_when = defaultActivateWhen("runner");
      next.role = RUNTIME_EXIT_ROLE;
    } else if (componentId === "phase_runtime_exit") {
      next.params = defaultPhaseRuntimeExitParams();
      next.exit_kind = "market_close";
      next.activate_when = defaultActivateWhen("exhaustion");
      next.role = RUNTIME_EXIT_ROLE;
    }
  }
  if (options?.layer === "runtime_exits" || layerFromRule(next) === "runtime_exits") {
    return normalizeRuntimeExitRule(next);
  }
  return next;
}

function layerFromRule(rule: ManagementRuleDraft): ManagementRuleLayer | null {
  if (rule.role === RUNTIME_EXIT_ROLE) {
    return "runtime_exits";
  }
  const componentId = typeof rule.component_id === "string" ? rule.component_id : "";
  if (
    componentId === "rsi_signal_exit" ||
    componentId === "ema_cross_loss_exit" ||
    componentId === "phase_runtime_exit"
  ) {
    return "runtime_exits";
  }
  if (STOP_MANAGEMENT_COMPONENT_IDS.includes(componentId as (typeof STOP_MANAGEMENT_COMPONENT_IDS)[number])) {
    return "stop_management";
  }
  if (TAKE_MANAGEMENT_COMPONENT_IDS.includes(componentId as (typeof TAKE_MANAGEMENT_COMPONENT_IDS)[number])) {
    return "take_management";
  }
  return null;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function collectManagedRulesValidationErrors(
  exitManagement: JsonObject,
  pathPrefix: string,
  catalog: ComponentCatalog | null = null,
): ValidationErrorItem[] {
  const errors: ValidationErrorItem[] = [];
  const emPath = `${pathPrefix}.trade_management.exit_management`;
  const mode = exitManagement.mode;

  if (mode === "diagnostic_only") {
    for (const layer of ["stop_management", "take_management", "runtime_exits"] as const) {
      const rules = readManagementRules(exitManagement, layer);
      if (rules.length > 0) {
        errors.push({
          path: `${emPath}.${layer}`,
          message: `${layer} must be empty when mode is diagnostic_only`,
        });
      }
    }
    return errors;
  }

  if (mode !== "managed") {
    return errors;
  }

  const validateLayer = (
    layer: ManagementRuleLayer,
    allowedComponents: readonly string[],
  ) => {
    const rules = readManagementRules(exitManagement, layer);
    const seenRuleIds = new Set<string>();
    rules.forEach((raw, index) => {
      const rule = raw as JsonObject;
      const rulePath = managementRulePath(pathPrefix, layer, index);
      const ruleId = typeof rule.rule_id === "string" ? rule.rule_id.trim() : "";
      if (!ruleId) {
        errors.push({ path: `${rulePath}.rule_id`, message: "rule_id is required" });
      } else if (seenRuleIds.has(ruleId)) {
        errors.push({ path: `${rulePath}.rule_id`, message: `duplicate rule_id: ${ruleId}` });
      } else {
        seenRuleIds.add(ruleId);
      }

      const componentId = typeof rule.component_id === "string" ? rule.component_id : "";
      if (!allowedComponents.includes(componentId)) {
        errors.push({
          path: `${rulePath}.component_id`,
          message: `component_id must be one of: ${allowedComponents.join(", ")}`,
        });
      }

      const activateWhen = (rule.activate_when as JsonObject | undefined) ?? {};
      const phase = typeof activateWhen.phase_at_least === "string" ? activateWhen.phase_at_least : "";
      if (!ACTIVATE_WHEN_PHASES.includes(phase as (typeof ACTIVATE_WHEN_PHASES)[number])) {
        errors.push({
          path: `${rulePath}.activate_when.phase_at_least`,
          message: `phase_at_least must be one of: ${ACTIVATE_WHEN_PHASES.join(", ")}`,
        });
      }

      const params = (rule.params as JsonObject | undefined) ?? {};
      if (componentId === "break_even_stop") {
        const bufferType = params.buffer_type;
        if (bufferType !== undefined && bufferType !== "none" && bufferType !== "fixed" && bufferType !== "atr") {
          errors.push({
            path: `${rulePath}.params.buffer_type`,
            message: "buffer_type must be none, fixed, or atr",
          });
        }
        if (params.buffer !== undefined && !isNonNegativeFinite(params.buffer)) {
          errors.push({ path: `${rulePath}.params.buffer`, message: "buffer must be >= 0" });
        }
      }
      if (componentId === "lock_profit_stop") {
        if (!isPositiveFinite(params.lock_atr)) {
          errors.push({ path: `${rulePath}.params.lock_atr`, message: "lock_atr must be > 0" });
        }
        const atr = params.atr;
        if (!atr || typeof atr !== "object" || Array.isArray(atr)) {
          errors.push({
            path: `${rulePath}.params.atr`,
            message: "lock_profit_stop requires atr.timeframe and atr.period",
          });
        }
      }
      if (componentId === "take_profile_switch") {
        const action = params.action;
        if (!TAKE_PROFILE_SWITCH_ACTIONS.includes(action as (typeof TAKE_PROFILE_SWITCH_ACTIONS)[number])) {
          errors.push({
            path: `${rulePath}.params.action`,
            message: `action must be one of: ${TAKE_PROFILE_SWITCH_ACTIONS.join(", ")}`,
          });
        }
      }
      if (layer === "runtime_exits") {
        const role = typeof rule.role === "string" ? rule.role : "";
        if (role !== RUNTIME_EXIT_ROLE) {
          errors.push({
            path: `${rulePath}.role`,
            message: `role must be ${RUNTIME_EXIT_ROLE}`,
          });
        }

        const exitKind = typeof rule.exit_kind === "string" ? rule.exit_kind : "";
        if (exitKind === "signal") {
          errors.push({
            path: `${rulePath}.exit_kind`,
            message: `exit_kind "signal" is not allowed; use ${RUNTIME_EXIT_KINDS.join(", ")}`,
          });
        } else if (componentId === "phase_runtime_exit") {
          if (exitKind !== "market_close") {
            errors.push({
              path: `${rulePath}.exit_kind`,
              message: "phase_runtime_exit requires exit_kind market_close",
            });
          }
        } else if (!RUNTIME_EXIT_KINDS.includes(exitKind as (typeof RUNTIME_EXIT_KINDS)[number])) {
          errors.push({
            path: `${rulePath}.exit_kind`,
            message: `exit_kind is required and must be one of: ${RUNTIME_EXIT_KINDS.join(", ")}`,
          });
        }

        if (componentId === "phase_runtime_exit") {
          if (params.exit_price !== "close") {
            errors.push({
              path: `${rulePath}.params.exit_price`,
              message: 'exit_price must be "close"',
            });
          }
        }
        if (componentId === "rsi_signal_exit") {
          const rsi = params.rsi;
          if (!rsi || typeof rsi !== "object" || Array.isArray(rsi)) {
            errors.push({
              path: `${rulePath}.params.rsi`,
              message: "rsi_signal_exit requires params.rsi.timeframe and params.rsi.period",
            });
          } else {
            const rsiObj = rsi as JsonObject;
            if (!isPositiveFinite(rsiObj.period)) {
              errors.push({
                path: `${rulePath}.params.rsi.period`,
                message: "rsi.period must be > 0",
              });
            }
          }
          if (params.confirm_bars !== undefined && !isPositiveFinite(params.confirm_bars)) {
            errors.push({
              path: `${rulePath}.params.confirm_bars`,
              message: "confirm_bars must be >= 1",
            });
          }
          for (const field of ["long_exit_above", "short_exit_below"] as const) {
            const value = params[field];
            if (value !== undefined && value !== null) {
              if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
                errors.push({
                  path: `${rulePath}.params.${field}`,
                  message: `${field} must be between 0 and 100`,
                });
              }
            }
          }
        }
        if (componentId === "ema_cross_loss_exit") {
          for (const emaKey of ["fast_ema", "slow_ema"] as const) {
            const ema = params[emaKey];
            if (!ema || typeof ema !== "object" || Array.isArray(ema)) {
              errors.push({
                path: `${rulePath}.params.${emaKey}`,
                message: `${emaKey} requires timeframe, source, and period`,
              });
            }
          }
          const fast = params.fast_ema as JsonObject | undefined;
          const slow = params.slow_ema as JsonObject | undefined;
          if (fast && slow && isPositiveFinite(fast.period) && isPositiveFinite(slow.period)) {
            if (fast.period >= slow.period) {
              errors.push({
                path: `${rulePath}.params.slow_ema.period`,
                message: "slow_ema.period must be greater than fast_ema.period",
              });
            }
          }
          if (params.confirm_bars !== undefined && !isPositiveFinite(params.confirm_bars)) {
            errors.push({
              path: `${rulePath}.params.confirm_bars`,
              message: "confirm_bars must be >= 1",
            });
          }
        }
      }
    });
  };

  validateLayer("stop_management", STOP_MANAGEMENT_COMPONENT_IDS);
  validateLayer("take_management", TAKE_MANAGEMENT_COMPONENT_IDS);
  const runtimeAllowedIds =
    catalog != null ? runtimeExitComponentIds(catalog) : null;
  if (runtimeAllowedIds != null) {
    validateLayer("runtime_exits", runtimeAllowedIds);
  } else {
    const rules = readManagementRules(exitManagement, "runtime_exits");
    if (rules.length > 0) {
      errors.push({
        path: `${emPath}.runtime_exits`,
        message: "runtime_exits validation requires component catalog",
      });
    }
  }

  return errors;
}
