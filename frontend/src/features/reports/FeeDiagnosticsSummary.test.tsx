/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FeeDiagnosticsSummary } from "@/features/reports/FeeDiagnosticsSummary";

describe("FeeDiagnosticsSummary", () => {
  it("renders fee diagnostic fields", () => {
    render(
      <FeeDiagnosticsSummary
        feeDiagnostics={{
          total_fees_paid: 12.5,
          gross_pnl: 62.5,
          net_pnl: 50,
          fees_rate: 0.001,
          fees_as_pct_of_gross_profit: 0.25,
        }}
      />,
    );
    expect(screen.getByText("Total fees")).toBeTruthy();
    expect(screen.getByText("12.50")).toBeTruthy();
    expect(screen.getByText("Gross PnL")).toBeTruthy();
    expect(screen.getByText("25.00%")).toBeTruthy();
  });

  it("shows placeholder when fees_as_pct_of_gross_profit is null", () => {
    const { container } = render(
      <FeeDiagnosticsSummary
        feeDiagnostics={{
          total_fees_paid: 0,
          gross_pnl: 0,
          net_pnl: 0,
          fees_rate: 0.001,
          fees_as_pct_of_gross_profit: null,
        }}
      />,
    );
    const card = within(container).getByText("Fees / gross profit").closest(".metric-card");
    expect(card).toBeTruthy();
    expect(within(card as HTMLElement).getByText("—")).toBeTruthy();
  });
});
