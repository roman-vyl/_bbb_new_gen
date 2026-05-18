import type { TradeRecord } from "@/api/types";

/** Stable trade id comparison (JSON may coerce ids to string). */
export function tradeIdsEqual(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || b === null || b === undefined) {
    return false;
  }
  return String(a) === String(b);
}

export function findTradeById(
  trades: readonly TradeRecord[],
  tradeId: number | string | null | undefined,
): TradeRecord | undefined {
  if (tradeId === null || tradeId === undefined) {
    return undefined;
  }
  return trades.find((t) => tradeIdsEqual(t.trade_id, tradeId));
}

/** Canonical report field: `entry_time_ms` (Unix ms, UTC). */
export function resolveTradeEntryTimeMs(trade: TradeRecord | undefined): number | null {
  if (!trade) {
    return null;
  }
  const ms = trade.entry_time_ms;
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) {
    return null;
  }
  return ms;
}

export function resolveSelectedTradeEntryTimeMs(
  trades: readonly TradeRecord[],
  tradeId: number | string | null | undefined,
): { trade: TradeRecord | undefined; entryTimeMs: number | null } {
  const trade = findTradeById(trades, tradeId);
  return { trade, entryTimeMs: resolveTradeEntryTimeMs(trade) };
}
