/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RunReport, RunVariant } from "@/api/types";
import reportV3 from "@/fixtures/report.json";
import reportV4 from "@/features/reports/__fixtures__/report-v4-minimal.json";
import reportV5 from "@/features/reports/__fixtures__/report-v5-quality.json";
import reportV6 from "@/features/reports/__fixtures__/report-v6-trade-management.json";
import reportV6Managed from "@/features/reports/__fixtures__/report-v6-managed-trade-management.json";
import { ReportsPanel } from "@/features/reports/ReportsPanel";

const { mockUseWorkbench } = vi.hoisted(() => ({
  mockUseWorkbench: vi.fn(),
}));

vi.mock("@/shared/context/WorkbenchContext", () => ({
  useWorkbench: () => mockUseWorkbench(),
}));

afterEach(() => {
  cleanup();
});

const v3Report = reportV3 as RunReport;
const v4Report = reportV4 as RunReport;
const v5Report = reportV5 as RunReport;
const v6Report = reportV6 as RunReport;
const v6ManagedReport = reportV6Managed as RunReport;

function mockWorkbench(overrides: {
  report: RunReport;
  variant: RunVariant;
  selectedTradeId?: number | string | null;
  selectTrade?: (id: number | string | null) => void;
}) {
  const selectTrade = overrides.selectTrade ?? vi.fn();
  mockUseWorkbench.mockReturnValue({
    report: overrides.report,
    selectedVariant: overrides.variant,
    selectedTradeId: overrides.selectedTradeId ?? null,
    selectTrade,
  });
  return { selectTrade };
}

