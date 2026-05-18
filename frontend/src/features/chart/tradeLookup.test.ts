import { describe, expect, it } from "vitest";

import type { TradeRecord } from "@/api/types";
import {
  findTradeById,
  resolveSelectedTradeEntryTimeMs,
  resolveTradeEntryTimeMs,
  tradeIdsEqual,
} from "@/features/chart/tradeLookup";

function makeTrade(tradeId: number | string, entryTimeMs: number): TradeRecord {
  return {
    trade_id: tradeId as number,
    direction: "long",
    status: "closed",
    entry_time_ms: entryTimeMs,
    exit_time_ms: entryTimeMs + 60_000,
    entry_price: 100,
    exit_price: 101,
    exit_reason: "signal:exit",
    size: 1,
    pnl: 1,
    return_pct: 0.01,
  };
}

describe("tradeIdsEqual", () => {
  it("matches number and string ids", () => {
    expect(tradeIdsEqual(42, "42")).toBe(true);
    expect(tradeIdsEqual(42, 42)).toBe(true);
    expect(tradeIdsEqual(42, 43)).toBe(false);
  });
});

describe("findTradeById", () => {
  const trades = [makeTrade(1, 1_000), makeTrade("2", 2_000)];

  it("finds by numeric id", () => {
    expect(findTradeById(trades, 1)?.entry_time_ms).toBe(1_000);
  });

  it("finds by string id when record id is string", () => {
    expect(findTradeById(trades, 2)?.entry_time_ms).toBe(2_000);
    expect(findTradeById(trades, "2")?.entry_time_ms).toBe(2_000);
  });
});

describe("resolveTradeEntryTimeMs", () => {
  it("returns canonical entry_time_ms", () => {
    expect(resolveTradeEntryTimeMs(makeTrade(1, 1_710_000_000_000))).toBe(1_710_000_000_000);
  });

  it("rejects invalid entry times", () => {
    expect(resolveTradeEntryTimeMs(undefined)).toBeNull();
    expect(resolveTradeEntryTimeMs({ ...makeTrade(1, 0), entry_time_ms: 0 })).toBeNull();
    expect(
      resolveTradeEntryTimeMs({ ...makeTrade(1, 0), entry_time_ms: Number.NaN }),
    ).toBeNull();
  });
});

describe("resolveSelectedTradeEntryTimeMs", () => {
  const trades = [makeTrade(10, 5_000_000)];

  it("resolves entry for string selected id", () => {
    const { trade, entryTimeMs } = resolveSelectedTradeEntryTimeMs(trades, "10");
    expect(trade?.trade_id).toBe(10);
    expect(entryTimeMs).toBe(5_000_000);
  });
});
