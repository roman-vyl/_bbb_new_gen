import type { ChartViewMode } from "@/features/chart/chartViewWindow";
import type { RuntimeLoadStatus } from "@/features/workbenchChartRuntime/runtimeTypes";

export type TradeFocusReadiness =
  | { status: "idle" }
  | { status: "ready"; entryTimeSec: number }
  | { status: "waiting"; reason: TradeFocusWaitingReason }
  | { status: "failed"; reason: TradeFocusFailedReason };

export type TradeFocusWaitingReason =
  | "no_entry_time"
  | "foundation_missing"
  | "empty_chart_view"
  | "trade_outside_slice"
  | "market_loading";

export type TradeFocusFailedReason = "market_error" | "no_entry_time";

export type TradeFocusRequest = {
  requestSeq: number;
  selectedTradeId: number | string;
  selectedTradeEntryTimeMs: number;
  entryTimeSec: number;
};

export type TradeFocusEmitKey = {
  selectedTradeId: number | string;
  entryTimeSec: number;
  foundationKey: string;
};

export type TradeFocusReadinessInput = {
  selectedTradeId: number | string | null;
  selectedTradeEntryTimeMs: number | null;
  renderWindowFoundationKey: string | null;
  marketLoadStatus: RuntimeLoadStatus;
  chartView: {
    mode: ChartViewMode;
    count: number;
    candles: readonly { time: number }[];
  };
};

export function entryTimeSecFromMs(entryTimeMs: number | null): number | null {
  if (entryTimeMs === null) {
    return null;
  }
  return Math.floor(entryTimeMs / 1000);
}

export function isTradeEntryInChartView(
  entryTimeSec: number,
  candles: readonly { time: number }[],
): boolean {
  if (candles.length === 0) {
    return false;
  }
  const fromSec = candles[0]!.time;
  const toSec = candles[candles.length - 1]!.time;
  return entryTimeSec >= fromSec && entryTimeSec <= toSec;
}

export function evaluateTradeFocusReadiness(
  input: TradeFocusReadinessInput,
): TradeFocusReadiness {
  if (input.selectedTradeId === null || input.selectedTradeEntryTimeMs === null) {
    return { status: "idle" };
  }

  const entryTimeSec = entryTimeSecFromMs(input.selectedTradeEntryTimeMs);
  if (entryTimeSec === null) {
    return { status: "failed", reason: "no_entry_time" };
  }

  if (input.marketLoadStatus === "error") {
    return { status: "failed", reason: "market_error" };
  }

  if (input.renderWindowFoundationKey === null) {
    return {
      status: "waiting",
      reason: input.marketLoadStatus === "loading" ? "market_loading" : "foundation_missing",
    };
  }

  if (input.chartView.count === 0 || input.chartView.candles.length === 0) {
    return { status: "waiting", reason: "empty_chart_view" };
  }

  if (!isTradeEntryInChartView(entryTimeSec, input.chartView.candles)) {
    return { status: "waiting", reason: "trade_outside_slice" };
  }

  return { status: "ready", entryTimeSec };
}

export function createTradeFocusRequest(
  requestSeq: number,
  selectedTradeId: number | string,
  selectedTradeEntryTimeMs: number,
): TradeFocusRequest | null {
  const entryTimeSec = entryTimeSecFromMs(selectedTradeEntryTimeMs);
  if (entryTimeSec === null) {
    return null;
  }
  return {
    requestSeq,
    selectedTradeId,
    selectedTradeEntryTimeMs,
    entryTimeSec,
  };
}

export function tradeFocusEmitKey(
  selectedTradeId: number | string,
  entryTimeSec: number,
  foundationKey: string,
): TradeFocusEmitKey {
  return { selectedTradeId, entryTimeSec, foundationKey };
}

export function tradeFocusEmitKeysEqual(
  left: TradeFocusEmitKey | null,
  right: TradeFocusEmitKey,
): boolean {
  if (left === null) {
    return false;
  }
  return (
    left.selectedTradeId === right.selectedTradeId &&
    left.entryTimeSec === right.entryTimeSec &&
    left.foundationKey === right.foundationKey
  );
}

export function shouldEmitTradeFocus(
  readiness: TradeFocusReadiness,
  lastEmitted: TradeFocusEmitKey | null,
  nextEmit: TradeFocusEmitKey,
  options: { suppressedByUserPan: boolean },
): boolean {
  if (options.suppressedByUserPan) {
    return false;
  }
  if (readiness.status !== "ready") {
    return false;
  }
  if (readiness.entryTimeSec !== nextEmit.entryTimeSec) {
    return false;
  }
  return !tradeFocusEmitKeysEqual(lastEmitted, nextEmit);
}

export function isStaleTradeFocusRequest(
  pendingRequestSeq: number,
  currentRequestSeq: number,
): boolean {
  return pendingRequestSeq !== currentRequestSeq;
}
