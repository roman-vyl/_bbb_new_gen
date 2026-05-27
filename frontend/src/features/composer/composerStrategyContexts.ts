import type { ComponentCatalog, JsonObject, ValidationErrorItem } from "@/api/types";

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
  const { context: _legacy, context_consumption: _old, ...exitRest } = exitPolicy;
  const nextExitPolicy: JsonObject = { ...exitRest };
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

export function normalizeStrategyForTargetShape(strategy: JsonObject): JsonObject {
  let next = { ...strategy };
  const exitPolicy = readExitPolicy(next);
  if ("context" in exitPolicy) {
    const { context: _legacy, ...rest } = exitPolicy;
    next = writeExitPolicyFromParts(next, rest);
  }
  if (exitPolicyRequiresContextConsumption(next)) {
    return next;
  }
  return writeExitPolicyContextConsumption(next, null);
}

function writeExitPolicyFromParts(strategy: JsonObject, exitPolicy: JsonObject): JsonObject {
  const tradeManagement = (strategy.trade_management as JsonObject | undefined) ?? {};
  return {
    ...strategy,
    trade_management: {
      ...tradeManagement,
      exit_policy: exitPolicy,
    },
  };
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

export function exitPolicyPolicies(catalog: ComponentCatalog | null) {
  return catalog?.context_consumption_roles?.find((r) => r.role === "exit_policy")?.policies ?? [];
}

export function stripUnsupportedEntryContextConsumption(
  strategy: JsonObject,
  catalog: ComponentCatalog | null,
): JsonObject {
  if (!catalog) {
    return strategy;
  }
  let next = { ...strategy };
  for (const role of ["direction", "setup", "trigger"] as const) {
    const block = next[role];
    if (!block || typeof block !== "object" || Array.isArray(block)) {
      continue;
    }
    const slot = block as JsonObject;
    const componentId = String(slot.component_id ?? "");
    if (
      slot.context_consumption &&
      !supportsEntryContextConsumption(catalog, role, componentId)
    ) {
      const { context_consumption: _removed, ...rest } = slot;
      next = { ...next, [role]: rest };
    }
  }
  const blockers = (next.blockers as JsonObject[] | undefined) ?? [];
  if (blockers.length > 0) {
    next = {
      ...next,
      blockers: blockers.map((slot) => {
        const componentId = String(slot.component_id ?? "");
        if (
          slot.context_consumption &&
          !supportsEntryContextConsumption(catalog, "blockers", componentId)
        ) {
          const { context_consumption: _removed, ...rest } = slot;
          return rest;
        }
        return slot;
      }),
    };
  }
  return next;
}

export function prepareStrategyForApi(strategy: JsonObject): JsonObject {
  let next = normalizeStrategyForTargetShape(strategy);
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
    instances: draft.instances.map((inst) => {
      let strategy = prepareStrategyForApi(inst.strategy);
      if (catalog) {
        strategy = stripUnsupportedEntryContextConsumption(strategy, catalog);
      }
      return { ...inst, strategy };
    }),
  };
}

export function collectComposerStrategyErrors(
  strategy: JsonObject,
  pathPrefix: string,
): ValidationErrorItem[] {
  const errors: ValidationErrorItem[] = [];
  const exitPolicy = readExitPolicy(strategy);
  if ("context" in exitPolicy) {
    errors.push({
      path: `${pathPrefix}.trade_management.exit_policy.context`,
      message: "exit_policy.context is no longer supported; use strategy.contexts",
    });
  }
  if (!exitPolicyRequiresContextConsumption(strategy)) {
    return errors;
  }
  const consumption = readExitPolicyContextConsumption(strategy);
  if (!consumption?.context_ref?.trim()) {
    errors.push({
      path: `${pathPrefix}.trade_management.exit_policy.context_consumption.context_ref`,
      message: "context_ref is required when profile-scoped exits are configured",
    });
  }
  if (!consumption?.policy?.policy_id?.trim()) {
    errors.push({
      path: `${pathPrefix}.trade_management.exit_policy.context_consumption.policy.policy_id`,
      message: "policy_id is required when profile-scoped exits are configured",
    });
  }
  const contexts = readStrategyContexts(strategy);
  const ref = consumption?.context_ref?.trim();
  if (ref && !(ref in contexts)) {
    errors.push({
      path: `${pathPrefix}.trade_management.exit_policy.context_consumption.context_ref`,
      message: `context_ref "${ref}" is not defined in strategy.contexts`,
    });
  }
  return errors;
}

export function collectComposerDraftErrors(
  draft: { instances: { strategy: JsonObject }[] },
): ValidationErrorItem[] {
  const errors: ValidationErrorItem[] = [];
  draft.instances.forEach((inst, index) => {
    errors.push(...collectComposerStrategyErrors(inst.strategy, `instances[${index}].strategy`));
  });
  return errors;
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
