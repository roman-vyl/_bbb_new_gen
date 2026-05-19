import type { RunReport, RunVariant, TradeRecord } from "@/api/types";

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

function normalizeTradeId(raw: number | string): number | null {
  const id = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(id) ? id : null;
}

/** Local selection: report + UI variant key → active variant (no fetch). */
export function deriveSelectedVariant(
  report: RunReport | null,
  variantKey: string,
): RunVariant | null {
  if (!report) {
    return null;
  }
  const found = report.variants.find((v) => v.variant === variantKey);
  return found ?? report.variants[0] ?? null;
}

/** Keep current instance when switching runs if it exists in the new report. */
export function resolveVariantKeyForReport(loaded: RunReport, previousKey: string): string {
  if (previousKey !== "" && loaded.variants.some((v) => v.variant === previousKey)) {
    return previousKey;
  }
  return loaded.variants[0]?.variant ?? "";
}

/** Last closed trade in report order (typical backtest: final closed position). */
export function findLastClosedTradeId(trades: readonly TradeRecord[]): number | null {
  for (let i = trades.length - 1; i >= 0; i--) {
    const trade = trades[i]!;
    if (trade.status !== "closed") {
      continue;
    }
    const id = normalizeTradeId(trade.trade_id);
    if (id !== null) {
      return id;
    }
  }
  return null;
}

export type TradeFocusSelection = {
  tradeId: number | null;
  barTimeSec: number | null;
};

/** Default chart focus: last closed trade and its entry bar. */
export function defaultClosedTradeSelection(trades: readonly TradeRecord[]): TradeFocusSelection {
  const tradeId = findLastClosedTradeId(trades);
  if (tradeId === null) {
    return { tradeId: null, barTimeSec: null };
  }
  const trade = findTradeById(trades, tradeId);
  const entryMs = resolveTradeEntryTimeMs(trade);
  return {
    tradeId,
    barTimeSec: entryMs !== null ? Math.floor(entryMs / 1000) : null,
  };
}

/** Previous (-1) or next (+1) trade id in report order; null at list ends or unknown current. */
export function getAdjacentTradeId(
  trades: readonly TradeRecord[],
  currentId: number | string | null | undefined,
  direction: -1 | 1,
): number | null {
  if (currentId === null || currentId === undefined || trades.length === 0) {
    return null;
  }
  const index = trades.findIndex((t) => tradeIdsEqual(t.trade_id, currentId));
  if (index < 0) {
    return null;
  }
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= trades.length) {
    return null;
  }
  return normalizeTradeId(trades[nextIndex]!.trade_id);
}
