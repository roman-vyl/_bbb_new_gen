import { describe, expect, it } from "vitest";

import type { TradeManagementSummary } from "@/api/types";
import { phaseRows } from "@/features/reports/tradeManagementSummary";

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
});
