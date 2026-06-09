import { useMemo } from "react";

import type { JsonObject, ValidationErrorItem } from "@/api/types";

import {
  ACTIVATE_WHEN_PHASES,
  RUNTIME_EXIT_KINDS,
  RUNTIME_EXIT_ROLE,
  STOP_MANAGEMENT_COMPONENT_IDS,
  TAKE_MANAGEMENT_COMPONENT_IDS,
  TAKE_PROFILE_SWITCH_ACTIONS,
  type ManagementRuleLayer,
  createBlankManagementRule,
  managementRulePath,
  readManagementRules,
  updateManagementRule,
  writeManagementRules,
} from "@/features/composer/composerManagedExitManagement";

type Props = {
  exitManagement: JsonObject;
  pathPrefix: string;
  layer: ManagementRuleLayer;
  title: string;
  componentIds?: readonly string[];
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

function ParamsEditor({
  layer,
  componentId,
  params,
  disabled,
  rulePath,
  ruleErrors,
  onParamsChange,
}: {
  layer: ManagementRuleLayer;
  componentId: string;
  params: JsonObject;
  disabled: boolean;
  rulePath: string;
  ruleErrors: ValidationErrorItem[];
  onParamsChange: (patch: JsonObject) => void;
}) {
  if (layer === "stop_management" && componentId === "break_even_stop") {
    return (
      <>
        <label className="field">
          <span>params.buffer_type</span>
          <select
            value={String(params.buffer_type ?? "none")}
            disabled={disabled}
            onChange={(e) => onParamsChange({ buffer_type: e.target.value })}
          >
            <option value="none">none</option>
            <option value="fixed">fixed</option>
            <option value="atr">atr</option>
          </select>
        </label>
        <label className="field">
          <span>params.buffer</span>
          <input
            type="number"
            step={0.01}
            min={0}
            value={typeof params.buffer === "number" ? params.buffer : ""}
            disabled={disabled}
            onChange={(e) => {
              const parsed = parseFloat(e.target.value);
              onParamsChange({ buffer: Number.isFinite(parsed) ? parsed : e.target.value });
            }}
          />
        </label>
        <FieldErrors errors={ruleErrors.filter((e) => e.path.startsWith(`${rulePath}.params`))} />
      </>
    );
  }

  if (layer === "stop_management" && componentId === "lock_profit_stop") {
    const atr = (params.atr as JsonObject | undefined) ?? {};
    return (
      <>
        <label className="field">
          <span>params.lock_atr</span>
          <input
            type="number"
            step={0.1}
            min={0.0001}
            value={typeof params.lock_atr === "number" ? params.lock_atr : ""}
            disabled={disabled}
            onChange={(e) => {
              const parsed = parseFloat(e.target.value);
              onParamsChange({ lock_atr: Number.isFinite(parsed) ? parsed : e.target.value });
            }}
          />
        </label>
        <div className="composer-phase-rules__atr">
          <label className="field">
            <span>params.atr.timeframe</span>
            <input
              type="text"
              value={String(atr.timeframe ?? "base")}
              disabled={disabled}
              onChange={(e) =>
                onParamsChange({ atr: { ...atr, timeframe: e.target.value } })
              }
            />
          </label>
          <label className="field">
            <span>params.atr.period</span>
            <input
              type="number"
              step={1}
              min={1}
              value={typeof atr.period === "number" ? atr.period : ""}
              disabled={disabled}
              onChange={(e) => {
                const parsed = parseInt(e.target.value, 10);
                onParamsChange({
                  atr: { ...atr, period: Number.isFinite(parsed) ? parsed : e.target.value },
                });
              }}
            />
          </label>
        </div>
        <FieldErrors errors={ruleErrors.filter((e) => e.path.startsWith(`${rulePath}.params`))} />
      </>
    );
  }

  if (layer === "take_management" && componentId === "take_profile_switch") {
    return (
      <>
        <label className="field">
          <span>params.action</span>
          <select
            value={String(params.action ?? TAKE_PROFILE_SWITCH_ACTIONS[0])}
            disabled={disabled}
            onChange={(e) => onParamsChange({ action: e.target.value })}
          >
            {TAKE_PROFILE_SWITCH_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </label>
        <FieldErrors errors={ruleErrors.filter((e) => e.path.startsWith(`${rulePath}.params`))} />
      </>
    );
  }

  if (layer === "runtime_exits" && componentId === "phase_runtime_exit") {
    return (
      <>
        <label className="field">
          <span>params.exit_price</span>
          <input type="text" value="close" disabled readOnly />
        </label>
        <FieldErrors errors={ruleErrors.filter((e) => e.path.startsWith(`${rulePath}.params`))} />
      </>
    );
  }

  if (layer === "runtime_exits" && componentId === "rsi_signal_exit") {
    const rsi = (params.rsi as JsonObject | undefined) ?? {};
    return (
      <>
        <div className="composer-phase-rules__atr">
          <label className="field">
            <span>params.rsi.timeframe</span>
            <input
              type="text"
              value={String(rsi.timeframe ?? "base")}
              disabled={disabled}
              onChange={(e) =>
                onParamsChange({ rsi: { ...rsi, timeframe: e.target.value } })
              }
            />
          </label>
          <label className="field">
            <span>params.rsi.period</span>
            <input
              type="number"
              step={1}
              min={1}
              value={typeof rsi.period === "number" ? rsi.period : ""}
              disabled={disabled}
              onChange={(e) => {
                const parsed = parseInt(e.target.value, 10);
                onParamsChange({
                  rsi: { ...rsi, period: Number.isFinite(parsed) ? parsed : e.target.value },
                });
              }}
            />
          </label>
        </div>
        <label className="field">
          <span>params.long_exit_above</span>
          <input
            type="number"
            step={0.1}
            min={0}
            max={100}
            value={typeof params.long_exit_above === "number" ? params.long_exit_above : ""}
            disabled={disabled}
            onChange={(e) => {
              const parsed = parseFloat(e.target.value);
              onParamsChange({
                long_exit_above: Number.isFinite(parsed) ? parsed : e.target.value,
              });
            }}
          />
        </label>
        <label className="field">
          <span>params.short_exit_below</span>
          <input
            type="number"
            step={0.1}
            min={0}
            max={100}
            value={typeof params.short_exit_below === "number" ? params.short_exit_below : ""}
            disabled={disabled}
            onChange={(e) => {
              const parsed = parseFloat(e.target.value);
              onParamsChange({
                short_exit_below: Number.isFinite(parsed) ? parsed : e.target.value,
              });
            }}
          />
        </label>
        <label className="field">
          <span>params.confirm_bars</span>
          <input
            type="number"
            step={1}
            min={1}
            value={typeof params.confirm_bars === "number" ? params.confirm_bars : ""}
            disabled={disabled}
            onChange={(e) => {
              const parsed = parseInt(e.target.value, 10);
              onParamsChange({
                confirm_bars: Number.isFinite(parsed) ? parsed : e.target.value,
              });
            }}
          />
        </label>
        <FieldErrors errors={ruleErrors.filter((e) => e.path.startsWith(`${rulePath}.params`))} />
      </>
    );
  }

  if (layer === "runtime_exits" && componentId === "ema_cross_loss_exit") {
    const renderEmaFields = (emaKey: "fast_ema" | "slow_ema") => {
      const ema = (params[emaKey] as JsonObject | undefined) ?? {};
      return (
        <div className="composer-phase-rules__atr" key={emaKey}>
          <p className="composer-management-rules__param-group-label">{emaKey}</p>
          <label className="field">
            <span>timeframe</span>
            <input
              type="text"
              value={String(ema.timeframe ?? "base")}
              disabled={disabled}
              onChange={(e) =>
                onParamsChange({ [emaKey]: { ...ema, timeframe: e.target.value } })
              }
            />
          </label>
          <label className="field">
            <span>source</span>
            <input
              type="text"
              value={String(ema.source ?? "close")}
              disabled={disabled}
              onChange={(e) => onParamsChange({ [emaKey]: { ...ema, source: e.target.value } })}
            />
          </label>
          <label className="field">
            <span>period</span>
            <input
              type="number"
              step={1}
              min={1}
              value={typeof ema.period === "number" ? ema.period : ""}
              disabled={disabled}
              onChange={(e) => {
                const parsed = parseInt(e.target.value, 10);
                onParamsChange({
                  [emaKey]: { ...ema, period: Number.isFinite(parsed) ? parsed : e.target.value },
                });
              }}
            />
          </label>
        </div>
      );
    };
    return (
      <>
        {renderEmaFields("fast_ema")}
        {renderEmaFields("slow_ema")}
        <label className="field">
          <span>params.confirm_bars</span>
          <input
            type="number"
            step={1}
            min={1}
            value={typeof params.confirm_bars === "number" ? params.confirm_bars : ""}
            disabled={disabled}
            onChange={(e) => {
              const parsed = parseInt(e.target.value, 10);
              onParamsChange({
                confirm_bars: Number.isFinite(parsed) ? parsed : e.target.value,
              });
            }}
          />
        </label>
        <FieldErrors errors={ruleErrors.filter((e) => e.path.startsWith(`${rulePath}.params`))} />
      </>
    );
  }

  return null;
}

export function ManagementRulesEditor({
  exitManagement,
  pathPrefix,
  layer,
  title,
  componentIds,
  errors,
  onChange,
  disabled = false,
}: Props) {
  const rules = readManagementRules(exitManagement, layer);

  const ruleErrorsByIndex = useMemo(() => {
    return rules.map((_, index) => errorsForPath(errors, managementRulePath(pathPrefix, layer, index)));
  }, [errors, layer, pathPrefix, rules]);

  const patchRules = (nextRules: JsonObject[]) => {
    onChange(writeManagementRules(exitManagement, layer, nextRules));
  };

  const updateRule = (index: number, patch: JsonObject) => {
    const next = rules.map((rule, i) =>
      i === index ? updateManagementRule(rule, patch, { layer }) : rule,
    );
    patchRules(next);
  };

  const addRule = () => {
    patchRules([
      ...rules,
      createBlankManagementRule(layer, rules.length, ids[0]),
    ]);
  };

  const removeRule = (index: number) => {
    patchRules(rules.filter((_, i) => i !== index));
  };

  const ids = componentIds ?? [];
  const defaultComponentId = ids[0] ?? "";

  return (
    <div
      className="composer-management-rules"
      data-testid={`management-rules-editor-${layer}`}
    >
      <h4 className="composer-management-rules__title">{title}</h4>
      <div className="composer-management-rules__toolbar">
        <button type="button" disabled={disabled} onClick={addRule}>
          Add {title.toLowerCase()} rule
        </button>
      </div>

      {rules.length === 0 ? (
        <p className="composer-management-rules__empty">No {title.toLowerCase()} rules configured.</p>
      ) : null}

      <div className="composer-management-rules__list">
        {rules.map((rule, index) => {
          const activateWhen = (rule.activate_when as JsonObject | undefined) ?? {};
          const params = (rule.params as JsonObject | undefined) ?? {};
          const componentId = String(rule.component_id ?? defaultComponentId);
          const ruleErrors = ruleErrorsByIndex[index] ?? [];
          const rulePath = managementRulePath(pathPrefix, layer, index);

          return (
            <fieldset
              key={`${String(rule.rule_id ?? "rule")}-${index}`}
              className="composer-management-rules__rule"
              data-testid={`${layer}-rule-${index}`}
            >
              <legend>
                {title} rule {index + 1}
                <button type="button" disabled={disabled} onClick={() => removeRule(index)}>
                  Remove
                </button>
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
                <span>component_id</span>
                <select
                  value={componentId}
                  disabled={disabled}
                  onChange={(e) => updateRule(index, { component_id: e.target.value })}
                >
                  {ids.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>
              <FieldErrors
                errors={ruleErrors.filter((e) => e.path === `${rulePath}.component_id`)}
              />

              <label className="field">
                <span>activate_when.phase_at_least</span>
                <select
                  value={String(activateWhen.phase_at_least ?? ACTIVATE_WHEN_PHASES[0])}
                  disabled={disabled}
                  onChange={(e) =>
                    updateRule(index, { activate_when: { phase_at_least: e.target.value } })
                  }
                >
                  {ACTIVATE_WHEN_PHASES.map((phase) => (
                    <option key={phase} value={phase}>
                      {phase}
                    </option>
                  ))}
                </select>
              </label>
              <FieldErrors
                errors={ruleErrors.filter((e) => e.path === `${rulePath}.activate_when.phase_at_least`)}
              />

              {layer === "runtime_exits" ? (
                <>
                  <label className="field">
                    <span>role</span>
                    <input type="text" value={RUNTIME_EXIT_ROLE} disabled readOnly />
                  </label>
                  <FieldErrors errors={ruleErrors.filter((e) => e.path === `${rulePath}.role`)} />

                  <label className="field">
                    <span>exit_kind</span>
                    <select
                      value={String(rule.exit_kind ?? "")}
                      disabled={disabled || componentId === "phase_runtime_exit"}
                      onChange={(e) => updateRule(index, { exit_kind: e.target.value })}
                    >
                      {(componentId === "phase_runtime_exit"
                        ? ["market_close"]
                        : RUNTIME_EXIT_KINDS
                      ).map((kind) => (
                        <option key={kind} value={kind}>
                          {kind}
                        </option>
                      ))}
                    </select>
                  </label>
                  <FieldErrors
                    errors={ruleErrors.filter((e) => e.path === `${rulePath}.exit_kind`)}
                  />
                </>
              ) : null}

              <ParamsEditor
                layer={layer}
                componentId={componentId}
                params={params}
                disabled={disabled}
                rulePath={rulePath}
                ruleErrors={ruleErrors}
                onParamsChange={(patch) => updateRule(index, { params: patch })}
              />
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}

export { STOP_MANAGEMENT_COMPONENT_IDS, TAKE_MANAGEMENT_COMPONENT_IDS };
