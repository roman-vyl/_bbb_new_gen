import { useMemo } from "react";

import type { JsonObject, ValidationErrorItem } from "@/api/types";

import {
  PHASE_RULE_CONDITION_TYPES,
  PHASE_RULE_TARGET_PHASES,
  type PhaseRuleConditionType,
  createBlankPhaseRule,
  defaultDiagnosticPhaseRules,
  normalizeConditionForType,
  phaseRulePath,
  readPhaseRules,
  updatePhaseRuleField,
} from "@/features/composer/composerPhaseRulesEditor";

type Props = {
  exitManagement: JsonObject;
  pathPrefix: string;
  errors: ValidationErrorItem[];
  onChange: (nextExitManagement: JsonObject) => void;
  disabled?: boolean;
};

function errorsForPath(errors: ValidationErrorItem[], path: string): ValidationErrorItem[] {
  return errors.filter((e) => e.path === path || e.path.startsWith(`${path}.`));
}

function FieldErrors({ errors }: { errors: ValidationErrorItem[] }) {
  if (errors.length === 0) {
    return null;
  }
  return (
    <ul className="composer-errors composer-errors--inline">
      {errors.map((e) => (
        <li key={`${e.path}:${e.message}`}>{e.message}</li>
      ))}
    </ul>
  );
}

export function PhaseRulesEditor({
  exitManagement,
  pathPrefix,
  errors,
  onChange,
  disabled = false,
}: Props) {
  const rules = readPhaseRules(exitManagement);

  const ruleErrorsByIndex = useMemo(() => {
    return rules.map((_, index) => errorsForPath(errors, phaseRulePath(pathPrefix, index)));
  }, [errors, pathPrefix, rules]);

  const patchRules = (nextRules: JsonObject[]) => {
    onChange({
      ...exitManagement,
      mode: "diagnostic_only",
      phase_rules: nextRules,
      stop_management: Array.isArray(exitManagement.stop_management)
        ? exitManagement.stop_management
        : [],
      runtime_exits: Array.isArray(exitManagement.runtime_exits)
        ? exitManagement.runtime_exits
        : [],
    });
  };

  const updateRule = (index: number, patch: JsonObject) => {
    const next = rules.map((rule, i) =>
      i === index ? updatePhaseRuleField(rule, patch) : rule,
    );
    patchRules(next);
  };

  const addRule = () => {
    patchRules([...rules, createBlankPhaseRule(rules.length)]);
  };

  const removeRule = (index: number) => {
    patchRules(rules.filter((_, i) => i !== index));
  };

  const moveRule = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rules.length) {
      return;
    }
    const next = [...rules];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    patchRules(next);
  };

  const applyDefaultPreset = () => {
    patchRules(defaultDiagnosticPhaseRules());
  };

  return (
    <div className="composer-phase-rules" data-testid="phase-rules-editor">
      <div className="composer-phase-rules__toolbar">
        <button type="button" disabled={disabled} onClick={addRule}>
          Add phase rule
        </button>
        <button type="button" disabled={disabled} onClick={applyDefaultPreset}>
          Default diagnostic phases
        </button>
      </div>

      {rules.length === 0 ? (
        <p className="composer-phase-rules__empty">No phase rules configured.</p>
      ) : null}

      <div className="composer-phase-rules__list">
        {rules.map((rule, index) => {
          const condition = (rule.condition as JsonObject | undefined) ?? {};
          const condType = String(condition.type ?? "mfe_atr") as PhaseRuleConditionType;
          const atr = (condition.atr as JsonObject | undefined) ?? {};
          const ruleErrors = ruleErrorsByIndex[index] ?? [];
          const rulePath = phaseRulePath(pathPrefix, index);

          return (
            <fieldset
              key={`${String(rule.rule_id ?? "rule")}-${index}`}
              className="composer-phase-rules__rule"
              data-testid={`phase-rule-${index}`}
            >
              <legend>
                Phase rule {index + 1}
                <span className="composer-phase-rules__rule-actions">
                  <button
                    type="button"
                    disabled={disabled || index === 0}
                    aria-label="Move rule up"
                    onClick={() => moveRule(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={disabled || index === rules.length - 1}
                    aria-label="Move rule down"
                    onClick={() => moveRule(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => removeRule(index)}
                  >
                    Remove
                  </button>
                </span>
              </legend>

              <FieldErrors errors={ruleErrors.filter((e) => e.path === rulePath)} />

              <label className="field">
                <span>rule_id</span>
                <input
                  type="text"
                  value={String(rule.rule_id ?? "")}
                  disabled={disabled}
                  onChange={(e) => updateRule(index, { rule_id: e.target.value })}
                />
              </label>
              <FieldErrors
                errors={ruleErrors.filter((e) => e.path === `${rulePath}.rule_id`)}
              />

              <label className="field">
                <span>to_phase</span>
                <select
                  value={String(rule.to_phase ?? PHASE_RULE_TARGET_PHASES[0])}
                  disabled={disabled}
                  onChange={(e) => updateRule(index, { to_phase: e.target.value })}
                >
                  {PHASE_RULE_TARGET_PHASES.map((phase) => (
                    <option key={phase} value={phase}>
                      {phase}
                    </option>
                  ))}
                </select>
              </label>
              <FieldErrors
                errors={ruleErrors.filter((e) => e.path === `${rulePath}.to_phase`)}
              />

              <label className="field">
                <span>condition.type</span>
                <select
                  value={condType}
                  disabled={disabled}
                  onChange={(e) => {
                    const type = e.target.value as PhaseRuleConditionType;
                    updateRule(index, {
                      condition: normalizeConditionForType({}, type),
                    });
                  }}
                >
                  {PHASE_RULE_CONDITION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>
                  {condType === "mfe_pct"
                    ? "threshold (decimal ratio, e.g. 0.02 = 2% MFE)"
                    : condType === "bars_in_trade"
                      ? "threshold (bars, integer ≥ 1)"
                      : "threshold (MFE in ATR multiples)"}
                </span>
                <input
                  type="number"
                  step={condType === "bars_in_trade" ? 1 : condType === "mfe_pct" ? 0.001 : 0.1}
                  min={condType === "bars_in_trade" ? 1 : 0.0001}
                  value={
                    typeof condition.threshold === "number" ? condition.threshold : ""
                  }
                  disabled={disabled}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const parsed =
                      condType === "bars_in_trade"
                        ? parseInt(raw, 10)
                        : parseFloat(raw);
                    updateRule(index, {
                      condition: { threshold: Number.isFinite(parsed) ? parsed : raw },
                    });
                  }}
                />
              </label>
              <FieldErrors
                errors={ruleErrors.filter((e) => e.path.startsWith(`${rulePath}.condition`))}
              />

              {condType === "mfe_atr" ? (
                <div className="composer-phase-rules__atr">
                  <label className="field">
                    <span>atr.timeframe</span>
                    <input
                      type="text"
                      value={String(atr.timeframe ?? "base")}
                      disabled={disabled}
                      onChange={(e) =>
                        updateRule(index, {
                          condition: { atr: { ...atr, timeframe: e.target.value } },
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>atr.period</span>
                    <input
                      type="number"
                      step={1}
                      min={1}
                      value={typeof atr.period === "number" ? atr.period : ""}
                      disabled={disabled}
                      onChange={(e) => {
                        const parsed = parseInt(e.target.value, 10);
                        updateRule(index, {
                          condition: {
                            atr: {
                              ...atr,
                              period: Number.isFinite(parsed) ? parsed : e.target.value,
                            },
                          },
                        });
                      }}
                    />
                  </label>
                </div>
              ) : null}
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}
