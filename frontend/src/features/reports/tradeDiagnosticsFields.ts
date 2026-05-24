import type { TradeRecord } from "@/api/types";
import { EM_DASH, formatMoney, formatReturnPct } from "@/features/reports/formatDiagnostics";
import {
  chartMetricHint,
  chartMetricLabel,
  formatQualityFlags,
} from "@/features/reports/tradeExitQualityLabels";

export { EM_DASH, formatMoney, formatReturnPct };

export function formatMs(ms: number | null): string {
  if (ms === null) return EM_DASH;
  return new Date(ms).toISOString().replace("T", " ").replace(".000Z", " UTC");
}

export function formatPrice(
  value: number | null | undefined,
  fractionDigits = 8,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EM_DASH;
  const fixed = value.toFixed(fractionDigits);
  if (!fixed.includes(".")) return fixed;
  return fixed.replace(/\.?0+$/, "");
}

export function formatNum(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EM_DASH;
  return value.toFixed(digits);
}

export function hasTradeDiagnostics(trade: TradeRecord): boolean {
  return (
    trade.entry_profile !== undefined ||
    trade.exit_kind !== undefined ||
    trade.gross_pnl !== undefined ||
    trade.mfe_pct !== undefined ||
    trade.quality_flags !== undefined
  );
}

export type TradeDiagnosticField = {
  key: string;
  label: string;
  value: string;
  hint?: string;
};

function field(
  key: string,
  label: string,
  value: string,
  hint?: string,
): TradeDiagnosticField {
  return hint ? { key, label, value, hint } : { key, label, value };
}

function exitQualityField(
  key: Parameters<typeof chartMetricLabel>[0],
  value: string,
): TradeDiagnosticField {
  return field(key, chartMetricLabel(key), value, chartMetricHint(key));
}

/** Core + v4 diagnostic rows for Reports/Chart trade detail panels. */
export function buildTradeDiagnosticFields(trade: TradeRecord): {
  core: TradeDiagnosticField[];
  diagnostics: TradeDiagnosticField[];
} {
  const timingFields: TradeDiagnosticField[] = [
    field("entry_time_ms", "entry_time_ms", formatMs(trade.entry_time_ms)),
    field("exit_time_ms", "exit_time_ms", formatMs(trade.exit_time_ms)),
  ];

  const core: TradeDiagnosticField[] = [
    field("trade_id", "trade_id", String(trade.trade_id)),
    field("entry_price", "entry_price", formatPrice(trade.entry_price)),
    field("exit_price", "exit_price", formatPrice(trade.exit_price, 1)),
    field("pnl", "pnl", formatMoney(trade.pnl)),
    field("return_pct", "return_pct", formatReturnPct(trade.return_pct)),
    field("exit_reason", "exit_reason", trade.exit_reason),
  ];

  if (!hasTradeDiagnostics(trade)) {
    return { core: [...core, ...timingFields], diagnostics: [] };
  }

  const diagnostics: TradeDiagnosticField[] = [
    field("entry_profile", "entry_profile", trade.entry_profile ?? EM_DASH),
    field("entry_context_state", "entry_context_state", trade.entry_context_state ?? EM_DASH),
    field("active_exit_profile", "active_exit_profile", trade.active_exit_profile ?? EM_DASH),
    field("exit_group", "exit_group", trade.exit_group ?? EM_DASH),
    field("exit_profile", "exit_profile", trade.exit_profile ?? EM_DASH),
    field("exit_kind", "exit_kind", trade.exit_kind ?? EM_DASH),
    field("exit_component_id", "exit_component_id", trade.exit_component_id ?? EM_DASH),
    field("exit_instance_id", "exit_instance_id", trade.exit_instance_id ?? EM_DASH),
    field("gross_pnl", "gross_pnl", formatMoney(trade.gross_pnl)),
    field("fees_paid", "fees_paid", formatMoney(trade.fees_paid)),
    field(
      "gross_return_pct",
      "gross_return_pct",
      trade.gross_return_pct === null || trade.gross_return_pct === undefined
        ? EM_DASH
        : formatReturnPct(trade.gross_return_pct),
    ),
    ...timingFields,
    field(
      "hold_bars",
      "hold_bars",
      trade.hold_bars === null || trade.hold_bars === undefined ? EM_DASH : String(trade.hold_bars),
    ),
    field(
      "hold_minutes",
      "hold_minutes",
      trade.hold_minutes === null || trade.hold_minutes === undefined
        ? EM_DASH
        : String(trade.hold_minutes),
    ),
    exitQualityField("mfe_pct", formatReturnPct(trade.mfe_pct)),
    exitQualityField("mae_pct", formatReturnPct(trade.mae_pct)),
    exitQualityField("captured_pct", formatReturnPct(trade.captured_pct)),
    exitQualityField("capture_ratio", formatReturnPct(trade.capture_ratio)),
    exitQualityField("giveback_pct", formatReturnPct(trade.giveback_pct)),
    exitQualityField(
      "bars_to_mfe",
      trade.bars_to_mfe === null || trade.bars_to_mfe === undefined ? EM_DASH : String(trade.bars_to_mfe),
    ),
    exitQualityField(
      "bars_from_mfe_to_exit",
      trade.bars_from_mfe_to_exit === null || trade.bars_from_mfe_to_exit === undefined
        ? EM_DASH
        : String(trade.bars_from_mfe_to_exit),
    ),
    exitQualityField(
      "quality_flags",
      trade.quality_flags && trade.quality_flags.length > 0
        ? formatQualityFlags(trade.quality_flags)
        : EM_DASH,
    ),
  ];

  return { core, diagnostics };
}
