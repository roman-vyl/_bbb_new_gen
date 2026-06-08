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

export function isTradeInVariant(
  trades: readonly TradeRecord[],
  tradeId: number | string | null | undefined,
): boolean {
  return findTradeById(trades, tradeId) !== undefined;
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

/** 1-based position in variant `trade_records` (user-facing "Trade #N"). */
export function tradeDisplayNumber(
  trades: readonly TradeRecord[],
  tradeId: number | string | null | undefined,
): number | null {
  if (tradeId === null || tradeId === undefined || trades.length === 0) {
    return null;
  }
  const index = trades.findIndex((t) => tradeIdsEqual(t.trade_id, tradeId));
  if (index < 0) {
    const asNumber = typeof tradeId === "number" ? tradeId : Number(tradeId);
    return Number.isFinite(asNumber) && asNumber >= 1 ? asNumber : null;
  }
  return index + 1;
}

/** Resolve display number (1-based) to canonical `trade_id` in report order. */
export function resolveTradeIdByDisplayNumber(
  trades: readonly TradeRecord[],
  displayNumber: number,
): number | string | null {
  if (!Number.isFinite(displayNumber) || displayNumber < 1) {
    return null;
  }
  const index = displayNumber - 1;
  if (index >= trades.length) {
    return displayNumber;
  }
  return trades[index]!.trade_id;
}

/** User-facing trade label (sequential #), not internal managed id (`long:979`). */
export function formatTradeDisplayNumber(
  trades: readonly TradeRecord[],
  tradeId: number | string | null | undefined,
): string {
  const display = tradeDisplayNumber(trades, tradeId);
  if (display !== null) {
    return String(display);
  }
  if (tradeId === null || tradeId === undefined) {
    return "";
  }
  return String(tradeId);
}

export function buildTradeDisplayNumberLookup(
  trades: readonly TradeRecord[],
): ReadonlyMap<string, number> {
  const lookup = new Map<string, number>();
  trades.forEach((trade, index) => {
    lookup.set(String(trade.trade_id), index + 1);
  });
  return lookup;
}

/** Parse manual trade id from chart nav input (positive integer digits only). */
export function parseManualTradeIdInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return null;
  }
  const id = Number(trimmed);
  if (!Number.isFinite(id) || id < 1) {
    return null;
  }
  return id;
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
export function findLastClosedTradeId(trades: readonly TradeRecord[]): number | string | null {
  for (let i = trades.length - 1; i >= 0; i--) {
    const trade = trades[i]!;
    if (trade.status === "closed") {
      return trade.trade_id;
    }
  }
  return null;
}

export type TradeFocusSelection = {
  tradeId: number | string | null;
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
): number | string | null {
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
  const raw = trades[nextIndex]!.trade_id;
  if (typeof raw === "string") {
    return raw;
  }
  return normalizeTradeId(raw);
}
