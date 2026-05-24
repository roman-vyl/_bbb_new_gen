import { describe, expect, it } from "vitest";

import type { VariantMetrics } from "@/api/types";
import { hasVariantDiagnostics, isDiagnosticsV4 } from "@/features/reports/reportSchema";

describe("reportSchema", () => {
  it("isDiagnosticsV4 is true only for version 4", () => {
    expect(isDiagnosticsV4(4)).toBe(true);
    expect(isDiagnosticsV4(3)).toBe(false);
    expect(isDiagnosticsV4(1)).toBe(false);
  });

  it("hasVariantDiagnostics detects any v4 metrics section", () => {
    const empty: VariantMetrics = {
      long: { trades: 0, pnl: 0, return_pct: 0, profit_factor: null, win_rate: null },
      short: { trades: 0, pnl: 0, return_pct: 0, profit_factor: null, win_rate: null },
      total: {
        trades: 0,
        pnl: 0,
        return_pct: 0,
        profit_factor: null,
        win_rate: null,
        sharpe: 0,
        max_drawdown: 0,
      },
      open_trades: { long: 0, short: 0, total: 0 },
    };
    expect(hasVariantDiagnostics(empty)).toBe(false);
    expect(
      hasVariantDiagnostics({
        ...empty,
        fee_diagnostics: {
          total_fees_paid: 1,
          gross_pnl: 2,
          net_pnl: 1,
          fees_rate: 0.001,
        },
      }),
    ).toBe(true);
  });
});
