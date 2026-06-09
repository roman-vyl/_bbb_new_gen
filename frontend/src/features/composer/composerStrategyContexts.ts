import type { ComponentCatalog, JsonObject, ValidationErrorItem } from "@/api/types";

import { normalizeStrategySingletonsForApi } from "./composerComponentSlots";
import { collectExitManagementProductValidationErrors } from "./composerPhaseRulesEditor";

export type ContextProviderDraft = JsonObject & {
  component_id: string;
  timeframe?: string;
  source?: string;
  fast_period?: number;
  anchor_period?: number;
  slow_period?: number;
};

export type ContextConsumptionDraft = {
  context_ref: string;
  policy: {
    policy_id: string;
    params?: JsonObject;
  };
};

const DEFAULT_HTF_PROVIDER: ContextProviderDraft = {
  component_id: "htf_context",
  timeframe: "4h",
  source: "close",
  fast_period: 100,
  anchor_period: 200,
  slow_period: 1000,
};

export function readStrategyContexts(strategy: JsonObject): Record<string, ContextProviderDraft> {
  const raw = strategy.contexts;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  return raw as Record<string, ContextProviderDraft>;
}

export function writeStrategyContexts(
  strategy: JsonObject,
  contexts: Record<string, ContextProviderDraft>,
): JsonObject {
  const keys = Object.keys(contexts);
  if (keys.length === 0) {
    const { contexts: _removed, ...rest } = strategy;
    return rest;
  }
  return { ...strategy, contexts };
}

export function readExitPolicy(strategy: JsonObject): JsonObject {
  const tradeManagement = (strategy.trade_management as JsonObject | undefined) ?? {};
  return ((tradeManagement.exit_policy as JsonObject | undefined) ?? {}) as JsonObject;
}

export function readExitPolicyContextConsumption(
  strategy: JsonObject,
): ContextConsumptionDraft | null {
  const consumption = readExitPolicy(strategy).context_consumption;
  if (!consumption || typeof consumption !== "object" || Array.isArray(consumption)) {
    return null;
  }
  const block = consumption as JsonObject;
  const policy = block.policy;
  if (!block.context_ref || typeof block.context_ref !== "string") {
    return null;
  }
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    return {
      context_ref: block.context_ref,
      policy: { policy_id: "", params: {} },
    };
  }
  const policyObj = policy as JsonObject;
  const policyId =
    policyObj.policy_id && typeof policyObj.policy_id === "string" ? policyObj.policy_id : "";
  return {
    context_ref: block.context_ref,
    policy: {
      policy_id: policyId,
      params: (policyObj.params as JsonObject | undefined) ?? {},
    },
  };
}

export function writeExitPolicyContextConsumption(
  strategy: JsonObject,
  consumption: ContextConsumptionDraft | null,
): JsonObject {
  const tradeManagement = (strategy.trade_management as JsonObject | undefined) ?? {};
  const exitPolicy = readExitPolicy(strategy);
  const nextExitPolicy: JsonObject = { ...exitPolicy };
  if (consumption) {
    nextExitPolicy.context_consumption = {
      context_ref: consumption.context_ref,
      policy: {
        policy_id: consumption.policy.policy_id,
        ...(Object.keys(consumption.policy.params ?? {}).length > 0
          ? { params: consumption.policy.params }
          : {}),
      },
    };
  } else {
    delete nextExitPolicy.context_consumption;
  }
  return {
    ...strategy,
    trade_management: {
      ...tradeManagement,
      exit_policy: nextExitPolicy,
    },
  };
}

export function profileExitCount(strategy: JsonObject): number {
  const exitPolicy = readExitPolicy(strategy);
  const profiles = (exitPolicy.profiles as JsonObject | undefined) ?? {};
  return (["aligned", "countertrend", "neutral"] as const).reduce((sum, key) => {
    const group = (profiles[key] as JsonObject | undefined) ?? {};
    const exits = (group.exits as JsonObject[] | undefined) ?? [];
    return sum + exits.length;
  }, 0);
}

export function exitPolicyRequiresContextConsumption(strategy: JsonObject): boolean {
  return profileExitCount(strategy) > 0;
}

