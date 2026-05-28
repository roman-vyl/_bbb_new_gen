import type { JsonObject } from "@/api/types";

export function strategyContextRefOptions(strategySpec: JsonObject): string[] {
  const raw = strategySpec.contexts;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return [];
  }
  return Object.keys(raw as Record<string, unknown>).sort();
}

export function readContextProvider(
  strategySpec: JsonObject,
  contextRef: string,
): JsonObject | null {
  const raw = strategySpec.contexts;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const provider = (raw as Record<string, unknown>)[contextRef];
  if (!provider || typeof provider !== "object" || Array.isArray(provider)) {
    return null;
  }
  return provider as JsonObject;
}
