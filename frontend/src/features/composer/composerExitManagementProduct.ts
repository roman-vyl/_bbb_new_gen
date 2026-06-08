import type { JsonObject } from "@/api/types";

/** Legacy managed-combiner components — compatibility-only; not Composer authoring targets. */
export const DEPRECATED_EXIT_MANAGEMENT_AUTHORING_IDS = ["break_even_stop"] as const;

/** Product-facing exit_management contract (authoring target; editor UI deferred). */
export const EXIT_MANAGEMENT_PRODUCT_CONTRACT: JsonObject = {
  mode: "diagnostic_only",
  phase_rules: [],
  stop_management: [],
  runtime_exits: [],
};

export function createBlankExitManagement(): JsonObject {
  return structuredClone(EXIT_MANAGEMENT_PRODUCT_CONTRACT);
}

/** Product contract only — no legacy always_on/profiles keys. */
export function createProductExitManagement(phaseRules: JsonObject[] = []): JsonObject {
  return {
    mode: "diagnostic_only",
    phase_rules: structuredClone(phaseRules),
    stop_management: [],
    runtime_exits: [],
  };
}

function legacyRulesFromGroup(group: unknown): JsonObject[] {
  if (!group || typeof group !== "object") {
    return [];
  }
  const rules = (group as JsonObject).rules;
  return Array.isArray(rules) ? (rules as JsonObject[]) : [];
}

/** Count legacy `always_on/profiles.rules` slots (deprecated combiner shape). */
export function countLegacyExitManagementRules(exitManagement: JsonObject): number {
  const alwaysOn = legacyRulesFromGroup(exitManagement.always_on);
  const profiles = (exitManagement.profiles as JsonObject | undefined) ?? {};
  const profileRules = (["aligned", "countertrend", "neutral"] as const).flatMap((key) =>
    legacyRulesFromGroup(profiles[key]),
  );
  return alwaysOn.length + profileRules.length;
}

export function hasLegacyExitManagementRules(exitManagement: JsonObject): boolean {
  return countLegacyExitManagementRules(exitManagement) > 0;
}

export function summarizeExitManagementProduct(exitManagement: JsonObject): {
  mode: string;
  phaseRulesCount: number;
  stopManagementCount: number;
  runtimeExitsCount: number;
  legacyRulesCount: number;
} {
  const phaseRules = exitManagement.phase_rules;
  const stopManagement = exitManagement.stop_management;
  const runtimeExits = exitManagement.runtime_exits;
  return {
    mode: typeof exitManagement.mode === "string" ? exitManagement.mode : "—",
    phaseRulesCount: Array.isArray(phaseRules) ? phaseRules.length : 0,
    stopManagementCount: Array.isArray(stopManagement) ? stopManagement.length : 0,
    runtimeExitsCount: Array.isArray(runtimeExits) ? runtimeExits.length : 0,
    legacyRulesCount: countLegacyExitManagementRules(exitManagement),
  };
}
