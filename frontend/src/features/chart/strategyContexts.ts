import type { JsonObject } from "@/api/types";
import { readExitPolicy } from "@/features/chart/exitPolicyForTrade";

function asProvider(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as JsonObject;
}

/**
 * Normalize strategy.contexts from report / composer shapes:
 * - target: { htf_1: { component_id, ... } }
 * - legacy report: [["htf_1", { ... }], ...] (dataclasses.asdict tuple)
 * - legacy exit_policy.context only → synthetic { htf: provider } for chart read
 */
export function readStrategyContextsMap(strategySpec: JsonObject): Record<string, JsonObject> {
  const raw = strategySpec.contexts;
  const out: Record<string, JsonObject> = {};

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const provider = asProvider(value);
      if (provider) {
        out[key] = provider;
      }
    }
    if (Object.keys(out).length > 0) {
      return out;
    }
  }

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!Array.isArray(item) || item.length !== 2) {
        continue;
      }
      const ref = String(item[0] ?? "").trim();
      const provider = asProvider(item[1]);
      if (ref && provider) {
        out[ref] = provider;
      }
    }
    if (Object.keys(out).length > 0) {
      return out;
    }
  }

  const exitPolicy = readExitPolicy(strategySpec);
  const legacy = exitPolicy?.context;
  const legacyProvider = asProvider(legacy);
  if (legacyProvider) {
    return { htf: legacyProvider };
  }

  return {};
}

export function strategyContextRefOptions(strategySpec: JsonObject): string[] {
  return Object.keys(readStrategyContextsMap(strategySpec)).sort();
}

export function readContextProvider(
  strategySpec: JsonObject,
  contextRef: string,
): JsonObject | null {
  return readStrategyContextsMap(strategySpec)[contextRef] ?? null;
}

/**
 * Chart overlay default: exit_policy consumption ref, or sole context ref.
 * Does not pick arbitrary first key when multiple contexts exist (OpenSpec).
 */
export function defaultChartContextOverlayRef(strategySpec: JsonObject): string | null {
  const contexts = readStrategyContextsMap(strategySpec);
  const refs = Object.keys(contexts).sort();
  if (refs.length === 0) {
    return null;
  }

  const exitPolicy = readExitPolicy(strategySpec);
  const consumption = exitPolicy?.context_consumption;
  if (consumption && typeof consumption === "object" && !Array.isArray(consumption)) {
    const ref = (consumption as JsonObject).context_ref;
    if (typeof ref === "string") {
      const trimmed = ref.trim();
      if (trimmed && trimmed in contexts) {
        return trimmed;
      }
    }
  }

  if (refs.length === 1) {
    return refs[0]!;
  }

  return null;
}
