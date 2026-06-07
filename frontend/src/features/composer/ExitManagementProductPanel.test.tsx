/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExitManagementProductPanel } from "@/features/composer/ExitManagementProductPanel";
import { createBlankExitManagement } from "@/features/composer/composerExitManagementProduct";
import {
  defaultDiagnosticPhaseRules,
  readPhaseRules,
  writeExitManagementOnStrategy,
} from "@/features/composer/composerPhaseRulesEditor";

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
        exitManagement={{
          always_on: {
            rules: [{ instance_id: "be_ao", component_id: "break_even_stop" }],
          },
          profiles: {
            aligned: { rules: [] },
            countertrend: { rules: [] },
            neutral: { rules: [] },
          },
        }}
        pathPrefix="instances[0].strategy"
      />,
    );
    expect(screen.getByText(/deprecated legacy management rules/i)).toBeTruthy();
    expect(screen.queryByTestId("phase-rules-editor")).toBeNull();
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
      runtime_exits: [],
    });
    const em = (next.trade_management as Record<string, unknown>).exit_management as Record<
      string,
      unknown
    >;
    expect(em.mode).toBe("diagnostic_only");
    expect(em.phase_rules).toEqual(defaultDiagnosticPhaseRules());
    expect(em.stop_management).toEqual([]);
    expect(em.runtime_exits).toEqual([]);
    expect(em.always_on).toBeUndefined();
  });
});
