import type {
  ComponentCatalog,
  ComponentSchema,
  JsonObject,
  StrategyConfigDraft,
  StrategyInstanceDraft,
  ValidationErrorItem,
} from "@/api/types";

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
      setup: {
        component_id: "untouched_anchor_setup",
        lookback: 50,
        active_bars: 3,
      },
      trigger: { component_id: "touch_anchor" },
      blockers: [{ instance_id: "no_blockers", component_id: "no_blockers" }],
      risk: { component_id: "no_risk_filter" },
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

export function strategyPath(index: number): string {
  return `${instancePath(index)}.strategy`;
}

export function listSlotPath(index: number, role: "blockers" | "exits", slot: number): string {
  return `${strategyPath(index)}.${role}[${slot}]`;
}