/** Omit optional exit_policy.context_consumption when profile exits are empty (target shape). */
export function normalizeStrategyForTargetShape(strategy: JsonObject): JsonObject {
  if (exitPolicyRequiresContextConsumption(strategy)) {
    return strategy;
  }
  return writeExitPolicyContextConsumption(strategy, null);
}

export function defaultHtfProvider(catalog: ComponentCatalog | null): ContextProviderDraft {
  const schema = catalog?.context_providers?.find((p) => p.component_id === "htf_context");
  if (!schema?.params_schema) {
    return { ...DEFAULT_HTF_PROVIDER };
  }
  let out: ContextProviderDraft = { component_id: "htf_context" };
  for (const [key, field] of Object.entries(schema.params_schema)) {
    if (field.default !== undefined) {
      out = { ...out, [key]: field.default as number | string };
    }
  }
  return out;
}

export function contextRefOptions(contexts: Record<string, ContextProviderDraft>): string[] {
  return Object.keys(contexts).sort();
}

/** Safe default key: htf_1, htf_2, … (no collision with existing refs). */
export function generateUniqueContextRef(
  contexts: Record<string, ContextProviderDraft>,
): string {
  let n = 1;
  while (`htf_${n}` in contexts) {
    n += 1;
  }
  return `htf_${n}`;
}

export function addStrategyContext(
  contexts: Record<string, ContextProviderDraft>,
  catalog: ComponentCatalog | null,
  preferredRef?: string,
): { contexts: Record<string, ContextProviderDraft>; ref: string } {
  const trimmed = preferredRef?.trim();
  const ref =
    trimmed && !(trimmed in contexts) ? trimmed : generateUniqueContextRef(contexts);
  return {
    ref,
    contexts: { ...contexts, [ref]: defaultHtfProvider(catalog) },
  };
}

/** Rename provider key only; consumers keep old ref until user fixes (validation surfaces errors). */
export function renameStrategyContext(
  contexts: Record<string, ContextProviderDraft>,
  oldRef: string,
  newRef: string,
): Record<string, ContextProviderDraft> | null {
  const trimmed = newRef.trim();
  if (!trimmed || trimmed === oldRef) {
    return contexts;
  }
  if (trimmed in contexts) {
    return null;
  }
  const provider = contexts[oldRef];
  if (!provider) {
    return contexts;
  }
  const next = { ...contexts };
  delete next[oldRef];
  next[trimmed] = provider;
  return next;
}

function readContextConsumptionRef(block: unknown): string | null {
  if (!block || typeof block !== "object" || Array.isArray(block)) {
    return null;
  }
  const ref = (block as JsonObject).context_ref;
  return typeof ref === "string" ? ref : null;
}

export const HTF_REGIME_GATE_POLICY_ID = "htf_regime_gate";

function readContextConsumptionBlock(block: unknown): JsonObject | null {
  if (!block || typeof block !== "object" || Array.isArray(block)) {
    return null;
  }
  return block as JsonObject;
}

function readPolicyFromConsumption(block: JsonObject): { policyId: string; params: JsonObject } {
  const policyRaw = block.policy;
  if (!policyRaw || typeof policyRaw !== "object" || Array.isArray(policyRaw)) {
    return { policyId: "", params: {} };
  }
  const policyObj = policyRaw as JsonObject;
  const policyId =
    typeof policyObj.policy_id === "string" ? policyObj.policy_id.trim() : "";
  const paramsRaw = policyObj.params;
  const params =
    paramsRaw && typeof paramsRaw === "object" && !Array.isArray(paramsRaw)
      ? (paramsRaw as JsonObject)
      : {};
  return { policyId, params };
}

export function collectContextConsumptionPolicyParamErrors(
  policyId: string,
  params: JsonObject,
  pathPrefix: string,
): ValidationErrorItem[] {
  if (policyId === HTF_REGIME_GATE_POLICY_ID) {
    const raw = params.allowed_regimes;
    if (!Array.isArray(raw) || raw.length === 0) {
      return [
        {
          path: `${pathPrefix}.policy.params.allowed_regimes`,
          message: "allowed_regimes is required and must be a non-empty list for htf_regime_gate",
        },
      ];
    }
  }
  return [];
}

