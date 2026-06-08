/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import managedSmoke from "../../../../research/experiments/specs/smoke/exit_management_managed_smoke.json";
import { ExitManagementProductPanel } from "@/features/composer/ExitManagementProductPanel";
import {
  countLegacyExitManagementRules,
  createBlankExitManagement,
  normalizeExitManagementV2,
} from "@/features/composer/composerExitManagementProduct";
import { readManagementRules } from "@/features/composer/composerManagedExitManagement";
import {
  defaultDiagnosticPhaseRules,
  readPhaseRules,
  replaceLegacyExitManagementWithDefaultDiagnosticPhases,
  replaceLegacyExitManagementWithProductShape,
  writeExitManagementOnStrategy,
} from "@/features/composer/composerPhaseRulesEditor";
import { prepareStrategyForApi } from "@/features/composer/composerStrategyContexts";

const LEGACY_EXIT_MANAGEMENT = {
  always_on: {
    rules: [{ instance_id: "be_ao", component_id: "break_even_stop", trigger_r: 1.0 }],
  },
  profiles: {
    aligned: {
      rules: [{ instance_id: "be_al", component_id: "break_even_stop", trigger_r: 1.0 }],
    },
    countertrend: { rules: [] },
    neutral: { rules: [] },
  },
};

const LEGACY_STRATEGY = {
  trade_management: {
    exit_policy: { always_on: { exits: [] }, profiles: {} },
    exit_management: LEGACY_EXIT_MANAGEMENT,
  },
};

afterEach(() => {
  cleanup();
});

