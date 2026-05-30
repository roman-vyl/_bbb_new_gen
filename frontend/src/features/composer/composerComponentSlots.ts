import type { ComponentCatalog, ComponentSchema, JsonObject, StrategyConfigDraft } from "@/api/types";

import { findComponentSchema } from "./composerDraft";

const SINGLETON_ROLES = ["direction", "setup", "trigger", "risk"] as const;

type SingletonRole = (typeof SINGLETON_ROLES)[number];

function paramKeys(schema: ComponentSchema | undefined): string[] {
  return Object.keys(schema?.params_schema ?? {});
}

function usesNestedParams(schema: ComponentSchema | undefined): boolean {
  return schema?.params_storage === "nested";
}

/** Flatten nested `params` for in-memory Composer editing (ParamFields read top-level keys). */
export function normalizeComponentSlotForEditing(
  slot: JsonObject,
  schema: ComponentSchema | undefined,
): JsonObject {
  if (!usesNestedParams(schema)) {
    return slot;
  }
  const paramsRaw = slot.params;
  if (!paramsRaw || typeof paramsRaw !== "object" || Array.isArray(paramsRaw)) {
    return slot;
  }
  const nested = paramsRaw as JsonObject;
  const keys = paramKeys(schema);
  const { params: _removed, ...base } = slot;
  const out: JsonObject = { ...base };
  for (const key of keys) {
    if (key in nested) {
      out[key] = nested[key];
    }
  }
  return out;
}

/** Nest catalog param keys under `params` for backend-compatible external config. */
export function normalizeComponentSlotForApi(
  slot: JsonObject,
  schema: ComponentSchema | undefined,
): JsonObject {
  if (!usesNestedParams(schema)) {
    return slot;
  }
  const keys = paramKeys(schema);
  const params: JsonObject = {};
  const out: JsonObject = {};

  for (const [key, value] of Object.entries(slot)) {
    if (key === "params") {
      continue;
    }
    if (keys.includes(key)) {
      params[key] = value;
      continue;
    }
    out[key] = value;
  }

  const existing = slot.params;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    for (const key of keys) {
      if (params[key] === undefined && (existing as JsonObject)[key] !== undefined) {
        params[key] = (existing as JsonObject)[key];
      }
    }
  }

  if (Object.keys(params).length > 0) {
    out.params = params;
  }
  return out;
}

function normalizeSingletonRoleForEditing(
  strategy: JsonObject,
  catalog: ComponentCatalog,
  role: SingletonRole,
): JsonObject {
  const slot = strategy[role];
  if (!slot || typeof slot !== "object" || Array.isArray(slot)) {
    return strategy;
  }
  const slotObj = slot as JsonObject;
  const schema = findComponentSchema(catalog, String(slotObj.component_id ?? ""));
  const normalized = normalizeComponentSlotForEditing(slotObj, schema);
  if (normalized === slotObj) {
    return strategy;
  }
  return { ...strategy, [role]: normalized };
}

function normalizeSingletonRoleForApi(
  strategy: JsonObject,
  catalog: ComponentCatalog,
  role: SingletonRole,
): JsonObject {
  const slot = strategy[role];
  if (!slot || typeof slot !== "object" || Array.isArray(slot)) {
    return strategy;
  }
  const slotObj = slot as JsonObject;
  const schema = findComponentSchema(catalog, String(slotObj.component_id ?? ""));
  const normalized = normalizeComponentSlotForApi(slotObj, schema);
  if (normalized === slotObj) {
    return strategy;
  }
  return { ...strategy, [role]: normalized };
}

export function normalizeStrategyForEditing(
  strategy: JsonObject,
  catalog: ComponentCatalog,
): JsonObject {
  let next = strategy;
  for (const role of SINGLETON_ROLES) {
    next = normalizeSingletonRoleForEditing(next, catalog, role);
  }
  return next;
}

export function normalizeStrategySingletonsForApi(
  strategy: JsonObject,
  catalog: ComponentCatalog,
): JsonObject {
  let next = strategy;
  for (const role of SINGLETON_ROLES) {
    next = normalizeSingletonRoleForApi(next, catalog, role);
  }
  return next;
}

export function normalizeConfigDraftForEditing(
  draft: StrategyConfigDraft,
  catalog: ComponentCatalog,
): StrategyConfigDraft {
  return {
    ...draft,
    instances: draft.instances.map((inst) => ({
      ...inst,
      strategy: normalizeStrategyForEditing(inst.strategy, catalog),
    })),
  };
}

export function draftsEqualForEditing(a: StrategyConfigDraft, b: StrategyConfigDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
