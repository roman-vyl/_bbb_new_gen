/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import managedSmoke from "../../../../research/experiments/specs/smoke/exit_management_managed_smoke.json";
import { ExitManagementProductPanel } from "@/features/composer/ExitManagementProductPanel";
import {
  LEGACY_EXIT_MANAGEMENT_UNSUPPORTED_MESSAGE,
  createBlankExitManagement,
  normalizeExitManagementV2,
} from "@/features/composer/composerExitManagementProduct";
import { readManagementRules } from "@/features/composer/composerManagedExitManagement";
import {
  collectExitManagementProductValidationErrors,
  defaultDiagnosticPhaseRules,
  readPhaseRules,
  writeExitManagementOnStrategy,
} from "@/features/composer/composerPhaseRulesEditor";
import {
  collectComposerDraftErrors,
  prepareStrategyForApi,
} from "@/features/composer/composerStrategyContexts";

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

const PATH = "instances[0].strategy";

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
        pathPrefix={PATH}
      />,
    );
    expect(screen.getByTestId("exit-management-product-panel")).toBeTruthy();
    expect(screen.getAllByText("diagnostic_only").length).toBeGreaterThan(0);
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.queryByTestId("exit-management-unsupported-legacy")).toBeNull();
  });

  it("shows unsupported legacy banner when always_on/profiles are present", () => {
    render(
      <ExitManagementProductPanel
        exitManagement={LEGACY_EXIT_MANAGEMENT}
        pathPrefix={PATH}
      />,
    );
    expect(screen.getByTestId("exit-management-unsupported-legacy")).toBeTruthy();
    expect(screen.getByText(/unsupported legacy exit_management shape/i)).toBeTruthy();
    expect(screen.queryByTestId("phase-rules-editor")).toBeNull();
    expect(screen.queryByTestId("reset-exit-management-v2")).toBeNull();
  });

  it("legacy config shows reset button when onChange is wired", () => {
    render(
      <ExitManagementProductPanel
        exitManagement={LEGACY_EXIT_MANAGEMENT}
        pathPrefix={PATH}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("exit-management-unsupported-legacy")).toBeTruthy();
    expect(screen.getByRole("button", { name: /reset exit_management to v2/i })).toBeTruthy();
    expect(screen.queryByTestId("phase-rules-editor")).toBeNull();
  });

  it("clicking reset replaces draft with blank v2 contract", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ExitManagementProductPanel
        exitManagement={LEGACY_EXIT_MANAGEMENT}
        pathPrefix={PATH}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /reset exit_management to v2/i }));
    expect(onChange).toHaveBeenCalledWith(createBlankExitManagement());

    rerender(
      <ExitManagementProductPanel
        exitManagement={onChange.mock.calls[0]![0] as Record<string, unknown>}
        pathPrefix={PATH}
        onChange={onChange}
      />,
    );
    expect(screen.queryByTestId("exit-management-unsupported-legacy")).toBeNull();
    expect(screen.getByTestId("phase-rules-editor")).toBeTruthy();
  });

  it("does not auto-reset legacy shape on render", () => {
    render(
      <ExitManagementProductPanel
        exitManagement={LEGACY_EXIT_MANAGEMENT}
        pathPrefix={PATH}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("exit-management-unsupported-legacy")).toBeTruthy();
    expect(screen.queryByTestId("phase-rules-editor")).toBeNull();
  });

  it("blocks save validation for legacy exit_management", () => {
    const errors = collectExitManagementProductValidationErrors(LEGACY_STRATEGY, PATH);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe(LEGACY_EXIT_MANAGEMENT_UNSUPPORTED_MESSAGE);

    const draft = { instances: [{ strategy: LEGACY_STRATEGY }] };
    expect(collectComposerDraftErrors(draft).some((e) => e.message.includes("unsupported legacy"))).toBe(
      true,
    );
  });

  it("after reset, prepared strategy contains no legacy exit_management keys", () => {
    const reset = writeExitManagementOnStrategy(LEGACY_STRATEGY, createBlankExitManagement());
    const em = (reset.trade_management as Record<string, unknown>).exit_management as Record<
      string,
      unknown
    >;
    expect(em).toEqual(createBlankExitManagement());
    expect(em.always_on).toBeUndefined();
    expect(em.profiles).toBeUndefined();
    expect(collectExitManagementProductValidationErrors(reset, PATH)).toEqual([]);
    expect(JSON.stringify(prepareStrategyForApi(reset))).not.toContain("break_even_stop");
  });

  it("renders phase rules editor when onChange is provided and config is v2", () => {
    render(
      <ExitManagementProductPanel
        exitManagement={createBlankExitManagement()}
        pathPrefix={PATH}
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
        pathPrefix={PATH}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /default diagnostic phases/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(readPhaseRules(next)).toEqual(defaultDiagnosticPhaseRules());
  });

  it("reload saved v2 config restores phase_rules in editor", () => {
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
        pathPrefix={PATH}
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
        pathPrefix={PATH}
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
        pathPrefix={PATH}
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
