import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  ApiError,
  fetchComponentCatalog,
  runBacktest,
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

function firstPipelineSectionFromErrors(
  errors: ValidationErrorItem[],
  instanceIndex: number,
): string | null {
  const prefix = `instances[${instanceIndex}].strategy.`;
  for (const err of errors) {
    if (!err.path?.startsWith(prefix)) {
      continue;
    }
    const rest = err.path.slice(prefix.length);
    const key = rest.split(".")[0]?.split("[")[0];
    if (
      key === "direction" ||
      key === "setup" ||
      key === "trigger" ||
      key === "blockers" ||
      key === "risk" ||
      key === "exits" ||
      key === "anchor_stack" ||
      key === "trade_sides"
    ) {
      return key === "anchor_stack" || key === "trade_sides" ? "instance-setup" : key;
    }
    if (rest.startsWith("market")) {
      return "instance-setup";
    }
  }
  return null;
}

function singletonSummary(value: JsonObject): string {
  const id = value.component_id;
  return id ? String(id) : "—";
}

function listSummary(slots: JsonObject[]): string {
  if (slots.length === 0) {
    return "none";
  }
  return slots.map((s) => String(s.instance_id || s.component_id || "?")).join(", ");
}

function ComposerCollapsible({
  id,
  title,
  summary,
  open,
  onToggle,
  hasError,
  children,
}: {
  id: string;
  title: string;
  summary?: string;
  open: boolean;
  onToggle: (id: string) => void;
  hasError?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`composer-collapsible${open ? " composer-collapsible--open" : ""}${hasError ? " composer-collapsible--error" : ""}`}
    >
      <button type="button" className="composer-collapsible__head" onClick={() => onToggle(id)}>
        <span>{title}</span>
        {summary ? <span className="composer-collapsible__summary">{summary}</span> : null}
      </button>
      {open ? <div className="composer-collapsible__body">{children}</div> : null}
    </div>
  );
}

