import { describe, expect, it } from "vitest";

import type { JsonObject } from "@/api/types";
import managedSmoke from "../../../../research/experiments/specs/smoke/exit_management_managed_smoke.json";
import {
  exitManagementHasLegacyKeys,
  normalizeExitManagementV2,
} from "@/features/composer/composerExitManagementProduct";
import {
  collectManagedRulesValidationErrors,
  readManagementRules,
  writeExitManagementMode,
  writeManagementRules,
} from "@/features/composer/composerManagedExitManagement";
import {
  collectExitManagementProductValidationErrors,
  writeExitManagementOnStrategy,
} from "@/features/composer/composerPhaseRulesEditor";
import { prepareStrategyForApi } from "@/features/composer/composerStrategyContexts";
import { RUNTIME_EXIT_CATALOG_STUB } from "@/features/composer/testFixtures/runtimeExitCatalogStub";

const PATH = "instances[0].strategy";

function smokeExitManagement(): JsonObject {
  const strategy = (managedSmoke.instances[0] as JsonObject).strategy as JsonObject;
  const tm = strategy.trade_management as JsonObject;
  return structuredClone(tm.exit_management as JsonObject);
}

describe("composer managed exit_management (Slice 10)", () => {
  it("normalizeExitManagementV2 round-trips smoke fixture without legacy keys", () => {
    const em = smokeExitManagement();
    const normalized = normalizeExitManagementV2(em);
    expect(normalized).toEqual(em);
    expect(exitManagementHasLegacyKeys(normalized)).toBe(false);
    expect(normalized.always_on).toBeUndefined();
    expect(normalized.profiles).toBeUndefined();
    expect(JSON.stringify(normalized)).not.toMatch(/trigger_r|offset_r|apply_once/);
  });

  it("writeExitManagementOnStrategy preserves all managed arrays for save/load", () => {
    const em = smokeExitManagement();
    const strategy = { trade_management: { exit_management: em } };
    const next = writeExitManagementOnStrategy(strategy, em);
    const saved = (next.trade_management as JsonObject).exit_management as JsonObject;
    expect(saved.mode).toBe("managed");
    expect(saved.phase_rules).toEqual(em.phase_rules);
    expect(saved.stop_management).toEqual(em.stop_management);
    expect(saved.take_management).toEqual(em.take_management);
    expect(saved.runtime_exits).toEqual(em.runtime_exits);
    expect(saved.always_on).toBeUndefined();
    expect(saved.profiles).toBeUndefined();
  });

  it("prepareStrategyForApi serializes v2 shape only for managed config", () => {
    const em = smokeExitManagement();
    const strategy = writeExitManagementOnStrategy(
      (managedSmoke.instances[0] as JsonObject).strategy as JsonObject,
      em,
    );
    const prepared = prepareStrategyForApi(strategy);
    const preparedEm = ((prepared.trade_management as JsonObject).exit_management as JsonObject);
    expect(preparedEm.mode).toBe("managed");
    expect(readManagementRules(preparedEm, "stop_management")).toHaveLength(2);
    expect(readManagementRules(preparedEm, "take_management")).toHaveLength(1);
    expect(readManagementRules(preparedEm, "runtime_exits")).toHaveLength(1);
    expect(JSON.stringify(preparedEm)).not.toContain("always_on");
    expect(JSON.stringify(preparedEm)).not.toMatch(/trigger_r|offset_r/);
  });

  it("managed smoke validates with zero product errors", () => {
    const strategy = (managedSmoke.instances[0] as JsonObject).strategy as JsonObject;
    const errors = collectExitManagementProductValidationErrors(
      strategy,
      PATH,
      RUNTIME_EXIT_CATALOG_STUB,
    );
    expect(errors).toEqual([]);
  });

  it("diagnostic_only rejects non-empty management arrays in draft validation", () => {
    const em = {
      mode: "diagnostic_only",
      phase_rules: [],
      stop_management: [{ rule_id: "x", component_id: "break_even_stop" }],
      take_management: [],
      runtime_exits: [],
    };
    const errors = collectManagedRulesValidationErrors(em, PATH);
    expect(errors.some((e) => e.path.endsWith(".stop_management"))).toBe(true);
  });

  it("normalizeExitManagementV2 strips management arrays for diagnostic_only", () => {
    const em = normalizeExitManagementV2({
      mode: "diagnostic_only",
      phase_rules: [],
      stop_management: [{ rule_id: "x", component_id: "break_even_stop" }],
      take_management: [{ rule_id: "y", component_id: "take_profile_switch" }],
      runtime_exits: [{ rule_id: "z", component_id: "phase_runtime_exit" }],
    });
    expect(em.stop_management).toEqual([]);
    expect(em.take_management).toEqual([]);
    expect(em.runtime_exits).toEqual([]);
  });

  it("switching to diagnostic_only clears management arrays", () => {
    const em = smokeExitManagement();
    const next = writeExitManagementMode(em, "diagnostic_only");
    expect(next.mode).toBe("diagnostic_only");
    expect(next.stop_management).toEqual([]);
    expect(next.take_management).toEqual([]);
    expect(next.runtime_exits).toEqual([]);
    expect(next.phase_rules).toEqual(em.phase_rules);
  });

  it("writeManagementRules updates one layer without dropping others", () => {
    const em = smokeExitManagement();
    const stopRules = readManagementRules(em, "stop_management");
    const trimmed = stopRules.slice(0, 1);
    const next = writeManagementRules(em, "stop_management", trimmed);
    expect(readManagementRules(next, "stop_management")).toHaveLength(1);
    expect(readManagementRules(next, "take_management")).toHaveLength(1);
    expect(readManagementRules(next, "runtime_exits")).toHaveLength(1);
  });
});
