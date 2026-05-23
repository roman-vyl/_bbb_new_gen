/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { RunReport } from "@/api/types";
import reportV4 from "@/features/reports/__fixtures__/report-v4-minimal.json";
import { ProfileBreakdownTable } from "@/features/reports/ProfileBreakdownTable";

const v4Report = reportV4 as RunReport;

describe("ProfileBreakdownTable", () => {
  it("always renders aligned, countertrend, and neutral rows", () => {
    const breakdown = v4Report.variants[0].metrics.profile_breakdown!;
    render(<ProfileBreakdownTable profileBreakdown={breakdown} />);
    const rows = screen.getAllByRole("row");
    expect(rows.some((r) => within(r).queryByText("aligned"))).toBe(true);
    expect(rows.some((r) => within(r).queryByText("countertrend"))).toBe(true);
    expect(rows.some((r) => within(r).queryByText("neutral"))).toBe(true);
  });

  it("shows 0 trades and dashes for empty neutral bucket", () => {
    const breakdown = v4Report.variants[0].metrics.profile_breakdown!;
    const { container } = render(<ProfileBreakdownTable profileBreakdown={breakdown} />);
    const table = within(container).getByRole("table");
    const neutralRow = within(table).getByText("neutral").closest("tr");
    expect(neutralRow).toBeTruthy();
    expect(within(neutralRow!).getAllByRole("cell")[1]?.textContent).toBe("0");
    expect(within(neutralRow!).getAllByText("—").length).toBeGreaterThan(0);
  });
});
