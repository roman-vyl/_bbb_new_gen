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
  anyInstanceMetaHasError,
  errorsForInstanceMeta,
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
  scoped: scopedOverride,
}: {
  errors: ValidationErrorItem[];
  pathPrefix?: string;
  /** When set, shown as-is (no pathPrefix filter). */
  scoped?: ValidationErrorItem[];
}) {
  const scoped = scopedOverride ?? errorsForPath(errors, pathPrefix ?? "");
  if (scoped.length === 0) return null;
  return <ValidationMessages errors={scoped} />;
}

function firstPipelineSectionFromErrors(errors: ValidationErrorItem[]): string | null {
  for (const err of errors) {
    const path = err.path ?? "";
    if (/instances\[\d+\]\.(instance_id|variant)\b/.test(path)) {
      return "instance-meta";
    }
    const marketMatch = path.match(/instances\[\d+\]\.market\b/);
    if (marketMatch) {
      return "instance-setup";
    }
    const strategyMatch = path.match(/instances\[\d+\]\.strategy\.([^.[]+)/);
    if (!strategyMatch) {
      continue;
    }
    const key = strategyMatch[1];
    if (key === "anchor_stack" || key === "trade_sides") {
      return "instance-setup";
    }
    if (
      key === "direction" ||
      key === "setup" ||
      key === "trigger" ||
      key === "blockers" ||
      key === "risk" ||
      key === "exits" ||
      key === "trade_management"
    ) {
      return key === "trade_management" ? "exits" : key;
    }
  }
  return null;
}

function anyInstancePathHasError(
  errors: ValidationErrorItem[],
  instanceCount: number,
  pathForIndex: (index: number) => string,
): boolean {
  for (let i = 0; i < instanceCount; i++) {
    if (errorsForPath(errors, pathForIndex(i)).length > 0) {
      return true;
    }
  }
  return false;
}

function joinInstanceSummaries(parts: string[]): string {
  const trimmed = parts.map((p) => p.trim()).filter(Boolean);
  if (trimmed.length === 0) {
    return "—";
  }
  const unique = [...new Set(trimmed)];
  if (unique.length === 1) {
    return unique[0];
  }
  return trimmed.join(" · ");
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

function readAlwaysOnExits(strategy: JsonObject): JsonObject[] {
  const tradeManagement = (strategy.trade_management as JsonObject | undefined) ?? {};
  const exitPolicy = (tradeManagement.exit_policy as JsonObject | undefined) ?? {};
  const alwaysOn = (exitPolicy.always_on as JsonObject | undefined) ?? {};
  return ((alwaysOn.exits as JsonObject[] | undefined) ?? []) as JsonObject[];
}

function writeAlwaysOnExits(strategy: JsonObject, exits: JsonObject[]): JsonObject {
  const tradeManagement = (strategy.trade_management as JsonObject | undefined) ?? {};
  const exitPolicy = (tradeManagement.exit_policy as JsonObject | undefined) ?? {};
  const alwaysOn = (exitPolicy.always_on as JsonObject | undefined) ?? {};
  return {
    ...strategy,
    trade_management: {
      ...tradeManagement,
      exit_policy: {
        ...exitPolicy,
        always_on: {
          ...alwaysOn,
          exits,
        },
      },
    },
  };
}

function readExitPolicy(strategy: JsonObject): JsonObject {
  const tradeManagement = (strategy.trade_management as JsonObject | undefined) ?? {};
  return ((tradeManagement.exit_policy as JsonObject | undefined) ?? {}) as JsonObject;
}

function readContextConfig(strategy: JsonObject): JsonObject {
  return ((readExitPolicy(strategy).context as JsonObject | undefined) ?? {}) as JsonObject;
}

function writeContextConfig(strategy: JsonObject, context: JsonObject): JsonObject {
  const tradeManagement = (strategy.trade_management as JsonObject | undefined) ?? {};
  const exitPolicy = readExitPolicy(strategy);
  return {
    ...strategy,
    trade_management: {
      ...tradeManagement,
      exit_policy: {
        ...exitPolicy,
        context,
      },
    },
  };
}

function readProfileExits(strategy: JsonObject, profile: "aligned" | "countertrend" | "neutral"): JsonObject[] {
  const exitPolicy = readExitPolicy(strategy);
  const profiles = (exitPolicy.profiles as JsonObject | undefined) ?? {};
  const profileObj = (profiles[profile] as JsonObject | undefined) ?? {};
  return ((profileObj.exits as JsonObject[] | undefined) ?? []) as JsonObject[];
}

function writeProfileExits(
  strategy: JsonObject,
  profile: "aligned" | "countertrend" | "neutral",
  exits: JsonObject[],
): JsonObject {
  const tradeManagement = (strategy.trade_management as JsonObject | undefined) ?? {};
  const exitPolicy = readExitPolicy(strategy);
  const profiles = (exitPolicy.profiles as JsonObject | undefined) ?? {};
  const profileObj = (profiles[profile] as JsonObject | undefined) ?? {};
  return {
    ...strategy,
    trade_management: {
      ...tradeManagement,
      exit_policy: {
        ...exitPolicy,
        profiles: {
          ...profiles,
          [profile]: {
            ...profileObj,
            exits,
          },
        },
      },
    },
  };
}

function ComposerInstanceGrid({
  instances,
  selectedIndex,
  children,
}: {
  instances: StrategyInstanceDraft[];
  selectedIndex: number;
  children: (index: number, inst: StrategyInstanceDraft) => ReactNode;
}) {
  return (
    <div className="composer-instance-grid">
      {instances.map((inst, index) => (
        <div
          key={`${inst.instance_id}-${index}`}
          className={`composer-instance-card${index === selectedIndex ? " is-selected" : ""}`}
        >
          <div className="composer-instance-card__title" title={inst.instance_id}>
            {inst.instance_id}
          </div>
          <div className="composer-instance-card__body">{children(index, inst)}</div>
        </div>
      ))}
    </div>
  );
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
  const [openPipelineSections, setOpenPipelineSections] = useState<Set<string>>(
    () => new Set(["direction"]),
  );
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

  const togglePipeline = useCallback((id: string) => {
    setOpenPipelineSections((cur) => {
      const next = new Set(cur);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!validation || validation.ok) {
      return;
    }
    const first = firstPipelineSectionFromErrors(validation.errors);
    if (first) {
      setOpenPipelineSections((cur) => {
        if (cur.has(first)) {
          return cur;
        }
        const next = new Set(cur);
        next.add(first);
        return next;
      });
    }
  }, [validation]);

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
    role:
      | "blockers"
      | "exits"
      | "aligned_exits"
      | "countertrend_exits"
      | "neutral_exits",
    slotIndex: number,
    nextSlot: JsonObject,
  ) => {
    if (!configDraft) return;
    const inst = configDraft.instances[index];
    if (!inst) return;
    if (role === "blockers") {
      const list = [...((inst.strategy[role] as JsonObject[] | undefined) ?? [])];
      list[slotIndex] = nextSlot;
      patchStrategy(index, { [role]: list });
      return;
    }
    if (role === "exits") {
      const list = [...readAlwaysOnExits(inst.strategy as JsonObject)];
      list[slotIndex] = nextSlot;
      patchInstance(index, { strategy: writeAlwaysOnExits(inst.strategy as JsonObject, list) });
      return;
    }
    if (role === "aligned_exits") {
      const list = [...readProfileExits(inst.strategy as JsonObject, "aligned")];
      list[slotIndex] = nextSlot;
      patchInstance(index, { strategy: writeProfileExits(inst.strategy as JsonObject, "aligned", list) });
      return;
    }
    if (role === "countertrend_exits") {
      const list = [...readProfileExits(inst.strategy as JsonObject, "countertrend")];
      list[slotIndex] = nextSlot;
      patchInstance(index, {
        strategy: writeProfileExits(inst.strategy as JsonObject, "countertrend", list),
      });
      return;
    }
    const list = [...readProfileExits(inst.strategy as JsonObject, "neutral")];
    list[slotIndex] = nextSlot;
    patchInstance(index, { strategy: writeProfileExits(inst.strategy as JsonObject, "neutral", list) });
  };

  const addListSlot = (
    index: number,
    role:
      | "blockers"
      | "exits"
      | "aligned_exits"
      | "countertrend_exits"
      | "neutral_exits",
    componentId: string,
  ) => {
    if (!catalog || !configDraft) return;
    const schema = findComponentSchema(catalog, componentId);
    const slotId = `${componentId}_${Date.now().toString(36).slice(-4)}`;
    const base: JsonObject = { instance_id: slotId, component_id: componentId };
    const nextSlot = applyComponentDefaults(base, schema);
    const inst = configDraft.instances[index];
    if (!inst) return;
    if (role === "blockers") {
      const list = [...((inst.strategy[role] as JsonObject[] | undefined) ?? []), nextSlot];
      patchStrategy(index, { [role]: list });
      return;
    }
    if (role === "exits") {
      const list = [...readAlwaysOnExits(inst.strategy as JsonObject), nextSlot];
      patchInstance(index, { strategy: writeAlwaysOnExits(inst.strategy as JsonObject, list) });
      return;
    }
    if (role === "aligned_exits") {
      const list = [...readProfileExits(inst.strategy as JsonObject, "aligned"), nextSlot];
      patchInstance(index, { strategy: writeProfileExits(inst.strategy as JsonObject, "aligned", list) });
      return;
    }
    if (role === "countertrend_exits") {
      const list = [...readProfileExits(inst.strategy as JsonObject, "countertrend"), nextSlot];
      patchInstance(index, {
        strategy: writeProfileExits(inst.strategy as JsonObject, "countertrend", list),
      });
      return;
    }
    const list = [...readProfileExits(inst.strategy as JsonObject, "neutral"), nextSlot];
    patchInstance(index, { strategy: writeProfileExits(inst.strategy as JsonObject, "neutral", list) });
  };

  const removeListSlot = (
    index: number,
    role:
      | "blockers"
      | "exits"
      | "aligned_exits"
      | "countertrend_exits"
      | "neutral_exits",
    slotIndex: number,
  ) => {
    if (!configDraft) return;
    const inst = configDraft.instances[index];
    if (!inst) return;
    if (role === "blockers") {
      const list = ((inst.strategy[role] as JsonObject[] | undefined) ?? []).filter(
        (_, i) => i !== slotIndex,
      );
      patchStrategy(index, { [role]: list });
      return;
    }
    if (role === "exits") {
      const list = readAlwaysOnExits(inst.strategy as JsonObject).filter((_, i) => i !== slotIndex);
      patchInstance(index, { strategy: writeAlwaysOnExits(inst.strategy as JsonObject, list) });
      return;
    }
    if (role === "aligned_exits") {
      const list = readProfileExits(inst.strategy as JsonObject, "aligned").filter((_, i) => i !== slotIndex);
      patchInstance(index, { strategy: writeProfileExits(inst.strategy as JsonObject, "aligned", list) });
      return;
    }
    if (role === "countertrend_exits") {
      const list = readProfileExits(inst.strategy as JsonObject, "countertrend").filter((_, i) => i !== slotIndex);
      patchInstance(index, {
        strategy: writeProfileExits(inst.strategy as JsonObject, "countertrend", list),
      });
      return;
    }
    const list = readProfileExits(inst.strategy as JsonObject, "neutral").filter((_, i) => i !== slotIndex);
    patchInstance(index, { strategy: writeProfileExits(inst.strategy as JsonObject, "neutral", list) });
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
      {validation && !validation.ok && validation.errors.length > 0 && (
        <ValidationMessages errors={validation.errors} />
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

          {catalog && (
            <div className="composer-pipeline">
              <ComposerCollapsible
                id="instance-meta"
                title="Instance"
                summary={joinInstanceSummaries(
                  configDraft.instances.map((inst) => inst.variant || inst.instance_id),
                )}
                open={openPipelineSections.has("instance-meta")}
                onToggle={togglePipeline}
                hasError={anyInstanceMetaHasError(
                  validationErrors,
                  configDraft.instances.length,
                )}
              >
                <ComposerInstanceGrid
                  instances={configDraft.instances}
                  selectedIndex={selectedIndex}
                >
                  {(index, inst) => (
                    <>
                      <SectionErrors
                        errors={validationErrors}
                        scoped={errorsForInstanceMeta(validationErrors, index)}
                      />
                      <label className="field">
                        <span>instance_id</span>
                        <input
                          value={inst.instance_id}
                          onChange={(e) => patchInstance(index, { instance_id: e.target.value })}
                        />
                      </label>
                      <label className="field">
                        <span>variant</span>
                        <input
                          value={inst.variant}
                          onChange={(e) => patchInstance(index, { variant: e.target.value })}
                        />
                      </label>
                    </>
                  )}
                </ComposerInstanceGrid>
              </ComposerCollapsible>

              <ComposerCollapsible
                id="instance-setup"
                title="Market & anchor"
                summary={joinInstanceSummaries(
                  configDraft.instances.map(
                    (inst) => `${inst.market.symbol} · ${inst.market.base_timeframe}`,
                  ),
                )}
                open={openPipelineSections.has("instance-setup")}
                onToggle={togglePipeline}
                hasError={
                  anyInstancePathHasError(
                    validationErrors,
                    configDraft.instances.length,
                    (i) => `${instancePath(i)}.market`,
                  ) ||
                  anyInstancePathHasError(
                    validationErrors,
                    configDraft.instances.length,
                    (i) => `${strategyPath(i)}.anchor_stack`,
                  ) ||
                  anyInstancePathHasError(
                    validationErrors,
                    configDraft.instances.length,
                    (i) => `${strategyPath(i)}.trade_sides`,
                  )
                }
              >
                <ComposerInstanceGrid
                  instances={configDraft.instances}
                  selectedIndex={selectedIndex}
                >
                  {(index, inst) => {
                    const instStrategy = (inst.strategy ?? {}) as JsonObject;
                    return (
                      <>
                        <h4 className="composer-subhead">Market</h4>
                        <label className="field">
                          <span>symbol</span>
                          <input
                            value={inst.market.symbol}
                            onChange={(e) =>
                              patchInstance(index, {
                                market: { ...inst.market, symbol: e.target.value },
                              })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>base_timeframe</span>
                          <input
                            value={inst.market.base_timeframe}
                            onChange={(e) =>
                              patchInstance(index, {
                                market: { ...inst.market, base_timeframe: e.target.value },
                              })
                            }
                          />
                        </label>
                        <h4 className="composer-subhead">Anchor stack</h4>
                        <AnchorStackFields
                          stack={(instStrategy.anchor_stack as JsonObject) ?? {}}
                          pathPrefix={`${strategyPath(index)}.anchor_stack`}
                          errors={validationErrors}
                          onChange={(anchor_stack) => patchStrategy(index, { anchor_stack })}
                        />
                        <h4 className="composer-subhead">Trade sides</h4>
                        <TradeSidesFields
                          value={(instStrategy.trade_sides as JsonObject) ?? {}}
                          onChange={(trade_sides) => patchStrategy(index, { trade_sides })}
                        />
                      </>
                    );
                  }}
                </ComposerInstanceGrid>
              </ComposerCollapsible>

              <ComposerCollapsible
                id="direction"
                title="Direction"
                summary={joinInstanceSummaries(
                  configDraft.instances.map((inst) =>
                    singletonSummary((inst.strategy.direction as JsonObject) ?? {}),
                  ),
                )}
                open={openPipelineSections.has("direction")}
                onToggle={togglePipeline}
                hasError={anyInstancePathHasError(
                  validationErrors,
                  configDraft.instances.length,
                  (i) => `${strategyPath(i)}.direction`,
                )}
              >
                <ComposerInstanceGrid
                  instances={configDraft.instances}
                  selectedIndex={selectedIndex}
                >
                  {(index, inst) => {
                    const instStrategy = (inst.strategy ?? {}) as JsonObject;
                    return (
                      <SingletonComponentSection
                        compact
                        title="Direction"
                        role="direction"
                        catalog={catalog}
                        value={(instStrategy.direction as JsonObject) ?? {}}
                        pathPrefix={`${strategyPath(index)}.direction`}
                        errors={validationErrors}
                        onSelect={(id) => setSingletonComponent(index, "direction", id)}
                        onChange={(direction) => patchStrategy(index, { direction })}
                      />
                    );
                  }}
                </ComposerInstanceGrid>
              </ComposerCollapsible>

              <ComposerCollapsible
                id="setup"
                title="Setup"
                summary={joinInstanceSummaries(
                  configDraft.instances.map((inst) =>
                    singletonSummary((inst.strategy.setup as JsonObject) ?? {}),
                  ),
                )}
                open={openPipelineSections.has("setup")}
                onToggle={togglePipeline}
                hasError={anyInstancePathHasError(
                  validationErrors,
                  configDraft.instances.length,
                  (i) => `${strategyPath(i)}.setup`,
                )}
              >
                <ComposerInstanceGrid
                  instances={configDraft.instances}
                  selectedIndex={selectedIndex}
                >
                  {(index, inst) => {
                    const instStrategy = (inst.strategy ?? {}) as JsonObject;
                    return (
                      <SingletonComponentSection
                        compact
                        title="Setup"
                        role="setup"
                        catalog={catalog}
                        value={(instStrategy.setup as JsonObject) ?? {}}
                        pathPrefix={`${strategyPath(index)}.setup`}
                        errors={validationErrors}
                        onSelect={(id) => setSingletonComponent(index, "setup", id)}
                        onChange={(setup) => patchStrategy(index, { setup })}
                      />
                    );
                  }}
                </ComposerInstanceGrid>
              </ComposerCollapsible>

              <ComposerCollapsible
                id="trigger"
                title="Trigger"
                summary={joinInstanceSummaries(
                  configDraft.instances.map((inst) =>
                    singletonSummary((inst.strategy.trigger as JsonObject) ?? {}),
                  ),
                )}
                open={openPipelineSections.has("trigger")}
                onToggle={togglePipeline}
                hasError={anyInstancePathHasError(
                  validationErrors,
                  configDraft.instances.length,
                  (i) => `${strategyPath(i)}.trigger`,
                )}
              >
                <ComposerInstanceGrid
                  instances={configDraft.instances}
                  selectedIndex={selectedIndex}
                >
                  {(index, inst) => {
                    const instStrategy = (inst.strategy ?? {}) as JsonObject;
                    return (
                      <SingletonComponentSection
                        compact
                        title="Trigger"
                        role="trigger"
                        catalog={catalog}
                        value={(instStrategy.trigger as JsonObject) ?? {}}
                        pathPrefix={`${strategyPath(index)}.trigger`}
                        errors={validationErrors}
                        onSelect={(id) => setSingletonComponent(index, "trigger", id)}
                        onChange={(trigger) => patchStrategy(index, { trigger })}
                      />
                    );
                  }}
                </ComposerInstanceGrid>
              </ComposerCollapsible>

              <ComposerCollapsible
                id="blockers"
                title="Blockers"
                summary={joinInstanceSummaries(
                  configDraft.instances.map((inst) =>
                    listSummary(((inst.strategy.blockers as JsonObject[]) ?? []) as JsonObject[]),
                  ),
                )}
                open={openPipelineSections.has("blockers")}
                onToggle={togglePipeline}
                hasError={anyInstancePathHasError(
                  validationErrors,
                  configDraft.instances.length,
                  (i) => `${strategyPath(i)}.blockers`,
                )}
              >
                <ComposerInstanceGrid
                  instances={configDraft.instances}
                  selectedIndex={selectedIndex}
                >
                  {(index, inst) => {
                    const instStrategy = (inst.strategy ?? {}) as JsonObject;
                    return (
                      <ListComponentSection
                        compact
                        title="Blockers"
                        role="blockers"
                        catalog={catalog}
                        slots={((instStrategy.blockers as JsonObject[]) ?? []) as JsonObject[]}
                        instanceIndex={index}
                        errors={validationErrors}
                        onAdd={(id) => addListSlot(index, "blockers", id)}
                        onRemove={(slot) => removeListSlot(index, "blockers", slot)}
                        onChange={(slot, next) => updateListSlot(index, "blockers", slot, next)}
                      />
                    );
                  }}
                </ComposerInstanceGrid>
              </ComposerCollapsible>

              <ComposerCollapsible
                id="risk"
                title="Risk"
                summary={joinInstanceSummaries(
                  configDraft.instances.map((inst) =>
                    singletonSummary((inst.strategy.risk as JsonObject) ?? {}),
                  ),
                )}
                open={openPipelineSections.has("risk")}
                onToggle={togglePipeline}
                hasError={anyInstancePathHasError(
                  validationErrors,
                  configDraft.instances.length,
                  (i) => `${strategyPath(i)}.risk`,
                )}
              >
                <ComposerInstanceGrid
                  instances={configDraft.instances}
                  selectedIndex={selectedIndex}
                >
                  {(index, inst) => {
                    const instStrategy = (inst.strategy ?? {}) as JsonObject;
                    return (
                      <SingletonComponentSection
                        compact
                        title="Risk"
                        role="risk"
                        catalog={catalog}
                        value={(instStrategy.risk as JsonObject) ?? {}}
                        pathPrefix={`${strategyPath(index)}.risk`}
                        errors={validationErrors}
                        onSelect={(id) => setSingletonComponent(index, "risk", id)}
                        onChange={(risk) => patchStrategy(index, { risk })}
                      />
                    );
                  }}
                </ComposerInstanceGrid>
              </ComposerCollapsible>

              <ComposerCollapsible
                id="exits"
                title="Trade management / Exit policy"
                summary={joinInstanceSummaries(
                  configDraft.instances.map((inst) =>
                    listSummary(readAlwaysOnExits((inst.strategy ?? {}) as JsonObject)),
                  ),
                )}
                open={openPipelineSections.has("exits")}
                onToggle={togglePipeline}
                hasError={anyInstancePathHasError(
                  validationErrors,
                  configDraft.instances.length,
                  (i) => `${strategyPath(i)}.exits`,
                )}
              >
                <ComposerInstanceGrid
                  instances={configDraft.instances}
                  selectedIndex={selectedIndex}
                >
                  {(index, inst) => {
                    const instStrategy = (inst.strategy ?? {}) as JsonObject;
                    return (
                      <div className="composer-collapsible-inner">
                        <h4 className="composer-subhead">HTF context</h4>
                        <HtfContextFields
                          value={readContextConfig(instStrategy)}
                          pathPrefix={`${strategyPath(index)}.trade_management.exit_policy.context`}
                          errors={validationErrors}
                          onChange={(context) =>
                            patchInstance(index, {
                              strategy: writeContextConfig(instStrategy, context),
                            })
                          }
                        />
                        <h4 className="composer-subhead">Always-on exits</h4>
                        <ListComponentSection
                          compact
                          title="Always-on exits"
                          role="exits"
                          pathRole="always_on_exits"
                          catalog={catalog}
                          slots={readAlwaysOnExits(instStrategy)}
                          instanceIndex={index}
                          errors={validationErrors}
                          onAdd={(id) => addListSlot(index, "exits", id)}
                          onRemove={(slot) => removeListSlot(index, "exits", slot)}
                          onChange={(slot, next) => updateListSlot(index, "exits", slot, next)}
                        />
                        <h4 className="composer-subhead">Profile: aligned</h4>
                        <ListComponentSection
                          compact
                          title="Aligned exits"
                          role="exits"
                          pathRole="aligned_exits"
                          catalog={catalog}
                          slots={readProfileExits(instStrategy, "aligned")}
                          instanceIndex={index}
                          errors={validationErrors}
                          onAdd={(id) => addListSlot(index, "aligned_exits", id)}
                          onRemove={(slot) => removeListSlot(index, "aligned_exits", slot)}
                          onChange={(slot, next) => updateListSlot(index, "aligned_exits", slot, next)}
                        />
                        <h4 className="composer-subhead">Profile: countertrend</h4>
                        <ListComponentSection
                          compact
                          title="Countertrend exits"
                          role="exits"
                          pathRole="countertrend_exits"
                          catalog={catalog}
                          slots={readProfileExits(instStrategy, "countertrend")}
                          instanceIndex={index}
                          errors={validationErrors}
                          onAdd={(id) => addListSlot(index, "countertrend_exits", id)}
                          onRemove={(slot) => removeListSlot(index, "countertrend_exits", slot)}
                          onChange={(slot, next) => updateListSlot(index, "countertrend_exits", slot, next)}
                        />
                        <h4 className="composer-subhead">Profile: neutral</h4>
                        <ListComponentSection
                          compact
                          title="Neutral exits"
                          role="exits"
                          pathRole="neutral_exits"
                          catalog={catalog}
                          slots={readProfileExits(instStrategy, "neutral")}
                          instanceIndex={index}
                          errors={validationErrors}
                          onAdd={(id) => addListSlot(index, "neutral_exits", id)}
                          onRemove={(slot) => removeListSlot(index, "neutral_exits", slot)}
                          onChange={(slot, next) => updateListSlot(index, "neutral_exits", slot, next)}
                        />
                      </div>
                    );
                  }}
                </ComposerInstanceGrid>
              </ComposerCollapsible>
            </div>
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

function HtfContextFields({
  value,
  pathPrefix,
  errors,
  onChange,
}: {
  value: JsonObject;
  pathPrefix: string;
  errors: ValidationErrorItem[];
  onChange: (next: JsonObject) => void;
}) {
  const patch = (key: string, next: unknown) => onChange({ ...value, [key]: next });
  return (
    <div className="composer-block">
      <SectionErrors errors={errors} pathPrefix={pathPrefix} />
      <label className="field">
        <span>component_id</span>
        <input value={String(value.component_id ?? "htf_context")} onChange={(e) => patch("component_id", e.target.value)} />
      </label>
      <label className="field">
        <span>timeframe</span>
        <input value={String(value.timeframe ?? "4h")} onChange={(e) => patch("timeframe", e.target.value)} />
      </label>
      <label className="field">
        <span>source</span>
        <input value={String(value.source ?? "close")} onChange={(e) => patch("source", e.target.value)} />
      </label>
      <label className="field">
        <span>fast_period</span>
        <input
          type="number"
          value={Number(value.fast_period ?? 100)}
          onChange={(e) => patch("fast_period", Number(e.target.value))}
        />
      </label>
      <label className="field">
        <span>anchor_period</span>
        <input
          type="number"
          value={Number(value.anchor_period ?? 200)}
          onChange={(e) => patch("anchor_period", Number(e.target.value))}
        />
      </label>
      <label className="field">
        <span>slow_period</span>
        <input
          type="number"
          value={Number(value.slow_period ?? 1000)}
          onChange={(e) => patch("slow_period", Number(e.target.value))}
        />
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
    return (
      <div className="composer-collapsible-inner">
        <div className="composer-component-panel">{inner}</div>
      </div>
    );
  }

  return (
    <fieldset className="composer-section composer-section--nested">
      <legend>{title}</legend>
      <div className="composer-component-panel">{inner}</div>
    </fieldset>
  );
}

function ListComponentSection({
  compact = false,
  title,
  role,
  pathRole = role,
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
  pathRole?:
    | "blockers"
    | "exits"
    | "always_on_exits"
    | "aligned_exits"
    | "countertrend_exits"
    | "neutral_exits";
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

  const slotList = (
    <div className="composer-component-slots">
      {slots.map((slot, slotIndex) => {
        const componentId = String(slot.component_id ?? "");
        const schema = findComponentSchema(catalog, componentId);
        const path = listSlotPath(instanceIndex, pathRole, slotIndex);
        const slotLabel = String(slot.instance_id ?? (componentId || "slot"));
        return (
          <div key={`${componentId}-${slotIndex}`} className="composer-slot">
        <div className="composer-slot__head">
          <span className="composer-slot__label" title={slotLabel}>
            {slotLabel}
          </span>
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
      })}
    </div>
  );

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
