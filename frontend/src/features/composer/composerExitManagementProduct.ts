import type { JsonObject, ValidationErrorItem } from "@/api/types";

/** Legacy managed-combiner components — compatibility-only; not Composer authoring targets. */
export const DEPRECATED_EXIT_MANAGEMENT_AUTHORING_IDS = ["break_even_stop"] as const;

/** Product-facing exit_management v2 contract (Composer authoring target). */
export const EXIT_MANAGEMENT_PRODUCT_CONTRACT: JsonObject = {
  mode: "diagnostic_only",
  phase_rules: [],
  stop_management: [],
  take_management: [],
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
    take_management: [],
    runtime_exits: [],
  };
}

/** Strip legacy keys; emit v2 wire shape only. */
export function normalizeExitManagementV2(exitManagement: JsonObject): JsonObject {
  const mode = exitManagement.mode === "managed" ? "managed" : "diagnostic_only";
  const phaseRules = Array.isArray(exitManagement.phase_rules)
    ? structuredClone(exitManagement.phase_rules as JsonObject[])
    : [];
  const emptyLayers = {
    stop_management: [] as JsonObject[],
    take_management: [] as JsonObject[],
    runtime_exits: [] as JsonObject[],
  };
  if (mode !== "managed") {
    return { mode, phase_rules: phaseRules, ...emptyLayers };
  }
  return {
    mode,
    phase_rules: phaseRules,
    stop_management: Array.isArray(exitManagement.stop_management)
      ? structuredClone(exitManagement.stop_management as JsonObject[])
      : [],
    take_management: Array.isArray(exitManagement.take_management)
      ? structuredClone(exitManagement.take_management as JsonObject[])
      : [],
    runtime_exits: Array.isArray(exitManagement.runtime_exits)
      ? structuredClone(exitManagement.runtime_exits as JsonObject[])
      : [],
  };
}

export function exitManagementHasLegacyKeys(exitManagement: JsonObject): boolean {
  return (
    "always_on" in exitManagement ||
    "profiles" in exitManagement ||
    hasLegacyExitManagementRules(exitManagement)
  );
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

export const LEGACY_EXIT_MANAGEMENT_UNSUPPORTED_MESSAGE =
  "exit_management uses unsupported legacy always_on/profiles shape. Reset exit_management to v2 (mode, phase_rules, stop_management, take_management, runtime_exits) before save.";

export function collectLegacyExitManagementUnsupportedErrors(
  exitManagement: JsonObject,
  pathPrefix: string,
): ValidationErrorItem[] {
  if (!exitManagementHasLegacyKeys(exitManagement)) {
    return [];
  }
  return [
    {
      path: `${pathPrefix}.trade_management.exit_management`,
      message: LEGACY_EXIT_MANAGEMENT_UNSUPPORTED_MESSAGE,
    },
  ];
}

export function summarizeExitManagementProduct(exitManagement: JsonObject): {
  mode: string;
  phaseRulesCount: number;
  stopManagementCount: number;
  takeManagementCount: number;
  runtimeExitsCount: number;
  legacyRulesCount: number;
} {
  const phaseRules = exitManagement.phase_rules;
  const stopManagement = exitManagement.stop_management;
  const takeManagement = exitManagement.take_management;
  const runtimeExits = exitManagement.runtime_exits;
  return {
    mode: typeof exitManagement.mode === "string" ? exitManagement.mode : "—",
    phaseRulesCount: Array.isArray(phaseRules) ? phaseRules.length : 0,
    stopManagementCount: Array.isArray(stopManagement) ? stopManagement.length : 0,
    takeManagementCount: Array.isArray(takeManagement) ? takeManagement.length : 0,
    runtimeExitsCount: Array.isArray(runtimeExits) ? runtimeExits.length : 0,
    legacyRulesCount: countLegacyExitManagementRules(exitManagement),
  };
}
