/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ExitManagementProductPanel } from "@/features/composer/ExitManagementProductPanel";

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
      />,
    );
    expect(screen.getByTestId("exit-management-product-panel")).toBeTruthy();
    expect(screen.getByText("diagnostic_only")).toBeTruthy();
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
      />,
    );
    expect(screen.getByText(/deprecated legacy management rules/i)).toBeTruthy();
  });
});
