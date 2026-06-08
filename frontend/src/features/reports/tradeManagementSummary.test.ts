import { describe, expect, it } from "vitest";

import type { TradeManagementSummary } from "@/api/types";
import {
  hasBaselineVsManagedSummary,
  hasManagedLayerBreakdowns,
  managedLayerBreakdownRows,
  phaseRows,
} from "@/features/reports/tradeManagementSummary";

describe("tradeManagementSummary helpers", () => {
  it("phaseRows preserves known phase order and skips missing buckets", () => {
    const summary: TradeManagementSummary = {
      by_phase_reached: {
        runner: { trade_count: 1 },
        initial_risk: { trade_count: 2 },
      },
    };
    expect(phaseRows(summary).map((row) => row.phase)).toEqual(["initial_risk", "runner"]);
  });

  it("phaseRows tolerates missing by_phase_reached", () => {
    expect(phaseRows({})).toEqual([]);
  });

  it("managedLayerBreakdownRows sorts by trade_count descending", () => {
    const summary: TradeManagementSummary = {
      stop_management_breakdown: {
        lock_profit_stop: { trade_count: 2, pnl: 1, win_count: 1 },
        break_even_stop: { trade_count: 5, pnl: -1, win_count: 0 },
      },
    };
    expect(managedLayerBreakdownRows(summary.stop_management_breakdown).map((r) => r.componentId)).toEqual(
      ["break_even_stop", "lock_profit_stop"],
    );
    expect(hasManagedLayerBreakdowns(summary)).toBe(true);
  });

  it("hasBaselineVsManagedSummary is false when field absent", () => {
    expect(hasBaselineVsManagedSummary({ long: { trades: 0, pnl: 0, return_pct: 0, profit_factor: null, win_rate: null }, short: { trades: 0, pnl: 0, return_pct: 0, profit_factor: null, win_rate: null }, total: { trades: 0, pnl: 0, return_pct: 0, profit_factor: null, win_rate: null, sharpe: 0, max_drawdown: 0 }, open_trades: { long: 0, short: 0, total: 0 } })).toBe(false);
  });
});