describe("ExitManagementProductPanel", () => {
  it("shows product contract summary for new diagnostic_only shape", () => {
    render(
      <ExitManagementProductPanel
        exitManagement={{
          mode: "diagnostic_only",
          phase_rules: [{ rule_id: "to_proven" }],
          stop_management: [],
          take_management: [],
          runtime_exits: [],
        }}
        pathPrefix="instances[0].strategy"
      />,
    );
    expect(screen.getByTestId("exit-management-product-panel")).toBeTruthy();
    expect(screen.getAllByText("diagnostic_only").length).toBeGreaterThan(0);
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.queryByText(/deprecated legacy management rules/i)).toBeNull();
  });

  it("warns when legacy break_even rules are present on loaded config", () => {
    render(
      <ExitManagementProductPanel
        exitManagement={LEGACY_EXIT_MANAGEMENT}
        pathPrefix="instances[0].strategy"
      />,
    );
    expect(screen.getByText(/deprecated legacy management rules/i)).toBeTruthy();
    expect(screen.queryByTestId("phase-rules-editor")).toBeNull();
    expect(screen.queryByTestId("replace-legacy-empty-product")).toBeNull();
  });

  it("legacy config shows warning and replacement buttons when onChange is wired", () => {
    render(
      <ExitManagementProductPanel
        exitManagement={LEGACY_EXIT_MANAGEMENT}
        pathPrefix="instances[0].strategy"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("exit-management-legacy-quarantine")).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: /remove legacy rules and use diagnostic-only contract/i,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /replace with default diagnostic phases/i }),
    ).toBeTruthy();
    expect(screen.queryByTestId("phase-rules-editor")).toBeNull();
  });

  it("clicking remove legacy rules replaces draft with empty diagnostic-only contract", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ExitManagementProductPanel
        exitManagement={LEGACY_EXIT_MANAGEMENT}
        pathPrefix="instances[0].strategy"
        onChange={onChange}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: /remove legacy rules and use diagnostic-only contract/i,
      }),
    );
    expect(onChange).toHaveBeenCalledWith(createBlankExitManagement());

    rerender(
      <ExitManagementProductPanel
        exitManagement={onChange.mock.calls[0]![0] as Record<string, unknown>}
        pathPrefix="instances[0].strategy"
        onChange={onChange}
      />,
    );
    expect(screen.queryByTestId("exit-management-legacy-quarantine")).toBeNull();
    expect(screen.getByTestId("phase-rules-editor")).toBeTruthy();
    expect(countLegacyExitManagementRules(onChange.mock.calls[0]![0] as Record<string, unknown>)).toBe(
      0,
    );
  });

  it("clicking default diagnostic replacement creates 3 phase_rules and enables editor", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ExitManagementProductPanel
        exitManagement={LEGACY_EXIT_MANAGEMENT}
        pathPrefix="instances[0].strategy"
        onChange={onChange}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /replace with default diagnostic phases/i }),
    );
    const next = onChange.mock.calls[0]![0] as Record<string, unknown>;
    expect(readPhaseRules(next)).toEqual(defaultDiagnosticPhaseRules());
    expect(next.mode).toBe("diagnostic_only");

    rerender(
      <ExitManagementProductPanel
        exitManagement={next}
        pathPrefix="instances[0].strategy"
        onChange={onChange}
      />,
    );
    expect(screen.getByTestId("phase-rule-0")).toBeTruthy();
    expect(screen.getByTestId("phase-rule-2")).toBeTruthy();
  });

  it("does not auto-replace legacy shape on render without explicit click", () => {
    render(
      <ExitManagementProductPanel
        exitManagement={LEGACY_EXIT_MANAGEMENT}
        pathPrefix="instances[0].strategy"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("exit-management-legacy-quarantine")).toBeTruthy();
    expect(screen.queryByTestId("phase-rules-editor")).toBeNull();
  });

  it("serialized strategy after replacement contains no legacy exit_management keys", () => {
    const replaced = replaceLegacyExitManagementWithProductShape(LEGACY_STRATEGY);
    const em = (replaced.trade_management as Record<string, unknown>).exit_management as Record<
      string,
      unknown
    >;
    expect(em).toEqual(createBlankExitManagement());
    expect(em.always_on).toBeUndefined();
    expect(em.profiles).toBeUndefined();
    expect(JSON.stringify(prepareStrategyForApi(replaced))).not.toContain("break_even_stop");

    const withPreset = replaceLegacyExitManagementWithDefaultDiagnosticPhases(LEGACY_STRATEGY);
    const presetEm = (withPreset.trade_management as Record<string, unknown>)
      .exit_management as Record<string, unknown>;
    expect(readPhaseRules(presetEm)).toHaveLength(3);
    expect(presetEm.always_on).toBeUndefined();
  });

  it("renders phase rules editor when onChange is provided and no legacy rules", () => {
    render(
      <ExitManagementProductPanel
        exitManagement={createBlankExitManagement()}
        pathPrefix="instances[0].strategy"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("phase-rules-editor")).toBeTruthy();
    expect(screen.getByRole("button", { name: /add phase rule/i })).toBeTruthy();
  });

  it("add default preset creates 3 phase_rules", () => {
    const onChange = vi.fn();
    render(
      <ExitManagementProductPanel
        exitManagement={createBlankExitManagement()}
        pathPrefix="instances[0].strategy"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /default diagnostic phases/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(readPhaseRules(next)).toEqual(defaultDiagnosticPhaseRules());
  });

  it("reload saved config restores phase_rules in editor", () => {
    const saved = {
      mode: "diagnostic_only",
      phase_rules: defaultDiagnosticPhaseRules(),
      stop_management: [],
      take_management: [],
      runtime_exits: [],
    };
    render(
      <ExitManagementProductPanel
        exitManagement={saved}
        pathPrefix="instances[0].strategy"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("phase-rule-0")).toBeTruthy();
    expect(screen.getByTestId("phase-rule-1")).toBeTruthy();
    expect(screen.getByTestId("phase-rule-2")).toBeTruthy();
    expect(screen.getByDisplayValue("to_proven_at_1atr")).toBeTruthy();
  });

  it("writeExitManagementOnStrategy preserves phase_rules for save/load roundtrip", () => {
    const strategy = {
      trade_management: {
        exit_policy: { always_on: { exits: [] }, profiles: {} },
        exit_management: createBlankExitManagement(),
      },
    };
    const next = writeExitManagementOnStrategy(strategy, {
      mode: "diagnostic_only",
      phase_rules: defaultDiagnosticPhaseRules(),
      stop_management: [],
      take_management: [],
      runtime_exits: [],
    });
    const em = (next.trade_management as Record<string, unknown>).exit_management as Record<
      string,
      unknown
    >;
    expect(em.mode).toBe("diagnostic_only");
    expect(em.phase_rules).toEqual(defaultDiagnosticPhaseRules());
    expect(em.stop_management).toEqual([]);
    expect(em.take_management).toEqual([]);
    expect(em.runtime_exits).toEqual([]);
    expect(em.always_on).toBeUndefined();
  });

  it("managed mode shows management rule editors", () => {
    const strategy = (managedSmoke.instances[0] as Record<string, unknown>).strategy as Record<
      string,
      unknown
    >;
    const tm = strategy.trade_management as Record<string, unknown>;
    const em = normalizeExitManagementV2(tm.exit_management as Record<string, unknown>);
    render(
      <ExitManagementProductPanel
        exitManagement={em}
        pathPrefix="instances[0].strategy"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("exit-management-mode-select")).toBeTruthy();
    expect(screen.getByTestId("management-rules-editor-stop_management")).toBeTruthy();
    expect(screen.getByTestId("management-rules-editor-take_management")).toBeTruthy();
    expect(screen.getByTestId("management-rules-editor-runtime_exits")).toBeTruthy();
    expect(screen.getByDisplayValue("be_at_protected")).toBeTruthy();
    expect(screen.getByDisplayValue("disable_initial_tp_at_runner")).toBeTruthy();
  });

  it("switching mode to managed via select enables management editors", () => {
    const onChange = vi.fn();
    render(
      <ExitManagementProductPanel
        exitManagement={createBlankExitManagement()}
        pathPrefix="instances[0].strategy"
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByTestId("exit-management-mode-select"), {
      target: { value: "managed" },
    });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as Record<string, unknown>;
    expect(next.mode).toBe("managed");
    expect(next.stop_management).toEqual([]);
  });

  it("managed smoke round-trip through writeExitManagementOnStrategy preserves arrays", () => {
    const strategy = (managedSmoke.instances[0] as Record<string, unknown>).strategy as Record<
      string,
      unknown
    >;
    const tm = strategy.trade_management as Record<string, unknown>;
    const em = normalizeExitManagementV2(tm.exit_management as Record<string, unknown>);
    const next = writeExitManagementOnStrategy(strategy, em);
    const savedEm = ((next.trade_management as Record<string, unknown>).exit_management as Record<
      string,
      unknown
    >);
    expect(savedEm).toEqual(em);
    expect(readManagementRules(savedEm, "stop_management")).toHaveLength(2);
    expect(readManagementRules(savedEm, "take_management")).toHaveLength(1);
    expect(readManagementRules(savedEm, "runtime_exits")).toHaveLength(1);
    expect(savedEm.always_on).toBeUndefined();
    expect(savedEm.profiles).toBeUndefined();
  });
});
