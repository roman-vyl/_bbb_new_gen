import type {
  ContextConsumptionAttribution,
  SetupEntryDiagnostics,
  TradeRecord,
} from "@/api/types";
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

function setupDiagnosticsEntries(
  trade: TradeRecord,
): [string, SetupEntryDiagnostics][] {
  const raw = trade.entry_setup_diagnostics;
  if (!raw || typeof raw !== "object") {
    return [];
  }
  return Object.entries(raw);
}

export function hasTradeDiagnostics(trade: TradeRecord): boolean {
  return (
    trade.entry_profile !== undefined ||
    trade.exit_kind !== undefined ||
    trade.gross_pnl !== undefined ||
    trade.mfe_pct !== undefined ||
    trade.quality_flags !== undefined ||
    setupDiagnosticsEntries(trade).length > 0
  );
}

export function buildBreakEvenDiagnosticFields(trade: TradeRecord): TradeDiagnosticField[] {
  const be = trade.break_even;
  if (!be) {
    return [];
  }
  const hint = "From exit management combiner (break_even_stop)";
  return [
    field("break_even.instance_id", "instance_id", be.instance_id, hint),
    field("break_even.trigger_r", "trigger_r", formatNum(be.trigger_r, 2), hint),
    field(
      "break_even.triggered",
      "triggered",
      be.triggered ? "yes" : "no",
      hint,
    ),
    field(
      "break_even.trigger_price",
      "trigger_price",
      formatPrice(be.trigger_price ?? null),
      hint,
    ),
    field(
      "break_even.trigger_time_ms",
      "trigger_time_ms",
      formatMs(be.trigger_time_ms ?? null),
      hint,
    ),
    field(
      "break_even.stop_moved_to",
      "stop_moved_to",
      formatPrice(be.stop_moved_to ?? null),
      hint,
    ),
    field(
      "break_even.initial_stop_price",
      "initial_stop_price",
      formatPrice(be.initial_stop_price),
      hint,
    ),
    field(
      "break_even.initial_risk",
      "initial_risk",
      formatPrice(be.initial_risk),
      hint,
    ),
    field(
      "break_even.active_stop_management_source",
      "management_source",
      be.active_stop_management_source,
      hint,
    ),
  ];
}

function buildSetupDiagnosticFields(trade: TradeRecord): TradeDiagnosticField[] {
  const out: TradeDiagnosticField[] = [];
  for (const [instanceId, diag] of setupDiagnosticsEntries(trade)) {
    const prefix = `entry_setup_diagnostics.${instanceId}`;
    const sectionHint = `Setup gate "${instanceId}" at entry`;
    if (diag.side !== undefined && diag.side !== null) {
      out.push(field(`${prefix}.side`, "side", diag.side, sectionHint));
    }
    if (diag.trend_episode_id !== undefined && diag.trend_episode_id !== null) {
      out.push(
        field(
          `${prefix}.trend_episode_id`,
          "trend_episode_id",
          String(diag.trend_episode_id),
          sectionHint,
        ),
      );
    }
    if (diag.effective_bounce_number !== undefined && diag.effective_bounce_number !== null) {
      out.push(
        field(
          `${prefix}.effective_bounce_number`,
          "bounce_number",
          String(diag.effective_bounce_number),
          sectionHint,
        ),
      );
    }
    if (diag.completed_bounce_count !== undefined && diag.completed_bounce_count !== null) {
      out.push(
        field(
          `${prefix}.completed_bounce_count`,
          "completed_bounces",
          String(diag.completed_bounce_count),
          sectionHint,
        ),
      );
    }
  }
  return out;
}

export function hasTradeContextConsumption(trade: TradeRecord): boolean {
  return trade.entry_context_consumption != null || trade.exit_context_consumption != null;
}

function formatConsumptionApplied(attribution: ContextConsumptionAttribution): string {
  if (attribution.applied !== undefined) {
    return attribution.applied ? "yes" : "no";
  }
  const legacy = (attribution as { context_applied?: boolean }).context_applied;
  if (legacy !== undefined) {
    return legacy ? "yes" : "no";
  }
  return EM_DASH;
}

/** v5 per-trade context consumption attribution (Chart trade diagnostics). */
export function buildContextConsumptionDiagnosticFields(
  attribution: ContextConsumptionAttribution,
  side: "entry" | "exit",
): TradeDiagnosticField[] {
  const prefix = side === "entry" ? "entry_context_consumption" : "exit_context_consumption";
  const sectionHint =
    side === "entry"
      ? "Configured consumer (not bar-level gate decision)"
      : "Configured exit policy consumer (not per-bar profile selection)";

  const fields: TradeDiagnosticField[] = [
    field(`${prefix}.context_ref`, "context_ref", attribution.context_ref, sectionHint),
    field(`${prefix}.policy_id`, "policy_id", attribution.policy_id),
    field(`${prefix}.applied`, "applied", formatConsumptionApplied(attribution)),
    field(`${prefix}.role`, "role", attribution.role),
    field(`${prefix}.component_id`, "component_id", attribution.component_id),
  ];
  if (attribution.instance_id) {
    fields.push(
      field(`${prefix}.instance_id`, "instance_id", String(attribution.instance_id)),
    );
  }
  return fields;
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
    field("entry_profile", "Entry profile", trade.entry_profile ?? EM_DASH),
    field(
      "entry_context_state",
      "HTF state at entry",
      trade.entry_context_state ?? EM_DASH,
      "Raw context provider state on the entry bar",
    ),
    field(
      "active_exit_profile",
      "Exit profile",
      trade.active_exit_profile ?? EM_DASH,
      "Selected exit regime/profile for this trade",
    ),
    field("exit_group", "exit_group", trade.exit_group ?? EM_DASH),
    field("exit_profile", "exit_profile", trade.exit_profile ?? EM_DASH),
    field("exit_kind", "exit_kind", trade.exit_kind ?? EM_DASH),
    field("exit_component_id", "exit_component_id", trade.exit_component_id ?? EM_DASH),
    field("exit_instance_id", "exit_instance_id", trade.exit_instance_id ?? EM_DASH),
    ...buildSetupDiagnosticFields(trade),
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
