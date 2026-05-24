import type { ExitProfileLabel, TradeRecord } from "@/api/types";
import {
  matchesExitReasonFilter,
  type ExitReasonFilterId,
} from "@/features/reports/exitReasonFilters";

export type EntryProfileFilterId = ExitProfileLabel | "all";
export type EntryContextFilterId = "up" | "down" | "neutral" | "unknown" | "all";
export type ExitGroupFilterId = "all" | "always_on" | "profile";
export type OutcomeFilterId = "all" | "winners" | "losers";
export type QualityFlagFilterId =
  | "all"
  | "high_mfe_high_capture"
  | "high_mfe_low_capture"
  | "signal_exit_winner"
  | "signal_exit_giveback_failure"
  | "stop_loss_after_low_mfe"
  | "stop_loss_after_bad_context";

export type TradeDiagnosticsFilterState = {
  entryProfile: EntryProfileFilterId;
  entryContextState: EntryContextFilterId;
  exitKind: string;
  exitGroup: ExitGroupFilterId;
  exitReason: ExitReasonFilterId;
  outcome: OutcomeFilterId;
  qualityFlag: QualityFlagFilterId;
};

export const DEFAULT_TRADE_DIAGNOSTICS_FILTERS: TradeDiagnosticsFilterState = {
  entryProfile: "all",
  entryContextState: "all",
  exitKind: "all",
  exitGroup: "all",
  exitReason: "all",
  outcome: "all",
  qualityFlag: "all",
};

export const ENTRY_PROFILE_FILTER_OPTIONS = [
  { id: "all" as const, label: "All" },
  { id: "aligned" as const, label: "aligned" },
  { id: "countertrend" as const, label: "countertrend" },
  { id: "neutral" as const, label: "neutral" },
];

export const ENTRY_CONTEXT_FILTER_OPTIONS = [
  { id: "all" as const, label: "All" },
  { id: "up" as const, label: "up" },
  { id: "down" as const, label: "down" },
  { id: "neutral" as const, label: "neutral" },
  { id: "unknown" as const, label: "unknown" },
];

export const EXIT_GROUP_FILTER_OPTIONS = [
  { id: "all" as const, label: "All" },
  { id: "always_on" as const, label: "always_on" },
  { id: "profile" as const, label: "profile" },
];

export const OUTCOME_FILTER_OPTIONS = [
  { id: "all" as const, label: "All" },
  { id: "winners" as const, label: "Winners" },
  { id: "losers" as const, label: "Losers" },
];

export const QUALITY_FLAG_FILTER_OPTIONS = [
  { id: "all" as const, label: "All" },
  { id: "high_mfe_high_capture" as const, label: "high MFE + high capture" },
  { id: "high_mfe_low_capture" as const, label: "high MFE + low capture" },
  { id: "signal_exit_winner" as const, label: "signal exit winners" },
  { id: "signal_exit_giveback_failure" as const, label: "signal exit giveback failures" },
  { id: "stop_loss_after_low_mfe" as const, label: "stop loss after low MFE" },
  { id: "stop_loss_after_bad_context" as const, label: "bad-context stop losses" },
];

export function distinctExitKinds(trades: readonly TradeRecord[]): string[] {
  const kinds = new Set<string>();
  for (const trade of trades) {
    if (trade.exit_kind) kinds.add(trade.exit_kind);
  }
  return [...kinds].sort();
}

export function matchesTradeDiagnosticsFilters(
  trade: TradeRecord,
  filters: TradeDiagnosticsFilterState,
): boolean {
  if (!matchesExitReasonFilter(trade.exit_reason, filters.exitReason)) return false;

  if (filters.entryProfile !== "all") {
    if (trade.entry_profile !== filters.entryProfile) return false;
  }

  if (filters.entryContextState !== "all") {
    if (trade.entry_context_state !== filters.entryContextState) return false;
  }

  if (filters.exitKind !== "all") {
    if (trade.exit_kind !== filters.exitKind) return false;
  }

  if (filters.exitGroup !== "all") {
    if (trade.exit_group !== filters.exitGroup) return false;
  }

  if (filters.outcome === "winners") {
    if (trade.pnl === null || trade.pnl <= 0) return false;
  } else if (filters.outcome === "losers") {
    if (trade.pnl === null || trade.pnl >= 0) return false;
  }

  if (filters.qualityFlag !== "all") {
    if (!(trade.quality_flags ?? []).includes(filters.qualityFlag)) return false;
  }

  return true;
}

export function filterTrades(
  trades: readonly TradeRecord[],
  filters: TradeDiagnosticsFilterState,
): TradeRecord[] {
  return trades.filter((trade) => matchesTradeDiagnosticsFilters(trade, filters));
}
