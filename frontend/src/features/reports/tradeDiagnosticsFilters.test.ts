import { describe, expect, it } from "vitest";

import type { TradeRecord } from "@/api/types";
import {
  DEFAULT_TRADE_DIAGNOSTICS_FILTERS,
  filterTrades,
  matchesTradeDiagnosticsFilters,
} from "@/features/reports/tradeDiagnosticsFilters";

function makeTrade(overrides: Partial<TradeRecord> = {}): TradeRecord {
  return {
    trade_id: 1,
    direction: "long",
    status: "closed",
    entry_time_ms: 1,
    exit_time_ms: 2,
    entry_price: 100,
    exit_price: 101,
    size: 1,
    pnl: 10,
    return_pct: 0.01,
    exit_reason: "stop_loss:atr_sl_far",
    entry_profile: "aligned",
    entry_context_state: "up",
    exit_kind: "stop_loss",
    exit_group: "always_on",
    ...overrides,
  };
}

describe("tradeDiagnosticsFilters", () => {
  it("filters by entry_profile", () => {
    const trades = [
      makeTrade({ trade_id: 1, entry_profile: "aligned" }),
      makeTrade({ trade_id: 2, entry_profile: "countertrend" }),
    ];
    const filtered = filterTrades(trades, {
      ...DEFAULT_TRADE_DIAGNOSTICS_FILTERS,
      entryProfile: "aligned",
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].trade_id).toBe(1);
  });

  it("filters by exit_reason prefix stop_loss", () => {
    const trades = [
      makeTrade({ exit_reason: "stop_loss:atr_sl_far" }),
      makeTrade({ trade_id: 2, exit_reason: "signal:rsi_exit_base", exit_kind: "signal" }),
    ];
    const filtered = filterTrades(trades, {
      ...DEFAULT_TRADE_DIAGNOSTICS_FILTERS,
      exitReason: "stop_loss",
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].exit_reason).toBe("stop_loss:atr_sl_far");
  });

  it("filters winners and losers by pnl", () => {
    const trades = [
      makeTrade({ trade_id: 1, pnl: 50 }),
      makeTrade({ trade_id: 2, pnl: -10 }),
      makeTrade({ trade_id: 3, pnl: null, status: "open", exit_reason: "open" }),
    ];
    expect(
      filterTrades(trades, { ...DEFAULT_TRADE_DIAGNOSTICS_FILTERS, outcome: "winners" }),
    ).toHaveLength(1);
    expect(
      filterTrades(trades, { ...DEFAULT_TRADE_DIAGNOSTICS_FILTERS, outcome: "losers" }),
    ).toHaveLength(1);
  });

  it("matches exit_kind with exact stop_loss string", () => {
    const trade = makeTrade({ exit_kind: "stop_loss" });
    expect(
      matchesTradeDiagnosticsFilters(trade, {
        ...DEFAULT_TRADE_DIAGNOSTICS_FILTERS,
        exitKind: "stop_loss",
      }),
    ).toBe(true);
    expect(
      matchesTradeDiagnosticsFilters(trade, {
        ...DEFAULT_TRADE_DIAGNOSTICS_FILTERS,
        exitKind: "stop",
      }),
    ).toBe(false);
  });
});
