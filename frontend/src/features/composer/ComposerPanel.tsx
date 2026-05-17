import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ApiError,
  fetchComponentCatalog,
  saveConfigDraft,
  serializeConfigDraft,
  validateConfigDraft,
} from "@/api/client";
import type {
  ComponentCatalog,
  ComponentSchema,
  JsonObject,
  StrategyConfigDraft,
  StrategyInstanceDraft,
  ValidationErrorItem,
  ValidationResult,
} from "@/api/types";
import { useWorkbench } from "@/shared/context/WorkbenchContext";

import {
  applyComponentDefaults,
  componentsForRole,
  createDefaultInstance,
  duplicateInstance,
  errorsForPath,
  findComponentSchema,
  instancePath,
  listSlotPath,
  nextInstanceId,
  strategyPath,
} from "./composerDraft";
import { ParamFields } from "./ParamFields";

type PreviewTab = "draft" | "serialized";

function ValidationMessages({ errors }: { errors: ValidationErrorItem[] }) {
  if (errors.length === 0) return null;
  return (
    <ul className="composer-errors">
      {errors.map((e, i) => (
        <li key={`${e.path}-${i}`}>
          {e.path ? <code>{e.path}</code> : null} {e.message}
        </li>
      ))}
    </ul>
  );
}

function SectionErrors({
  errors,
  pathPrefix,
}: {
  errors: ValidationErrorItem[];
  pathPrefix: string;
}) {
  const scoped = errorsForPath(errors, pathPrefix);
  if (scoped.length === 0) return null;
  return <ValidationMessages errors={scoped} />;
}

