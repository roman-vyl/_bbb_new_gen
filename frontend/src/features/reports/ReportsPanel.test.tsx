/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RunReport, RunVariant } from "@/api/types";
import reportV3 from "@/fixtures/report.json";
import reportV4 from "@/features/reports/__fixtures__/report-v4-minimal.json";
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

function mockWorkbench(overrides: {
  report: RunReport;
  variant: RunVariant;
  selectedTradeId?: number | null;
  selectTrade?: (id: number) => void;
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
    expect(screen.getByText("Diagnostics available for schema v4 reports.")).toBeTruthy();
    expect(screen.queryByText("Fee diagnostics")).toBeNull();
    expect(screen.queryByText("entry_profile")).toBeNull();
    expect(screen.queryByLabelText("Show diagnostics columns")).toBeNull();
    expect(screen.getAllByText("exit_reason").length).toBeGreaterThan(0);
  });

  it("v4 report renders fee and breakdown sections", () => {
    mockWorkbench({ report: v4Report, variant: v4Report.variants[0] });
    render(<ReportsPanel />);
    expect(screen.queryByText("Diagnostics available for schema v4 reports.")).toBeNull();
    expect(screen.getByText("Fee diagnostics")).toBeTruthy();
    expect(screen.getByText("Profile breakdown")).toBeTruthy();
    expect(screen.getByText("Exit reason breakdown")).toBeTruthy();
    expect(screen.getByText("Total fees")).toBeTruthy();
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
});
