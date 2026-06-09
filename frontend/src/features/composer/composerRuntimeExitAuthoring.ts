import type { ComponentCatalog, ComponentSchema, JsonObject } from "@/api/types";

import { componentsForAllowedRole } from "@/features/composer/composerDraft";

export const RUNTIME_EXIT_ROLE = "exit_management.runtime_exit" as const;

export const RUNTIME_EXIT_KINDS = ["take_profit", "protective_exit", "market_close"] as const;

export function runtimeExitComponents(catalog: ComponentCatalog): ComponentSchema[] {
  return componentsForAllowedRole(catalog, RUNTIME_EXIT_ROLE);
}

export function runtimeExitComponentIds(catalog: ComponentCatalog): string[] {
  return runtimeExitComponents(catalog).map((c) => c.component_id);
}

export function isRuntimeExitComponentId(
  componentId: string,
  catalog: ComponentCatalog | null | undefined,
): boolean {
  if (!catalog) {
    return false;
  }
  return runtimeExitComponentIds(catalog).includes(componentId);
}

export function defaultPhaseRuntimeExitParams(): JsonObject {
  return { exit_price: "close" };
}

export function defaultRsiRuntimeExitParams(): JsonObject {
  return {
    rsi: { timeframe: "base", period: 14 },
    long_exit_above: 90.0,
    short_exit_below: 10.0,
    confirm_bars: 1,
  };
}

export function defaultEmaCrossRuntimeExitParams(): JsonObject {
  return {
    fast_ema: { timeframe: "base", source: "close", period: 100 },
    slow_ema: { timeframe: "base", source: "close", period: 200 },
    confirm_bars: 1,
  };
}

export function defaultExitKindForRuntimeComponent(componentId: string): string {
  if (componentId === "rsi_signal_exit") {
    return "take_profit";
  }
  if (componentId === "ema_cross_loss_exit") {
    return "protective_exit";
  }
  return "market_close";
}

export function normalizeRuntimeExitRule(rule: JsonObject): JsonObject {
  const componentId = typeof rule.component_id === "string" ? rule.component_id : "";
  const exitKindRaw = rule.exit_kind;
  let exitKind =
    typeof exitKindRaw === "string" && exitKindRaw.trim()
      ? exitKindRaw
      : defaultExitKindForRuntimeComponent(componentId);
  if (componentId === "phase_runtime_exit") {
    exitKind = "market_close";
  }
  return {
    ...rule,
    role: RUNTIME_EXIT_ROLE,
    exit_kind: exitKind,
  };
}

export function normalizeRuntimeExitRules(rules: JsonObject[]): JsonObject[] {
  return rules.map((rule) => normalizeRuntimeExitRule(rule));
}