const UNSUPPORTED_POLICY_ID_MESSAGE =
  "context_consumption.policy.policy_id is not supported for this component";

export function entryContextConsumptionPolicyIds(
  catalog: ComponentCatalog | null,
  role: string,
  componentId: string,
): string[] | null {
  if (!catalog || !componentId) {
    return null;
  }
  const component = catalog.components.find(
    (c) => c.role === role && c.component_id === componentId,
  );
  if (component?.supports_context_consumption !== true) {
    return null;
  }
  return (component.context_consumption_policies ?? []).map((policy) => policy.policy_id);
}

export function exitContextConsumptionPolicyIds(catalog: ComponentCatalog | null): string[] {
  return exitPolicyPolicies(catalog).map((policy) => policy.policy_id);
}

export function collectEntryContextConsumptionErrors(
  strategy: JsonObject,
  pathPrefix: string,
  catalog: ComponentCatalog | null = null,
): ValidationErrorItem[] {
  const errors: ValidationErrorItem[] = [];

  const checkSlot = (
    slot: JsonObject,
    slotPath: string,
    role: string,
    componentId: string,
  ) => {
    const consumption = readContextConsumptionBlock(slot.context_consumption);
    if (!consumption) {
      return;
    }
    const contextRef = readContextConsumptionRef(consumption);
    if (!contextRef?.trim()) {
      errors.push({
        path: `${slotPath}.context_ref`,
        message: "context_ref is required when context consumption is enabled",
      });
    }
    const { policyId, params } = readPolicyFromConsumption(consumption);
    if (!policyId) {
      errors.push({
        path: `${slotPath}.policy.policy_id`,
        message: "policy_id is required when context consumption is enabled",
      });
    } else if (catalog) {
      const allowedPolicyIds = entryContextConsumptionPolicyIds(catalog, role, componentId);
      if (allowedPolicyIds !== null && !allowedPolicyIds.includes(policyId)) {
        errors.push({
          path: `${slotPath}.policy.policy_id`,
          message: UNSUPPORTED_POLICY_ID_MESSAGE,
        });
      }
    }
    errors.push(...collectContextConsumptionPolicyParamErrors(policyId, params, slotPath));
  };

  for (const role of ["direction", "trigger"] as const) {
    const slot = strategy[role];
    if (!slot || typeof slot !== "object" || Array.isArray(slot)) {
      continue;
    }
    const slotObj = slot as JsonObject;
    checkSlot(
      slotObj,
      `${pathPrefix}.${role}.context_consumption`,
      role,
      String(slotObj.component_id ?? ""),
    );
  }

  const setups = (strategy.setups as JsonObject[] | undefined) ?? [];
  setups.forEach((slot, index) => {
    checkSlot(
      slot,
      `${pathPrefix}.setups[${index}].context_consumption`,
      "setup",
      String(slot.component_id ?? ""),
    );
  });

  // Legacy singleton path support in draft state (should be migrated by normalizer).
  const legacySetup = strategy.setup;
  if (legacySetup && typeof legacySetup === "object" && !Array.isArray(legacySetup)) {
    const slotObj = legacySetup as JsonObject;
    checkSlot(
      slotObj,
      `${pathPrefix}.setup.context_consumption`,
      "setup",
      String(slotObj.component_id ?? ""),
    );
  }

  const blockers = (strategy.blockers as JsonObject[] | undefined) ?? [];
  blockers.forEach((slot, index) => {
    checkSlot(
      slot,
      `${pathPrefix}.blockers[${index}].context_consumption`,
      "blockers",
      String(slot.component_id ?? ""),
    );
  });

  return errors;
}