export function ComposerPanel() {
  const {
    configDraft,
    setConfigDraft,
    configLoadStatus,
    configLoadError,
    configList,
    selectedConfigPath,
    reloadConfig,
    selectConfig,
    createNewConfig,
    refreshRunsAndSelectRun,
    setActiveTab,
  } = useWorkbench();
  const [catalog, setCatalog] = useState<ComponentCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [serializeContent, setSerializeContent] = useState<string | null>(null);
  const [serializeFormat, setSerializeFormat] = useState<"json" | "yaml">("json");
  const [previewTab, setPreviewTab] = useState<PreviewTab>("draft");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [openPipeline, setOpenPipeline] = useState("direction");
  const [busy, setBusy] = useState<"validate" | "serialize" | "save" | "backtest" | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [backtestMessage, setBacktestMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!configDraft) {
      return;
    }
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
  }, [configDraft?.family]);

  const draftPreview = useMemo(
    () => (configDraft ? JSON.stringify(configDraft, null, 2) : ""),
    [configDraft],
  );
  const validationErrors = validation?.errors ?? [];
  const canSave = validation?.ok === true;
  const canRunBacktest = validation?.ok === true;

  const instance = configDraft?.instances[selectedIndex] ?? null;
  const strategy = (instance?.strategy ?? {}) as JsonObject;

  const togglePipeline = useCallback((id: string) => {
    setOpenPipeline((cur) => (cur === id ? "" : id));
  }, []);

  const sectionHasError = useCallback(
    (pathPrefix: string) => errorsForPath(validationErrors, pathPrefix).length > 0,
    [validationErrors],
  );

  useEffect(() => {
    if (!validation || validation.ok) {
      return;
    }
    const first = firstPipelineSectionFromErrors(validation.errors, selectedIndex);
    if (first) {
      setOpenPipeline(first);
    }
  }, [validation, selectedIndex]);

  const patchDraft = useCallback(
    (patch: Partial<StrategyConfigDraft>) => {
      if (!configDraft) return;
      setValidation(null);
      setSerializeContent(null);
      setSaveMessage(null);
      setBacktestMessage(null);
      setConfigDraft({ ...configDraft, ...patch });
    },
    [configDraft, setConfigDraft],
  );

  const patchInstance = useCallback(
    (index: number, patch: Partial<StrategyInstanceDraft>) => {
      if (!configDraft) return;
      setValidation(null);
      setSerializeContent(null);
      setSaveMessage(null);
      setBacktestMessage(null);
      const instances = configDraft.instances.map((inst, i) =>
        i === index ? { ...inst, ...patch } : inst,
      );
      setConfigDraft({ ...configDraft, instances });
    },
    [configDraft, setConfigDraft],
  );

  const patchStrategy = useCallback(
    (index: number, patch: JsonObject) => {
      if (!configDraft) return;
      const inst = configDraft.instances[index];
      if (!inst) return;
      patchInstance(index, { strategy: { ...inst.strategy, ...patch } });
    },
    [configDraft, patchInstance],
  );

  const runValidate = useCallback(async () => {
    if (!configDraft) return;
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
    if (!configDraft) return;
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
      setPreviewOpen(true);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.detail : "Serialize failed.");
    } finally {
      setBusy(null);
    }
  }, [configDraft, serializeFormat]);

  const runSave = useCallback(async () => {
    if (!configDraft) return;
    setBusy("save");
    setActionError(null);
    setSaveMessage(null);
    setBacktestMessage(null);
    try {
      const result = await saveConfigDraft(configDraft);
      if (!result.ok) {
        setValidation({ ok: false, errors: result.errors });
        return;
      }
      await reloadConfig();
      setSaveMessage(result.path ? `Saved to ${result.path}` : "Saved.");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.detail : "Save failed.");
    } finally {
      setBusy(null);
    }
  }, [configDraft, reloadConfig]);

  const runBacktestAction = useCallback(async () => {
    if (!configDraft) return;
    setBusy("backtest");
    setActionError(null);
    setBacktestMessage(null);
    try {
      const result = await runBacktest({ draft: configDraft });
      if (!result.ok) {
        setValidation({ ok: false, errors: result.errors });
        return;
      }
      if (!result.run_id) {
        setActionError("Backtest finished without a run id.");
        return;
      }
      await refreshRunsAndSelectRun(result.run_id);
      setBacktestMessage(
        result.config_path
          ? `Backtest complete — run ${result.run_id} (config: ${result.config_path})`
          : `Backtest complete — run ${result.run_id}`,
      );
      setActiveTab("reports");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.detail : "Backtest failed.");
    } finally {
      setBusy(null);
    }
  }, [configDraft, refreshRunsAndSelectRun, setActiveTab]);

  const addInstance = () => {
    if (!configDraft) return;
    const id = nextInstanceId(configDraft);
    const instances = [...configDraft.instances, createDefaultInstance(id)];
    patchDraft({ instances });
    setSelectedIndex(instances.length - 1);
  };

  const removeInstance = (index: number) => {
    if (!configDraft || configDraft.instances.length <= 1) return;
    const instances = configDraft.instances.filter((_, i) => i !== index);
    patchDraft({ instances });
    setSelectedIndex(Math.min(selectedIndex, instances.length - 1));
  };

  const duplicateSelected = () => {
    if (!configDraft) return;
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
    if (!configDraft) return;
    const inst = configDraft.instances[index];
    if (!inst) return;
    const list = [...((inst.strategy[role] as JsonObject[] | undefined) ?? [])];
    list[slotIndex] = nextSlot;
    patchStrategy(index, { [role]: list });
  };

  const addListSlot = (index: number, role: "blockers" | "exits", componentId: string) => {
    if (!catalog || !configDraft) return;
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
    if (!configDraft) return;
    const inst = configDraft.instances[index];
    if (!inst) return;
    const list = ((inst.strategy[role] as JsonObject[] | undefined) ?? []).filter(
      (_, i) => i !== slotIndex,
    );
    patchStrategy(index, { [role]: list });
  };

  if (configLoadStatus === "loading") {
    return (
      <section className="panel composer-panel">
        <p className="panel__hint">Loading saved strategy config…</p>
      </section>
    );
  }

  if (!configDraft) {
    return (
      <section className="panel composer-panel">
        <div className="panel__header">
          <h2>Strategy Composer</h2>
          <p className="panel__hint">
            No saved config on disk yet. Create one here, then Save to write{" "}
            <code>research/experiments/configs/{"{family}"}/{"{experiment_id}"}.json</code>.
          </p>
        </div>
        {configLoadError && <p className="banner banner--error">{configLoadError}</p>}
        {configList.length > 0 && (
          <label className="field">
            <span>Saved config</span>
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  void selectConfig(e.target.value);
                }
              }}
            >
              <option value="" disabled>
                Select…
              </option>
              {configList.map((entry) => (
                <option key={entry.path} value={entry.experiment_id}>
                  {entry.experiment_id}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="button" className="composer-backtest" onClick={createNewConfig}>
          New strategy config
        </button>
      </section>
    );
  }

  if (!catalog && !catalogError) {
    return (
      <section className="panel composer-panel">
        <p className="panel__hint">Loading component catalog…</p>
      </section>
    );
  }

  return (
    <section className="panel composer-panel">
      <div className="composer-toolbar">
      <div className="panel__header composer-header">
        <div>
          <h2>Strategy Composer</h2>
          <p className="panel__hint">
            Edit the saved backend config, then validate → save → run backtest. Results appear in
            Reports and Chart.
          </p>
          {selectedConfigPath ? (
            <p className="panel__hint composer-config-path">
              Source: <code>{selectedConfigPath}</code>
            </p>
          ) : null}
        </div>
        <div className="composer-actions">
          <button
            type="button"
            className={`composer-preview-toggle${previewOpen ? " is-active" : ""}`}
            onClick={() => setPreviewOpen((open) => !open)}
          >
            {previewOpen ? "Hide JSON" : "JSON preview"}
          </button>
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
          <button
            type="button"
            className="composer-backtest"
            disabled={!canRunBacktest || busy !== null}
            title={canRunBacktest ? "Validate, save, and run backtest" : "Validate first"}
            onClick={() => void runBacktestAction()}
          >
            {busy === "backtest" ? "Running backtest…" : "Run backtest"}
          </button>
        </div>
      </div>

      {catalogError && <p className="banner banner--warn">{catalogError}</p>}
      {actionError && <p className="banner banner--error">{actionError}</p>}
      {saveMessage && <p className="banner banner--ok">{saveMessage}</p>}
      {backtestMessage && <p className="banner banner--ok">{backtestMessage}</p>}
      {validation && (
        <p className={`composer-status ${validation.ok ? "composer-status--ok" : "composer-status--err"}`}>
          {validation.ok ? "Config is valid." : "Validation failed — fix errors below."}
        </p>
      )}
      </div>

      <div className="composer-body">
        <div className="composer-instance-bar">
          <div className="composer-instance-chips" role="tablist" aria-label="Strategy instances">
            {configDraft.instances.map((inst, i) => (
              <button
                key={inst.instance_id}
                type="button"
                role="tab"
                aria-selected={i === selectedIndex}
                className={
                  i === selectedIndex ? "composer-instance-chip is-active" : "composer-instance-chip"
                }
                title={inst.instance_id}
                onClick={() => setSelectedIndex(i)}
              >
                {inst.instance_id}
              </button>
            ))}
            <button type="button" className="composer-instance-chip composer-instance-chip--add" onClick={addInstance}>
              + instance
            </button>
          </div>
          <div className="composer-instance-actions">
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
        </div>

        <div className={`composer-grid${previewOpen ? " composer-grid--preview-open" : ""}`}>
          <div className="composer-form-scroll">
            <div className="composer-form">
          <details className="composer-section composer-section--collapsible">
            <summary>Experiment settings</summary>
            <SectionErrors errors={validationErrors} pathPrefix="" />
            {configList.length > 0 && (
              <label className="field">
                <span>Saved config</span>
                <select
                  value={configDraft.experiment_id}
                  onChange={(e) => {
                    setValidation(null);
                    setSaveMessage(null);
                    setBacktestMessage(null);
                    void selectConfig(e.target.value);
                  }}
                >
                  {configList.map((entry) => (
                    <option key={entry.path} value={entry.experiment_id}>
                      {entry.experiment_id}
                    </option>
                  ))}
                </select>
              </label>
            )}
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
          </details>

          {instance && (
            <fieldset className="composer-section">
              <legend>Instance</legend>
              <SectionErrors errors={validationErrors} pathPrefix={instancePath(selectedIndex)} />
              <label className="field">
                <span>instance_id</span>
                <input
                  value={instance.instance_id}
                  onChange={(e) => patchInstance(selectedIndex, { instance_id: e.target.value })}
                />
              </label>
              <label className="field">
                <span>variant</span>
                <input
                  value={instance.variant}
                  onChange={(e) => patchInstance(selectedIndex, { variant: e.target.value })}
                />
              </label>

              <ComposerCollapsible
                id="instance-setup"
                title="Market & anchor"
                summary={`${instance.market.symbol} · ${instance.market.base_timeframe}`}
                open={openPipeline === "instance-setup"}
                onToggle={togglePipeline}
                hasError={
                  sectionHasError(`${instancePath(selectedIndex)}.market`) ||
                  sectionHasError(`${strategyPath(selectedIndex)}.anchor_stack`) ||
                  sectionHasError(`${strategyPath(selectedIndex)}.trade_sides`)
                }
              >
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
              </ComposerCollapsible>

              <ComposerCollapsible
                id="direction"
                title="Direction"
                summary={singletonSummary((strategy.direction as JsonObject) ?? {})}
                open={openPipeline === "direction"}
                onToggle={togglePipeline}
                hasError={sectionHasError(`${strategyPath(selectedIndex)}.direction`)}
              >
                <SingletonComponentSection
                  compact
                  title="Direction"
                  role="direction"
                  catalog={catalog!}
                  value={(strategy.direction as JsonObject) ?? {}}
                  pathPrefix={`${strategyPath(selectedIndex)}.direction`}
                  errors={validationErrors}
                  onSelect={(id) => setSingletonComponent(selectedIndex, "direction", id)}
                  onChange={(direction) => patchStrategy(selectedIndex, { direction })}
                />
              </ComposerCollapsible>

              <ComposerCollapsible
                id="setup"
                title="Setup"
                summary={singletonSummary((strategy.setup as JsonObject) ?? {})}
                open={openPipeline === "setup"}
                onToggle={togglePipeline}
                hasError={sectionHasError(`${strategyPath(selectedIndex)}.setup`)}
              >
                <SingletonComponentSection
                  compact
                  title="Setup"
                  role="setup"
                  catalog={catalog!}
                  value={(strategy.setup as JsonObject) ?? {}}
                  pathPrefix={`${strategyPath(selectedIndex)}.setup`}
                  errors={validationErrors}
                  onSelect={(id) => setSingletonComponent(selectedIndex, "setup", id)}
                  onChange={(setup) => patchStrategy(selectedIndex, { setup })}
                />
              </ComposerCollapsible>

              <ComposerCollapsible
                id="trigger"
                title="Trigger"
                summary={singletonSummary((strategy.trigger as JsonObject) ?? {})}
                open={openPipeline === "trigger"}
                onToggle={togglePipeline}
                hasError={sectionHasError(`${strategyPath(selectedIndex)}.trigger`)}
              >
                <SingletonComponentSection
                  compact
                  title="Trigger"
                  role="trigger"
                  catalog={catalog!}
                  value={(strategy.trigger as JsonObject) ?? {}}
                  pathPrefix={`${strategyPath(selectedIndex)}.trigger`}
                  errors={validationErrors}
                  onSelect={(id) => setSingletonComponent(selectedIndex, "trigger", id)}
                  onChange={(trigger) => patchStrategy(selectedIndex, { trigger })}
                />
              </ComposerCollapsible>

              <ComposerCollapsible
                id="blockers"
                title="Blockers"
                summary={listSummary(((strategy.blockers as JsonObject[]) ?? []) as JsonObject[])}
                open={openPipeline === "blockers"}
                onToggle={togglePipeline}
                hasError={sectionHasError(`${strategyPath(selectedIndex)}.blockers`)}
              >
                <ListComponentSection
                  compact
                  title="Blockers"
                  role="blockers"
                  catalog={catalog!}
                  slots={((strategy.blockers as JsonObject[]) ?? []) as JsonObject[]}
                  instanceIndex={selectedIndex}
                  errors={validationErrors}
                  onAdd={(id) => addListSlot(selectedIndex, "blockers", id)}
                  onRemove={(slot) => removeListSlot(selectedIndex, "blockers", slot)}
                  onChange={(slot, next) => updateListSlot(selectedIndex, "blockers", slot, next)}
                />
              </ComposerCollapsible>

              <ComposerCollapsible
                id="risk"
                title="Risk"
                summary={singletonSummary((strategy.risk as JsonObject) ?? {})}
                open={openPipeline === "risk"}
                onToggle={togglePipeline}
                hasError={sectionHasError(`${strategyPath(selectedIndex)}.risk`)}
              >
                <SingletonComponentSection
                  compact
                  title="Risk"
                  role="risk"
                  catalog={catalog!}
                  value={(strategy.risk as JsonObject) ?? {}}
                  pathPrefix={`${strategyPath(selectedIndex)}.risk`}
                  errors={validationErrors}
                  onSelect={(id) => setSingletonComponent(selectedIndex, "risk", id)}
                  onChange={(risk) => patchStrategy(selectedIndex, { risk })}
                />
              </ComposerCollapsible>

              <ComposerCollapsible
                id="exits"
                title="Exits"
                summary={listSummary(((strategy.exits as JsonObject[]) ?? []) as JsonObject[])}
                open={openPipeline === "exits"}
                onToggle={togglePipeline}
                hasError={sectionHasError(`${strategyPath(selectedIndex)}.exits`)}
              >
                <ListComponentSection
                  compact
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
              </ComposerCollapsible>
            </fieldset>
          )}
            </div>
          </div>

        {previewOpen && (
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
        )}
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
  compact = false,
  title,
  role,
  catalog,
  value,
  pathPrefix,
  errors,
  onSelect,
  onChange,
}: {
  compact?: boolean;
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

  const inner = (
    <>
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
    </>
  );

  if (compact) {
    return <div className="composer-collapsible-inner">{inner}</div>;
  }

  return (
    <fieldset className="composer-section composer-section--nested">
      <legend>{title}</legend>
      {inner}
    </fieldset>
  );
}

function ListComponentSection({
  compact = false,
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
  compact?: boolean;
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
  const [expandedSlots, setExpandedSlots] = useState<Set<number>>(() => new Set());

  const toggleSlot = (slotIndex: number) => {
    setExpandedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(slotIndex)) {
        next.delete(slotIndex);
      } else {
        next.add(slotIndex);
      }
      return next;
    });
  };

  const listAdd = (
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
  );

  const slotList = slots.map((slot, slotIndex) => {
    const componentId = String(slot.component_id ?? "");
    const schema = findComponentSchema(catalog, componentId);
    const path = listSlotPath(instanceIndex, role, slotIndex);
    const expanded = expandedSlots.has(slotIndex);
    const slotLabel = `${String(slot.instance_id ?? (componentId || "slot"))} · ${componentId || "component"}`;
    return (
      <div
        key={`${componentId}-${slotIndex}`}
        className={expanded ? "composer-slot" : "composer-slot composer-slot--collapsed"}
      >
        <div className="composer-slot__head">
          <button type="button" className="composer-slot__toggle" onClick={() => toggleSlot(slotIndex)}>
            {slotLabel}
          </button>
          <button type="button" onClick={() => onRemove(slotIndex)}>
            Remove
          </button>
        </div>
        <div className="composer-slot__params">
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
      </div>
    );
  });

  if (compact) {
    return (
      <div className="composer-collapsible-inner">
        {listAdd}
        {slotList}
      </div>
    );
  }

  return (
    <fieldset className="composer-section composer-section--nested">
      <legend>{title}</legend>
      {listAdd}
      {slotList}
    </fieldset>
  );
}
