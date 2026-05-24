/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { RunReport } from "@/api/types";
import reportV4 from "@/features/reports/__fixtures__/report-v4-minimal.json";
import { ExitReasonBreakdownTable } from "@/features/reports/ExitReasonBreakdownTable";

const v4Report = reportV4 as RunReport;

describe("ExitReasonBreakdownTable", () => {
  it("renders a row per exit_reason key", () => {
    const breakdown = v4Report.variants[0].metrics.exit_reason_breakdown!;
    render(<ExitReasonBreakdownTable exitReasonBreakdown={breakdown} />);
    expect(screen.getByText("stop_loss:atr_sl_far")).toBeTruthy();
    expect(screen.getByText("signal:rsi_exit_base")).toBeTruthy();
    expect(screen.getByText("take_profit:atr_tp_far")).toBeTruthy();
  });
});
