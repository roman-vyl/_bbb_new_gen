import type {
  ComponentCatalog,
  ComponentSchema,
  JsonObject,
  StrategyConfigDraft,
  StrategyInstanceDraft,
  ValidationErrorItem,
} from "@/api/types";

export const COMPOSER_DEFAULT_FAMILY = "ema_pullback";
export const COMPOSER_DEFAULT_EXPERIMENT_ID = "draft_ema_pullback";

export function createBlankConfigDraft(family = COMPOSER_DEFAULT_FAMILY): StrategyConfigDraft {
  return {
    config_version: 1,
    experiment_id: COMPOSER_DEFAULT_EXPERIMENT_ID,
    family,
    execution: {},
    instances: [createDefaultInstance("instance_1")],
  };
}

export function createDefaultInstance(instanceId: string): StrategyInstanceDraft {
  return {
    instance_id: instanceId,
    variant: instanceId,
    market: { symbol: "BTCUSDT", base_timeframe: "5m" },
    strategy: {
      trade_sides: { long: true, short: false },
      anchor_stack: {
        source: "close",
        timeframe: "base",
        fast: 200,
        anchor: 500,
        slow: 1000,
      },
      direction: { component_id: "ema_anchor_stack_trend" },
      setups: [
        {
          instance_id: "setup",
          component_id: "untouched_anchor_setup",
          lookback: 50,
          active_bars: 3,
        },
      ],
      trigger: { component_id: "reclaim_anchor", lookback: 1 },
      blockers: [{ instance_id: "no_blockers", component_id: "no_blockers" }],
      risk: { component_id: "no_risk_filter" },
      contexts: {},
      trade_management: {
        exit_policy: {
          always_on: {
            exits: [
              {
                instance_id: "atr_sl",
                component_id: "atr_stop_loss",
                distance: { timeframe: "5m", period: 14, multiplier: 2 },
              },
              {
                instance_id: "atr_tp",
                component_id: "atr_take_profit",
                distance: { timeframe: "base", period: 14, multiplier: 4 },
              },
            ],
          },
          profiles: {
            aligned: { exits: [] },
            countertrend: { exits: [] },
            neutral: { exits: [] },
          },
        },
      },
    },
  };
}

export function duplicateInstance(
  source: StrategyInstanceDraft,
  newId: string,
): StrategyInstanceDraft {
  return {
    ...source,
    instance_id: newId,
    variant: newId,
    strategy: structuredClone(source.strategy),
  };
}

export function nextInstanceId(draft: StrategyConfigDraft): string {
  const base = "instance";
  let n = draft.instances.length + 1;
  let candidate = `${base}_${n}`;
  const ids = new Set(draft.instances.map((i) => i.instance_id));
  while (ids.has(candidate)) {
    n += 1;
    candidate = `${base}_${n}`;
  }
  return candidate;
}

export function componentsForRole(
  catalog: ComponentCatalog,
  role: ComponentSchema["role"],
): ComponentSchema[] {
  return catalog.components.filter((c) => c.role === role);
}

export function findComponentSchema(
  catalog: ComponentCatalog,
  componentId: string,
): ComponentSchema | undefined {
  return catalog.components.find((c) => c.component_id === componentId);
}

export function applyComponentDefaults(
  base: JsonObject,
  schema: ComponentSchema | undefined,
): JsonObject {
  if (!schema?.params_schema) {
    return { ...base };
  }
  let out = { ...base };
  for (const [key, field] of Object.entries(schema.params_schema)) {
    if (readParamValue(out, key) === undefined && field.default !== undefined) {
      out = writeParamValue(out, key, field.default);
    }
  }
  return out;
}

export function readParamValue(obj: JsonObject, key: string): unknown {
  if (!key.includes(".")) {
    return obj[key];
  }
  const [head, ...rest] = key.split(".");
  const nested = obj[head];
  if (typeof nested !== "object" || nested === null || Array.isArray(nested)) {
    return undefined;
  }
  return readParamValue(nested as JsonObject, rest.join("."));
}

export function writeParamValue(obj: JsonObject, key: string, value: unknown): JsonObject {
  if (!key.includes(".")) {
    return { ...obj, [key]: value };
  }
  const [head, ...rest] = key.split(".");
  const nested = (obj[head] as JsonObject | undefined) ?? {};
  return {
    ...obj,
    [head]: writeParamValue(nested, rest.join("."), value),
  };
}

export function errorsForPath(
  errors: ValidationErrorItem[],
  pathPrefix: string,
): ValidationErrorItem[] {
  if (!pathPrefix) {
    return errors.filter((e) => !e.path || e.path === "");
  }
  return errors.filter(
    (e) =>
      e.path === pathPrefix ||
      e.path.startsWith(`${pathPrefix}.`) ||
      e.path.startsWith(`${pathPrefix}[`),
  );
}

export function instancePath(index: number): string {
  return `instances[${index}]`;
}

export function instanceMetaPath(
  index: number,
  field: "instance_id" | "variant",
): string {
  return `${instancePath(index)}.${field}`;
}

/** Validation paths for instance_id / variant only (not market, strategy, …). */
export function errorsForInstanceMeta(
  errors: ValidationErrorItem[],
  index: number,
): ValidationErrorItem[] {
  const prefix = instancePath(index);
  return errors.filter((e) => {
    const path = e.path ?? "";
    if (!path.startsWith(`${prefix}.`)) {
      return false;
    }
    const rest = path.slice(prefix.length + 1);
    return (
      rest === "instance_id" ||
      rest.startsWith("instance_id.") ||
      rest.startsWith("instance_id[") ||
      rest === "variant" ||
      rest.startsWith("variant.") ||
      rest.startsWith("variant[")
    );
  });
}

export function anyInstanceMetaHasError(
  errors: ValidationErrorItem[],
  instanceCount: number,
): boolean {
  for (let i = 0; i < instanceCount; i++) {
    if (errorsForInstanceMeta(errors, i).length > 0) {
      return true;
    }
  }
  return false;
}

export function strategyPath(index: number): string {
  return `${instancePath(index)}.strategy`;
}

export function listSlotPath(
  index: number,
  role:
    | "blockers"
    | "setups"
    | "exits"
    | "always_on_exits"
    | "aligned_exits"
    | "countertrend_exits"
    | "neutral_exits",
  slot: number,
): string {
  if (role === "setups") {
    return `${strategyPath(index)}.setups[${slot}]`;
  }
  if (role === "blockers") {
    return `${strategyPath(index)}.blockers[${slot}]`;
  }
  if (role === "exits" || role === "always_on_exits") {
    return `${strategyPath(index)}.trade_management.exit_policy.always_on.exits[${slot}]`;
  }
  if (role === "aligned_exits") {
    return `${strategyPath(index)}.trade_management.exit_policy.profiles.aligned.exits[${slot}]`;
  }
  if (role === "countertrend_exits") {
    return `${strategyPath(index)}.trade_management.exit_policy.profiles.countertrend.exits[${slot}]`;
  }
  return `${strategyPath(index)}.trade_management.exit_policy.profiles.neutral.exits[${slot}]`;
}
