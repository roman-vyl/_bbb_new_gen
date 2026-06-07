/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createBlankExitManagement } from "@/features/composer/composerExitManagementProduct";
import { PhaseRulesEditor } from "@/features/composer/PhaseRulesEditor";
import {
  collectPhaseRulesValidationErrors,
  defaultDiagnosticPhaseRules,
  readPhaseRules,
} from "@/features/composer/composerPhaseRulesEditor";

afterEach(() => {
  cleanup();
});

describe("PhaseRulesEditor", () => {
  it("remove rule works", () => {
    const onChange = vi.fn();
    render(
      <PhaseRulesEditor
        exitManagement={{
          mode: "diagnostic_only",
          phase_rules: defaultDiagnosticPhaseRules(),
          stop_management: [],
          runtime_exits: [],
        }}
        pathPrefix="instances[0].strategy"
        errors={[]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: /^remove$/i })[0]!);
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(readPhaseRules(next)).toHaveLength(2);
  });

  it("shows validation messages for invalid rules", () => {
    const exitManagement = createBlankExitManagement();
    exitManagement.phase_rules = [
      {
        rule_id: "",
        to_phase: "runner",
        condition: { type: "mfe_atr", threshold: -1 },
      },
    ];
    const errors = collectPhaseRulesValidationErrors(exitManagement, "instances[0].strategy");
    render(
      <PhaseRulesEditor
        exitManagement={exitManagement}
        pathPrefix="instances[0].strategy"
        errors={errors}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/rule_id is required/i)).toBeTruthy();
    expect(screen.getByText(/threshold must be a positive number/i)).toBeTruthy();
  });
});