export function ComposerPanel() {
  const { configDraft, setConfigDraft } = useWorkbench();
  const [catalog, setCatalog] = useState<ComponentCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [serializeContent, setSerializeContent] = useState<string | null>(null);
  const [serializeFormat, setSerializeFormat] = useState<"json" | "yaml">("json");
  const [previewTab, setPreviewTab] = useState<PreviewTab>("draft");
  const [busy, setBusy] = useState<"validate" | "serialize" | "save" | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchComponentCatalog(configDraft.family)
      .then((c) => {
        if (!cancelled) {
          setCatalog(c);
          setCatalogError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setCatalog(null);
          setCatalogError(err instanceof ApiError ? err.detail : "Failed to load component catalog.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [configDraft.family]);

  const draftPreview = useMemo(() => JSON.stringify(configDraft, null, 2), [configDraft]);
  const validationErrors = validation?.errors ?? [];
  const canSave = validation?.ok === true;

  const instance = configDraft.instances[selectedIndex] ?? null;
  const strategy = (instance?.strategy ?? {}) as JsonObject;

  const patchDraft = useCallback(
    (patch: Partial<StrategyConfigDraft>) => {
      setValidation(null);
      setSerializeContent(null);
      setSaveMessage(null);
      setConfigDraft({ ...configDraft, ...patch });
    },
    [configDraft, setConfigDraft],
  );

  const patchInstance = useCallback(
    (index: number, patch: Partial<StrategyInstanceDraft>) => {
      setValidation(null);
      setSerializeContent(null);
      setSaveMessage(null);
      const instances = configDraft.instances.map((inst, i) =>
        i === index ? { ...inst, ...patch } : inst,
      );
      setConfigDraft({ ...configDraft, instances });
    },
    [configDraft, setConfigDraft],
  );

  const patchStrategy = useCallback(
    (index: number, patch: JsonObject) => {
      const inst = configDraft.instances[index];
      if (!inst) return;
      patchInstance(index, { strategy: { ...inst.strategy, ...patch } });
    },
    [configDraft.instances, patchInstance],
  );

  const runValidate = useCallback(async () => {
    setBusy("validate");
    setActionError(null);
    setSaveMessage(null);
    try {
      const result = await validateConfigDraft(configDraft);
      setValidation(result);
      if (!result.ok) {
        setSerializeContent(null);
      }
    } catch (err) {
      setActionError(err instanceof ApiError ? err.detail : "Validate failed.");
    } finally {
      setBusy(null);
    }
  }, [configDraft]);

  const runSerialize = useCallback(async () => {
    setBusy("serialize");
    setActionError(null);
    try {
      const result = await serializeConfigDraft(configDraft, serializeFormat);
      if (!result.ok) {
        setValidation({ ok: false, errors: result.errors });
        setSerializeContent(null);
        return;
      }
      setSerializeContent(result.content);
      setPreviewTab("serialized");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.detail : "Serialize failed.");
    } finally {
      setBusy(null);
    }
  }, [configDraft, serializeFormat]);

  const runSave = useCallback(async () => {
    setBusy("save");
    setActionError(null);
    setSaveMessage(null);
    try {
      const result = await saveConfigDraft(configDraft);
      if (!result.ok) {
        setValidation({ ok: false, errors: result.errors });
        return;
      }
      setSaveMessage(result.path ? `Saved to ${result.path}` : "Saved.");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.detail : "Save failed.");
    } finally {
      setBusy(null);
    }
  }, [configDraft]);

  const addInstance = () => {
    const id = nextInstanceId(configDraft);
    const instances = [...configDraft.instances, createDefaultInstance(id)];
    patchDraft({ instances });
    setSelectedIndex(instances.length - 1);
  };

  const removeInstance = (index: number) => {
    if (configDraft.instances.length <= 1) return;
    const instances = configDraft.instances.filter((_, i) => i !== index);
    patchDraft({ instances });
    setSelectedIndex(Math.min(selectedIndex, instances.length - 1));
  };

  const duplicateSelected = () => {
    const source = configDraft.instances[selectedIndex];
    if (!source) return;
    const id = nextInstanceId(configDraft);
    const instances = [...configDraft.instances, duplicateInstance(source, id)];
    patchDraft({ instances });
    setSelectedIndex(instances.length - 1);
  };

  const setSingletonComponent = (
    index: number,
    role: "direction" | "setup" | "trigger" | "risk",
    componentId: string,
  ) => {
    if (!catalog) return;
    const schema = findComponentSchema(catalog, componentId);
    const base: JsonObject = { component_id: componentId };
    const next = applyComponentDefaults(base, schema);
    patchStrategy(index, { [role]: next });
  };

  const updateListSlot = (
    index: number,
    role: "blockers" | "exits",
    slotIndex: number,
    nextSlot: JsonObject,
  ) => {
    const inst = configDraft.instances[index];
    if (!inst) return;
    const list = [...((inst.strategy[role] as JsonObject[] | undefined) ?? [])];
    list[slotIndex] = nextSlot;
    patchStrategy(index, { [role]: list });
  };

  const addListSlot = (index: number, role: "blockers" | "exits", componentId: string) => {
    if (!catalog) return;
    const schema = findComponentSchema(catalog, componentId);
    const slotId = `${componentId}_${Date.now().toString(36).slice(-4)}`;
    const base: JsonObject = { instance_id: slotId, component_id: componentId };
    const nextSlot = applyComponentDefaults(base, schema);
    const inst = configDraft.instances[index];
    if (!inst) return;
    const list = [...((inst.strategy[role] as JsonObject[] | undefined) ?? []), nextSlot];
    patchStrategy(index, { [role]: list });
  };

  const removeListSlot = (index: number, role: "blockers" | "exits", slotIndex: number) => {
    const inst = configDraft.instances[index];
    if (!inst) return;
    const list = ((inst.strategy[role] as JsonObject[] | undefined) ?? []).filter(
      (_, i) => i !== slotIndex,
    );
    patchStrategy(index, { [role]: list });
  };

  if (!catalog && !catalogError) {
    return (
      <section className="panel composer-panel">
        <p className="panel__hint">Loading component catalog…</p>
      </section>
    );
  }

  return (
    <section className="panel composer-panel">
      <div className="panel__header composer-header">
        <div>
          <h2>Strategy Composer</h2>
          <p className="panel__hint">
            Draft → validate → serialize preview → save (server only). No backtest in this phase.
          </p>
        </div>
        <div className="composer-actions">
          <button type="button" disabled={busy !== null} onClick={() => void runValidate()}>
            {busy === "validate" ? "Validating…" : "Validate"}
          </button>
          <select
            value={serializeFormat}
            onChange={(e) => setSerializeFormat(e.target.value as "json" | "yaml")}
            aria-label="Serialize format"
          >
            <option value="json">JSON</option>
            <option value="yaml">YAML</option>
          </select>
          <button type="button" disabled={busy !== null} onClick={() => void runSerialize()}>
            {busy === "serialize" ? "Serializing…" : "Serialize preview"}
          </button>
          <button
            type="button"
            className="composer-save"
            disabled={!canSave || busy !== null}
            title={canSave ? "Save validated config via API" : "Validate first"}
            onClick={() => void runSave()}
          >
            {busy === "save" ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {catalogError && <p className="banner banner--warn">{catalogError}</p>}
      {actionError && <p className="banner banner--error">{actionError}</p>}
      {saveMessage && <p className="banner banner--ok">{saveMessage}</p>}
      {validation && (
        <p className={`composer-status ${validation.ok ? "composer-status--ok" : "composer-status--err"}`}>
          {validation.ok ? "Config is valid." : "Validation failed — fix errors below."}
        </p>
      )}

      <div className="composer-grid">
        <div className="composer-form">
          <fieldset className="composer-section">
            <legend>Experiment</legend>
            <SectionErrors errors={validationErrors} pathPrefix="" />
            <label className="field">
              <span>experiment_id</span>
              <input
                value={configDraft.experiment_id}
                onChange={(e) => patchDraft({ experiment_id: e.target.value })}
              />
            </label>
            <label className="field">
              <span>family</span>
              <input value={configDraft.family} readOnly />
            </label>
            <label className="field">
              <span>init_cash</span>
              <input
                type="number"
                value={configDraft.execution.init_cash ?? ""}
                onChange={(e) =>
                  patchDraft({
                    execution: {
                      ...configDraft.execution,
                      init_cash: e.target.value === "" ? undefined : Number(e.target.value),
                    },
                  })
                }
              />
            </label>
            <label className="field">
              <span>fees</span>
              <input
                type="number"
                step="any"
                value={configDraft.execution.fees ?? ""}
                onChange={(e) =>
                  patchDraft({
                    execution: {
                      ...configDraft.execution,
                      fees: e.target.value === "" ? undefined : Number(e.target.value),
                    },
                  })
                }
              />
            </label>
            <label className="field">
              <span>slippage</span>
              <input
                type="number"
                step="any"
                value={configDraft.execution.slippage ?? ""}
                onChange={(e) =>
                  patchDraft({
                    execution: {
                      ...configDraft.execution,
                      slippage: e.target.value === "" ? undefined : Number(e.target.value),
                    },
                  })
                }
              />
            </label>
          </fieldset>

          <fieldset className="composer-section">
            <legend>Instances</legend>
            <div className="composer-instance-toolbar">
              <select
                value={String(selectedIndex)}
                onChange={(e) => setSelectedIndex(Number(e.target.value))}
              >
                {configDraft.instances.map((inst, i) => (
                  <option key={inst.instance_id} value={String(i)}>
                    {inst.instance_id}
                  </option>
                ))}
              </select>
              <button type="button" onClick={addInstance}>
                + instance
              </button>
              <button type="button" onClick={duplicateSelected} disabled={!instance}>
                Duplicate
              </button>
              <button
                type="button"
                onClick={() => removeInstance(selectedIndex)}
                disabled={configDraft.instances.length <= 1}
              >
                Delete
              </button>
            </div>

            {instance && (
              <>
                <SectionErrors errors={validationErrors} pathPrefix={instancePath(selectedIndex)} />
                <label className="field">
                  <span>instance_id</span>
                  <input
                    value={instance.instance_id}
                    onChange={(e) =>
                      patchInstance(selectedIndex, { instance_id: e.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>variant</span>
                  <input
                    value={instance.variant}
                    onChange={(e) => patchInstance(selectedIndex, { variant: e.target.value })}
                  />
                </label>

                <h4 className="composer-subhead">Market</h4>
                <label className="field">
                  <span>symbol</span>
                  <input
                    value={instance.market.symbol}
                    onChange={(e) =>
                      patchInstance(selectedIndex, {
                        market: { ...instance.market, symbol: e.target.value },
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>base_timeframe</span>
                  <input
                    value={instance.market.base_timeframe}
                    onChange={(e) =>
                      patchInstance(selectedIndex, {
                        market: { ...instance.market, base_timeframe: e.target.value },
                      })
                    }
                  />
                </label>

                <h4 className="composer-subhead">Anchor stack</h4>
                <AnchorStackFields
                  stack={(strategy.anchor_stack as JsonObject) ?? {}}
                  pathPrefix={`${strategyPath(selectedIndex)}.anchor_stack`}
                  errors={validationErrors}
                  onChange={(anchor_stack) => patchStrategy(selectedIndex, { anchor_stack })}
                />

                <h4 className="composer-subhead">Trade sides</h4>
                <TradeSidesFields
                  value={(strategy.trade_sides as JsonObject) ?? {}}
                  onChange={(trade_sides) => patchStrategy(selectedIndex, { trade_sides })}
                />

                <SingletonComponentSection
                  title="Direction"
                  role="direction"
                  catalog={catalog!}
                  value={(strategy.direction as JsonObject) ?? {}}
                  pathPrefix={`${strategyPath(selectedIndex)}.direction`}
                  errors={validationErrors}
                  onSelect={(id) => setSingletonComponent(selectedIndex, "direction", id)}
                  onChange={(direction) => patchStrategy(selectedIndex, { direction })}
                />

                <SingletonComponentSection
                  title="Setup"
                  role="setup"
                  catalog={catalog!}
                  value={(strategy.setup as JsonObject) ?? {}}
                  pathPrefix={`${strategyPath(selectedIndex)}.setup`}
                  errors={validationErrors}
                  onSelect={(id) => setSingletonComponent(selectedIndex, "setup", id)}
                  onChange={(setup) => patchStrategy(selectedIndex, { setup })}
                />

                <SingletonComponentSection
                  title="Trigger"
                  role="trigger"
                  catalog={catalog!}
                  value={(strategy.trigger as JsonObject) ?? {}}
                  pathPrefix={`${strategyPath(selectedIndex)}.trigger`}
                  errors={validationErrors}
                  onSelect={(id) => setSingletonComponent(selectedIndex, "trigger", id)}
                  onChange={(trigger) => patchStrategy(selectedIndex, { trigger })}
                />

                <ListComponentSection
                  title="Blockers"
                  role="blockers"
                  catalog={catalog!}
                  slots={((strategy.blockers as JsonObject[]) ?? []) as JsonObject[]}
                  instanceIndex={selectedIndex}
                  errors={validationErrors}
                  onAdd={(id) => addListSlot(selectedIndex, "blockers", id)}
                  onRemove={(slot) => removeListSlot(selectedIndex, "blockers", slot)}
                  onChange={(slot, next) =>
                    updateListSlot(selectedIndex, "blockers", slot, next)
                  }
                />

                <SingletonComponentSection
                  title="Risk"
                  role="risk"
                  catalog={catalog!}
                  value={(strategy.risk as JsonObject) ?? {}}
                  pathPrefix={`${strategyPath(selectedIndex)}.risk`}
                  errors={validationErrors}
                  onSelect={(id) => setSingletonComponent(selectedIndex, "risk", id)}
                  onChange={(risk) => patchStrategy(selectedIndex, { risk })}
                />

                <ListComponentSection
                  title="Exits"
                  role="exits"
                  catalog={catalog!}
                  slots={((strategy.exits as JsonObject[]) ?? []) as JsonObject[]}
                  instanceIndex={selectedIndex}
                  errors={validationErrors}
                  onAdd={(id) => addListSlot(selectedIndex, "exits", id)}
                  onRemove={(slot) => removeListSlot(selectedIndex, "exits", slot)}
                  onChange={(slot, next) => updateListSlot(selectedIndex, "exits", slot, next)}
                />
              </>
            )}
          </fieldset>
        </div>

        <div className="composer-preview">
          <div className="composer-preview-tabs">
            <button
              type="button"
              className={previewTab === "draft" ? "is-active" : ""}
              onClick={() => setPreviewTab("draft")}
            >
              Draft JSON
            </button>
            <button
              type="button"
              className={previewTab === "serialized" ? "is-active" : ""}
              onClick={() => setPreviewTab("serialized")}
            >
              Serialized ({serializeFormat})
            </button>
          </div>
          <pre>{previewTab === "draft" ? draftPreview : (serializeContent ?? "—")}</pre>
        </div>
      </div>
    </section>
  );
}

function AnchorStackFields({
  stack,
  pathPrefix,
  errors,
  onChange,
}: {
  stack: JsonObject;
  pathPrefix: string;
  errors: ValidationErrorItem[];
  onChange: (next: JsonObject) => void;
}) {
  const patch = (key: string, value: unknown) => onChange({ ...stack, [key]: value });
  return (
    <div className="composer-block">
      <SectionErrors errors={errors} pathPrefix={pathPrefix} />
      <label className="field">
        <span>fast</span>
        <input
          type="number"
          value={Number(stack.fast ?? 0)}
          onChange={(e) => patch("fast", Number(e.target.value))}
        />
      </label>
      <label className="field">
        <span>anchor</span>
        <input
          type="number"
          value={Number(stack.anchor ?? 0)}
          onChange={(e) => patch("anchor", Number(e.target.value))}
        />
      </label>
      <label className="field">
        <span>slow</span>
        <input
          type="number"
          value={Number(stack.slow ?? 0)}
          onChange={(e) => patch("slow", Number(e.target.value))}
        />
      </label>
      <label className="field">
        <span>source</span>
        <input value={String(stack.source ?? "close")} onChange={(e) => patch("source", e.target.value)} />
      </label>
      <label className="field">
        <span>timeframe</span>
        <input
          value={String(stack.timeframe ?? "base")}
          onChange={(e) => patch("timeframe", e.target.value)}
        />
      </label>
    </div>
  );
}

function TradeSidesFields({
  value,
  onChange,
}: {
  value: JsonObject;
  onChange: (next: JsonObject) => void;
}) {
  return (
    <div className="composer-trade-sides">
      <label className="field field--inline">
        <input
          type="checkbox"
          checked={Boolean(value.long)}
          onChange={(e) => onChange({ ...value, long: e.target.checked })}
        />
        <span>long</span>
      </label>
      <label className="field field--inline">
        <input
          type="checkbox"
          checked={Boolean(value.short)}
          onChange={(e) => onChange({ ...value, short: e.target.checked })}
        />
        <span>short</span>
      </label>
    </div>
  );
}

function SingletonComponentSection({
  title,
  role,
  catalog,
  value,
  pathPrefix,
  errors,
  onSelect,
  onChange,
}: {
  title: string;
  role: ComponentSchema["role"];
  catalog: ComponentCatalog;
  value: JsonObject;
  pathPrefix: string;
  errors: ValidationErrorItem[];
  onSelect: (componentId: string) => void;
  onChange: (next: JsonObject) => void;
}) {
  const options = componentsForRole(catalog, role);
  const componentId = String(value.component_id ?? options[0]?.component_id ?? "");
  const schema = findComponentSchema(catalog, componentId);

  return (
    <fieldset className="composer-section composer-section--nested">
      <legend>{title}</legend>
      <SectionErrors errors={errors} pathPrefix={pathPrefix} />
      <label className="field">
        <span>component</span>
        <select value={componentId} onChange={(e) => onSelect(e.target.value)}>
          {options.map((o) => (
            <option key={o.component_id} value={o.component_id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {schema?.params_schema && (
        <ParamFields
          paramsSchema={schema.params_schema}
          value={value}
          onChange={onChange}
        />
      )}
    </fieldset>
  );
}

function ListComponentSection({
  title,
  role,
  catalog,
  slots,
  instanceIndex,
  errors,
  onAdd,
  onRemove,
  onChange,
}: {
  title: string;
  role: "blockers" | "exits";
  catalog: ComponentCatalog;
  slots: JsonObject[];
  instanceIndex: number;
  errors: ValidationErrorItem[];
  onAdd: (componentId: string) => void;
  onRemove: (index: number) => void;
  onChange: (index: number, next: JsonObject) => void;
}) {
  const options = componentsForRole(catalog, role);
  const [addId, setAddId] = useState(options[0]?.component_id ?? "");

  return (
    <fieldset className="composer-section composer-section--nested">
      <legend>{title}</legend>
      <div className="composer-list-add">
        <select value={addId} onChange={(e) => setAddId(e.target.value)}>
          {options.map((o) => (
            <option key={o.component_id} value={o.component_id}>
              {o.label}
            </option>
          ))}
        </select>
        <button type="button" disabled={!addId} onClick={() => onAdd(addId)}>
          + component
        </button>
      </div>

      {slots.map((slot, slotIndex) => {
        const componentId = String(slot.component_id ?? "");
        const schema = findComponentSchema(catalog, componentId);
        const path = listSlotPath(instanceIndex, role, slotIndex);
        return (
          <div key={`${componentId}-${slotIndex}`} className="composer-slot">
            <div className="composer-slot__head">
              <strong>{componentId || "component"}</strong>
              <button type="button" onClick={() => onRemove(slotIndex)}>
                Remove
              </button>
            </div>
            <SectionErrors errors={errors} pathPrefix={path} />
            <label className="field">
              <span>instance_id</span>
              <input
                value={String(slot.instance_id ?? "")}
                onChange={(e) => onChange(slotIndex, { ...slot, instance_id: e.target.value })}
              />
            </label>
            <label className="field">
              <span>component</span>
              <select
                value={componentId}
                onChange={(e) => {
                  const nextSchema = findComponentSchema(catalog, e.target.value);
                  const base: JsonObject = {
                    instance_id: String(slot.instance_id ?? e.target.value),
                    component_id: e.target.value,
                  };
                  onChange(slotIndex, applyComponentDefaults(base, nextSchema));
                }}
              >
                {options.map((o) => (
                  <option key={o.component_id} value={o.component_id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {schema?.params_schema && (
              <ParamFields
                paramsSchema={schema.params_schema}
                value={slot}
                onChange={(next) => onChange(slotIndex, next)}
              />
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