describe("ReportsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("v3 report shows diagnostics empty state and does not crash", () => {
    mockWorkbench({ report: v3Report, variant: v3Report.variants[0] });
    render(<ReportsPanel />);
    expect(screen.getByText("Diagnostics available for schema v4/v5 reports.")).toBeTruthy();
    expect(screen.queryByText("Fee diagnostics")).toBeNull();
    expect(screen.queryByText("entry_profile")).toBeNull();
    expect(screen.queryByLabelText("Show diagnostics columns")).toBeNull();
    expect(screen.getAllByText("exit_reason").length).toBeGreaterThan(0);
    expect(screen.getByTestId("filter-direction")).toBeTruthy();
  });

  it("v4 report renders fee and breakdown sections", () => {
    mockWorkbench({ report: v4Report, variant: v4Report.variants[0] });
    render(<ReportsPanel />);
    expect(screen.queryByText("Diagnostics available for schema v4/v5 reports.")).toBeNull();
    expect(screen.getByText("Fee diagnostics")).toBeTruthy();
    expect(screen.getByText("Profile breakdown")).toBeTruthy();
    expect(screen.getByText("Exit reason breakdown")).toBeTruthy();
    expect(screen.getByText("Total fees")).toBeTruthy();
  });

  it("filters trades by long side", () => {
    mockWorkbench({ report: v4Report, variant: v4Report.variants[0] });
    render(<ReportsPanel />);
    fireEvent.click(
      within(screen.getByTestId("filter-direction")).getByRole("button", { name: "long" }),
    );
    const tradeTable = document.querySelector(".trade-table:not(.breakdown-table)");
    const rows = within(tradeTable as HTMLElement).getAllByRole("row").slice(1);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(within(row).getByText("long")).toBeTruthy();
    }
  });

  it("filtered row click calls selectTrade with trade id", () => {
    const { selectTrade } = mockWorkbench({ report: v4Report, variant: v4Report.variants[0] });
    render(<ReportsPanel />);
    fireEvent.click(
      within(screen.getByTestId("filter-outcome")).getByRole("button", { name: "Winners" }),
    );
    const tradeTable = document.querySelector(".trade-table:not(.breakdown-table)");
    const row = within(tradeTable as HTMLElement).getByText("signal:rsi_exit_base").closest("tr");
    expect(row).toBeTruthy();
    fireEvent.click(row!);
    expect(selectTrade).toHaveBeenCalledWith(2);
  });

  it("trade detail resolves from full trade_records when filtered", () => {
    mockWorkbench({
      report: v4Report,
      variant: v4Report.variants[0],
      selectedTradeId: 2,
    });
    render(<ReportsPanel />);
    fireEvent.click(
      within(screen.getByTestId("filter-exit-kind")).getByRole("button", { name: "stop_loss" }),
    );
    const tradeTable = document.querySelector(".trade-table:not(.breakdown-table)");
    expect(within(tradeTable as HTMLElement).queryByText("signal:rsi_exit_base")).toBeNull();
    expect(screen.getByText("Trade #2")).toBeTruthy();
    expect(screen.getByText("rsi_exit_base")).toBeTruthy();
  });

  it("diagnostics columns toggle shows enriched cells", () => {
    mockWorkbench({ report: v4Report, variant: v4Report.variants[0] });
    render(<ReportsPanel />);
    fireEvent.click(screen.getByLabelText("Show diagnostics columns"));
    expect(screen.getByText("entry_prof")).toBeTruthy();
    expect(screen.getAllByText("aligned").length).toBeGreaterThan(0);
    expect(screen.getAllByText("stop_loss").length).toBeGreaterThan(0);
  });

  it("v5 report filters by quality flag and shows quality columns", () => {
    mockWorkbench({ report: v5Report, variant: v5Report.variants[0] });
    render(<ReportsPanel />);
    fireEvent.click(
      within(screen.getByTestId("filter-quality-flag")).getByRole("button", {
        name: "сильный ход, но плохо забрали",
      }),
    );
    expect(screen.getByText("signal:ema_cross")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Show diagnostics columns"));
    const mfeHeader = screen.getByText("MFE %");
    expect(mfeHeader.closest("th")?.getAttribute("title")).toBe("макс. плюс");
    expect(screen.getByText("Capture ratio")).toBeTruthy();
    expect(screen.getByTitle("доля хода")).toBeTruthy();
    expect(screen.getByText("Quality flags")).toBeTruthy();
    expect(screen.getByTitle("ярлыки")).toBeTruthy();
    expect(
      screen.getByText(
        "сильный ход, но плохо забрали, сигнал выхода отдал импульс",
      ),
    ).toBeTruthy();
  });

  it("v3 report hides trade management diagnostics section", () => {
    mockWorkbench({ report: v3Report, variant: v3Report.variants[0] });
    render(<ReportsPanel />);
    expect(screen.queryByTestId("trade-management-diagnostics")).toBeNull();
  });

  it("v6 report renders trade management diagnostics section and phase rows", () => {
    mockWorkbench({ report: v6Report, variant: v6Report.variants[0] });
    render(<ReportsPanel />);
    expect(screen.getByTestId("trade-management-diagnostics")).toBeTruthy();
    expect(screen.getByText("Trade Management Diagnostics")).toBeTruthy();
    expect(screen.getByText("Phase reached breakdown")).toBeTruthy();
    expect(screen.getByText("initial_risk")).toBeTruthy();
    expect(screen.getByText("runner")).toBeTruthy();
    expect(screen.getByText("Runner capture summary")).toBeTruthy();
    expect(screen.getByText("Protected trade summary")).toBeTruthy();
    expect(screen.getByText("Exit layer breakdown")).toBeTruthy();
    expect(screen.queryByText("phase_changed")).toBeNull();
  });

  it("selected trade with trade_management renders Selected Trade Management block", () => {
    mockWorkbench({
      report: v6Report,
      variant: v6Report.variants[0],
      selectedTradeId: 2,
    });
    render(<ReportsPanel />);
    expect(screen.getByText("Selected Trade Management")).toBeTruthy();
    const tradeDetail = screen.getByText("Selected Trade Management").closest("aside");
    expect(tradeDetail).toBeTruthy();
    const detail = within(tradeDetail!);
    expect(detail.getByText("phase_at_exit")).toBeTruthy();
    expect(detail.getByText("bars_to_runner")).toBeTruthy();
    expect(detail.getAllByText("runner").length).toBeGreaterThan(0);
  });

  it("v6 managed report renders layer breakdowns and baseline placeholder", () => {
    mockWorkbench({
      report: v6ManagedReport,
      variant: v6ManagedReport.variants[0],
      selectedTradeId: "long:10",
    });
    render(<ReportsPanel />);
    const stopBreakdown = screen.getByTestId("managed-breakdown-stop_management_breakdown");
    const takeBreakdown = screen.getByTestId("managed-breakdown-take_management_breakdown");
    expect(within(stopBreakdown).getByText("break_even_stop")).toBeTruthy();
    expect(within(takeBreakdown).getByText("take_profile_switch")).toBeTruthy();
    expect(screen.getByTestId("baseline-vs-managed-placeholder")).toBeTruthy();
    expect(screen.getAllByText("exit_management").length).toBeGreaterThan(0);
    expect(screen.getByText("Selected Trade Management")).toBeTruthy();
    expect(screen.getByText("active_stop_at_exit")).toBeTruthy();
    expect(screen.getByText("exit_candidate_type")).toBeTruthy();
    expect(screen.getByText("managed_events")).toBeTruthy();
  });

  it("trade management summary with sparse nested fields does not crash", () => {
    const sparseVariant: RunVariant = {
      ...v6Report.variants[0],
      metrics: {
        ...v6Report.variants[0].metrics,
        trade_management_summary: {
          by_phase_reached: {
            proven: {},
          },
        },
      },
      trade_management_events: [{ trade_id: "1", bar_index: 0, side: "long", event_type: "exit_executed" }],
    };
    mockWorkbench({ report: v6Report, variant: sparseVariant });
    render(<ReportsPanel />);
    expect(screen.getByTestId("trade-management-diagnostics")).toBeTruthy();
  });
});