export function collectUndefinedConsumerContextRefErrors(
  strategy: JsonObject,
  pathPrefix: string,
): ValidationErrorItem[] {
  const contexts = readStrategyContexts(strategy);
  const errors: ValidationErrorItem[] = [];

  const check = (ref: string | null | undefined, path: string) => {
    const trimmed = ref?.trim();
    if (trimmed && !(trimmed in contexts)) {
      errors.push({
        path,
        message: `context_ref "${trimmed}" is not defined in strategy.contexts`,
      });
    }
  };

  const exitConsumption = readExitPolicy(strategy).context_consumption;
  check(
    readContextConsumptionRef(exitConsumption),
    `${pathPrefix}.trade_management.exit_policy.context_consumption.context_ref`,
  );

  for (const role of ["direction", "trigger"] as const) {
    const slot = strategy[role];
    if (!slot || typeof slot !== "object" || Array.isArray(slot)) {
      continue;
    }
    check(
      readContextConsumptionRef((slot as JsonObject).context_consumption),
      `${pathPrefix}.${role}.context_consumption.context_ref`,
    );
  }

  const setups = (strategy.setups as JsonObject[] | undefined) ?? [];
  setups.forEach((slot, index) => {
    check(
      readContextConsumptionRef(slot.context_consumption),
      `${pathPrefix}.setups[${index}].context_consumption.context_ref`,
    );
  });

  const legacySetup = strategy.setup;
  if (legacySetup && typeof legacySetup === "object" && !Array.isArray(legacySetup)) {
    check(
      readContextConsumptionRef((legacySetup as JsonObject).context_consumption),
      `${pathPrefix}.setup.context_consumption.context_ref`,
    );
  }

  const blockers = (strategy.blockers as JsonObject[] | undefined) ?? [];
  blockers.forEach((slot, index) => {
    check(
      readContextConsumptionRef(slot.context_consumption),
      `${pathPrefix}.blockers[${index}].context_consumption.context_ref`,
    );
  });

  return errors;
}

export function exitPolicyPolicies(catalog: ComponentCatalog | null) {
  return catalog?.context_consumption_roles?.find((r) => r.role === "exit_policy")?.policies ?? [];
}

export function prepareStrategyForApi(
  strategy: JsonObject,
  catalog: ComponentCatalog | null = null,
): JsonObject {
  let next = normalizeStrategyForTargetShape(strategy);
  if (catalog) {
    next = normalizeStrategySingletonsForApi(next, catalog);
  }
  const contexts = readStrategyContexts(next);
  if (Object.keys(contexts).length === 0) {
    const { contexts: _removed, ...rest } = next;
    next = rest;
  } else {
    next = writeStrategyContexts(next, contexts);
  }
  return next;
}

export function prepareConfigDraftForApi<T extends { instances: { strategy: JsonObject }[] }>(
  draft: T,
  catalog: ComponentCatalog | null = null,
): T {
  return {
    ...draft,
    instances: draft.instances.map((inst) => ({
      ...inst,
      strategy: prepareStrategyForApi(inst.strategy, catalog),
    })),
  };
}

export function supportsEntryContextConsumption(
  catalog: ComponentCatalog | null,
  role: string,
  componentId: string,
): boolean {
  const component = catalog?.components.find(
    (c) => c.role === role && c.component_id === componentId,
  );
  return component?.supports_context_consumption === true;
}

