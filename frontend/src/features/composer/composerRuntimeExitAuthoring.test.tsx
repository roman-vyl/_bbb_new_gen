/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import runnerRsiEmaSmoke from "../../../../research/experiments/specs/smoke/exit_management_runner_rsi_ema_runtime_smoke_local.json";
import type { JsonObject } from "@/api/types";
import { componentsForAllowedRole } from "@/features/composer/composerDraft";
import { ExitManagementProductPanel } from "@/features/composer/ExitManagementProductPanel";
import {
  createBlankExitManagement,
  normalizeExitManagementV2,
} from "@/features/composer/composerExitManagementProduct";
import {
  collectManagedRulesValidationErrors,
  createBlankManagementRule,
  readManagementRules,
  runtimeExitComponentIds,
  writeExitManagementMode,
  writeManagementRules,
} from "@/features/composer/composerManagedExitManagement";
import { RUNTIME_EXIT_ROLE } from "@/features/composer/composerRuntimeExitAuthoring";
import {
  collectExitManagementProductValidationErrors,
  writeExitManagementOnStrategy,
} from "@/features/composer/composerPhaseRulesEditor";
import { prepareStrategyForApi } from "@/features/composer/composerStrategyContexts";
import { RUNTIME_EXIT_CATALOG_STUB } from "@/features/composer/testFixtures/runtimeExitCatalogStub";

const PATH = "instances[0].strategy";
const CATALOG = RUNTIME_EXIT_CATALOG_STUB;

function runnerSmokeExitManagement(): JsonObject {
  const strategy = (runnerRsiEmaSmoke.instances[0] as JsonObject).strategy as JsonObject;
  const tm = strategy.trade_management as JsonObject;
  return structuredClone(tm.exit_management as JsonObject);
}

afterEach(() => {
  cleanup();
});

describe("composer runtime_exits authoring (catalog-driven)", () => {
  it("runtime picker uses catalog allowed_roles exit_management.runtime_exit", () => {
    const ids = runtimeExitComponentIds(CATALOG);
    expect(ids).toEqual([
      "ema_cross_loss_exit",
      "phase_runtime_exit",
      "rsi_signal_exit",
    ]);
    expect(componentsForAllowedRole(CATALOG, RUNTIME_EXIT_ROLE)).toHaveLength(3);
    expect(ids).not.toContain("atr_stop_loss");
  });

  it("runner RSI + EMA smoke normalizes with role and exit_kind", () => {
    const em = runnerSmokeExitManagement();
    const normalized = normalizeExitManagementV2(em);
    const runtime = readManagementRules(normalized, "runtime_exits");
    expect(runtime).toHaveLength(2);
    for (const rule of runtime) {
      expect(rule.role).toBe(RUNTIME_EXIT_ROLE);
      expect(rule.exit_kind).toBeTruthy();
    }
  });

  it("runner smoke validates with catalog and zero product errors", () => {
    const strategy = (runnerRsiEmaSmoke.instances[0] as JsonObject).strategy as JsonObject;
    const tm = strategy.trade_management as JsonObject;
    const strategyWithNormalizedEm = {
      ...strategy,
      trade_management: {
        ...tm,
        exit_management: normalizeExitManagementV2(tm.exit_management as JsonObject),
      },
    };
    const errors = collectExitManagementProductValidationErrors(
      strategyWithNormalizedEm,
      PATH,
      CATALOG,
    );
    expect(errors).toEqual([]);
  });

  it("prepareStrategyForApi preserves runtime RSI/EMA params round-trip", () => {
    const strategy = (runnerRsiEmaSmoke.instances[0] as JsonObject).strategy as JsonObject;
    const tm = strategy.trade_management as JsonObject;
    const em = normalizeExitManagementV2(tm.exit_management as JsonObject);
    const next = writeExitManagementOnStrategy(strategy, em);
    const prepared = prepareStrategyForApi(next);
    const preparedEm = (prepared.trade_management as JsonObject).exit_management as JsonObject;
    const runtime = readManagementRules(preparedEm, "runtime_exits");
    expect(runtime).toHaveLength(2);
    const rsiRule = runtime.find((r) => r.component_id === "rsi_signal_exit");
    const emaRule = runtime.find((r) => r.component_id === "ema_cross_loss_exit");
    expect((rsiRule?.params as JsonObject).long_exit_above).toBe(90);
    expect((emaRule?.params as JsonObject).fast_ema).toMatchObject({ period: 100 });
    expect(emaRule?.role).toBe(RUNTIME_EXIT_ROLE);
  });

  it("rejects exit_kind signal on runtime_exits", () => {
    const em = writeExitManagementMode(createBlankExitManagement(), "managed");
    const rule = createBlankManagementRule("runtime_exits", 0, "rsi_signal_exit");
    const withSignal = writeManagementRules(em, "runtime_exits", [
      { ...rule, exit_kind: "signal" },
    ]);
    const errors = collectManagedRulesValidationErrors(withSignal, PATH, CATALOG);
    expect(errors.some((e) => e.path.endsWith(".exit_kind") && e.message.includes("signal"))).toBe(
      true,
    );
  });

  it("rejects atr_stop_loss when catalog disallows runtime_exit role", () => {
    const em = writeExitManagementMode(createBlankExitManagement(), "managed");
    const bad = writeManagementRules(em, "runtime_exits", [
      {
        rule_id: "bad",
        component_id: "atr_stop_loss",
        role: RUNTIME_EXIT_ROLE,
        activate_when: { phase_at_least: "runner" },
        exit_kind: "take_profit",
        params: {},
      },
    ]);
    const errors = collectManagedRulesValidationErrors(bad, PATH, CATALOG);
    expect(errors.some((e) => e.path.endsWith(".component_id"))).toBe(true);
  });

  it("renders RSI and EMA runtime exit fields in management editor", () => {
    const em = normalizeExitManagementV2(runnerSmokeExitManagement());
    render(
      <ExitManagementProductPanel
        exitManagement={em}
        pathPrefix={PATH}
        catalog={CATALOG}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue("runner_rsi90_take")).toBeTruthy();
    expect(screen.getByDisplayValue("runner_ema100_200_protect")).toBeTruthy();
    expect(screen.getByDisplayValue("rsi_signal_exit")).toBeTruthy();
    expect(screen.getByDisplayValue("ema_cross_loss_exit")).toBeTruthy();
    expect(screen.getAllByDisplayValue(RUNTIME_EXIT_ROLE).length).toBeGreaterThan(0);
  });

  it("add runtime exit rule uses first catalog-allowed component", () => {
    const onChange = vi.fn();
    const em = writeExitManagementMode(createBlankExitManagement(), "managed");
    render(
      <ExitManagementProductPanel
        exitManagement={em}
        pathPrefix={PATH}
        catalog={CATALOG}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /add runtime exits rule/i }));
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as JsonObject;
    const runtime = readManagementRules(next, "runtime_exits");
    expect(runtime).toHaveLength(1);
    expect(runtime[0]?.component_id).toBe(runtimeExitComponentIds(CATALOG)[0]);
    expect(runtime[0]?.role).toBe(RUNTIME_EXIT_ROLE);
  });
});
