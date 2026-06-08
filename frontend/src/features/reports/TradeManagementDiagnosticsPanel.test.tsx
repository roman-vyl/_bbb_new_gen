/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { TradeManagementSummary } from "@/api/types";
import { TradeManagementDiagnosticsPanel } from "@/features/reports/TradeManagementDiagnosticsPanel";

afterEach(() => {
  cleanup();
});

describe("TradeManagementDiagnosticsPanel", () => {
  it("renders diagnostic-only summary without managed breakdown tables", () => {
    const summary: TradeManagementSummary = {
      by_phase_reached: { runner: { trade_count: 1 } },
      exit_layer_breakdown: { stop_loss: 1 },
    };
    render(<TradeManagementDiagnosticsPanel summary={summary} />);
    expect(screen.getByTestId("trade-management-diagnostics")).toBeTruthy();
    expect(screen.getByText("Exit layer breakdown")).toBeTruthy();
    expect(screen.queryByTestId("managed-breakdown-stop_management_breakdown")).toBeNull();
    expect(screen.queryByTestId("baseline-vs-managed-placeholder")).toBeNull();
  });

  it("renders generic managed layer breakdown rows by component_id", () => {
    const summary: TradeManagementSummary = {
      stop_management_breakdown: {
        break_even_stop: { trade_count: 2, pnl: -1, win_count: 0 },
      },
      runtime_exit_breakdown: {
        phase_runtime_exit: { trade_count: 1, pnl: 3, win_count: 1 },
      },
    };
    render(
      <TradeManagementDiagnosticsPanel
        summary={summary}
        baselineVsManagedSummary={{
          saved_by_managed_stop: [],
          exit_layer_transition_matrix: {},
        }}
      />,
    );
    expect(screen.getByTestId("managed-breakdown-stop_management_breakdown")).toBeTruthy();
    expect(screen.getByTestId("managed-breakdown-runtime_exit_breakdown")).toBeTruthy();
    expect(screen.getByText("break_even_stop")).toBeTruthy();
    expect(screen.getByText("phase_runtime_exit")).toBeTruthy();
    expect(screen.getByTestId("baseline-vs-managed-placeholder")).toBeTruthy();
  });
});