export function collectUnsupportedEntryContextConsumptionErrors(
  strategy: JsonObject,
  pathPrefix: string,
  catalog: ComponentCatalog | null,
): ValidationErrorItem[] {
  if (!catalog) {
    return [];
  }
  const errors: ValidationErrorItem[] = [];
  for (const role of ["direction", "trigger"] as const) {
    const block = strategy[role];
    if (!block || typeof block !== "object" || Array.isArray(block)) {
      continue;
    }
    const slot = block as JsonObject;
    const componentId = String(slot.component_id ?? "");
    if (
      slot.context_consumption &&
      !supportsEntryContextConsumption(catalog, role, componentId)
    ) {
      errors.push({
        path: `${pathPrefix}.${role}.context_consumption`,
        message: `context_consumption is not supported for ${role} component ${componentId}`,
      });
    }
  }

  const setups = (strategy.setups as JsonObject[] | undefined) ?? [];
  setups.forEach((slot, index) => {
    const componentId = String(slot.component_id ?? "");
    if (
      slot.context_consumption &&
      !supportsEntryContextConsumption(catalog, "setup", componentId)
    ) {
      errors.push({
        path: `${pathPrefix}.setups[${index}].context_consumption`,
        message: `context_consumption is not supported for setup component ${componentId}`,
      });
    }
  });

  const legacySetup = strategy.setup;
  if (legacySetup && typeof legacySetup === "object" && !Array.isArray(legacySetup)) {
    const slot = legacySetup as JsonObject;
    const componentId = String(slot.component_id ?? "");
    if (
      slot.context_consumption &&
      !supportsEntryContextConsumption(catalog, "setup", componentId)
    ) {
      errors.push({
        path: `${pathPrefix}.setup.context_consumption`,
        message: `context_consumption is not supported for setup component ${componentId}`,
      });
    }
  }
  const blockers = (strategy.blockers as JsonObject[] | undefined) ?? [];
  blockers.forEach((slot, index) => {
    const componentId = String(slot.component_id ?? "");
    if (
      slot.context_consumption &&
      !supportsEntryContextConsumption(catalog, "blockers", componentId)
    ) {
      errors.push({
        path: `${pathPrefix}.blockers[${index}].context_consumption`,
        message: `context_consumption is not supported for blockers component ${componentId}`,
      });
    }
  });
  return errors;
}

export function collectComposerStrategyErrors(
  strategy: JsonObject,
  pathPrefix: string,
  catalog: ComponentCatalog | null = null,
): ValidationErrorItem[] {
  const errors: ValidationErrorItem[] = [];
  const exitPolicy = readExitPolicy(strategy);
  if ("context" in exitPolicy) {
    errors.push({
      path: `${pathPrefix}.trade_management.exit_policy.context`,
      message: "exit_policy.context is no longer supported; use strategy.contexts",
    });
  }
  errors.push(...collectUnsupportedEntryContextConsumptionErrors(strategy, pathPrefix, catalog));
  errors.push(...collectEntryContextConsumptionErrors(strategy, pathPrefix, catalog));
  const exitConsumptionPath = `${pathPrefix}.trade_management.exit_policy.context_consumption`;
  const exitConsumption = readExitPolicyContextConsumption(strategy);
  if (exitConsumption?.policy?.policy_id?.trim() && catalog) {
    const exitPolicyId = exitConsumption.policy.policy_id.trim();
    const allowedExitPolicies = exitContextConsumptionPolicyIds(catalog);
    if (!allowedExitPolicies.includes(exitPolicyId)) {
      errors.push({
        path: `${exitConsumptionPath}.policy.policy_id`,
        message: UNSUPPORTED_POLICY_ID_MESSAGE,
      });
    }
  }
  errors.push(...collectExitManagementProductValidationErrors(strategy, pathPrefix, catalog));
  if (!exitPolicyRequiresContextConsumption(strategy)) {
    return errors;
  }
  if (!exitConsumption?.context_ref?.trim()) {
    errors.push({
      path: `${exitConsumptionPath}.context_ref`,
      message: "context_ref is required when profile-scoped exits are configured",
    });
  }
  if (!exitConsumption?.policy?.policy_id?.trim()) {
    errors.push({
      path: `${exitConsumptionPath}.policy.policy_id`,
      message: "policy_id is required when profile-scoped exits are configured",
    });
  }
  if (exitConsumption?.policy?.policy_id?.trim()) {
    errors.push(
      ...collectContextConsumptionPolicyParamErrors(
        exitConsumption.policy.policy_id.trim(),
        exitConsumption.policy.params ?? {},
        exitConsumptionPath,
      ),
    );
  }
  errors.push(...collectUndefinedConsumerContextRefErrors(strategy, pathPrefix));
  return errors;
}

export function collectComposerDraftErrors(
  draft: { instances: { strategy: JsonObject }[] },
  catalog: ComponentCatalog | null = null,
): ValidationErrorItem[] {
  const errors: ValidationErrorItem[] = [];
  draft.instances.forEach((inst, index) => {
    errors.push(
      ...collectComposerStrategyErrors(inst.strategy, `instances[${index}].strategy`, catalog),
    );
  });
  return errors;
}
