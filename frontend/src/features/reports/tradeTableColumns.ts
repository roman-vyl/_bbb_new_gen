import type { TradeRecord } from "@/api/types";
import {
  EM_DASH,
  formatHoldBars,
  formatMoney,
  formatReturnPct,
} from "@/features/reports/formatDiagnostics";
import {
  formatQualityFlags,
  tableColumnHeader,
  tableColumnHint,
  type TradeExitQualityMetricKey,
} from "@/features/reports/tradeExitQualityLabels";

export type DiagnosticsColumnId =
  | "entry_profile"
  | "entry_context_state"
  | "active_exit_profile"
  | "exit_group"
  | "exit_profile"
  | "exit_kind"
  | "gross_pnl"
  | "fees_paid"
  | "hold_bars"
  | "mfe_pct"
  | "mae_pct"
  | "captured_pct"
  | "capture_ratio"
  | "giveback_pct"
  | "quality_flags";

type TableQualityColumnId = Extract<DiagnosticsColumnId, TradeExitQualityMetricKey>;

function qualityColumn(
  id: TableQualityColumnId,
  cell: (trade: TradeRecord) => string,
): {
  id: DiagnosticsColumnId;
  header: string;
  hint?: string;
  cell: (trade: TradeRecord) => string;
} {
  return {
    id,
    header: tableColumnHeader(id),
    hint: tableColumnHint(id),
    cell,
  };
}

export const DIAGNOSTICS_COLUMNS: {
  id: DiagnosticsColumnId;
  header: string;
  hint?: string;
  cell: (trade: TradeRecord) => string;
}[] = [
  { id: "entry_profile", header: "entry_prof", cell: (t) => t.entry_profile ?? EM_DASH },
  {
    id: "entry_context_state",
    header: "ctx",
    cell: (t) => t.entry_context_state ?? EM_DASH,
  },
  {
    id: "active_exit_profile",
    header: "exit_prof",
    cell: (t) => t.active_exit_profile ?? EM_DASH,
  },
  { id: "exit_group", header: "exit_grp", cell: (t) => t.exit_group ?? EM_DASH },
  { id: "exit_profile", header: "rule_prof", cell: (t) => t.exit_profile ?? EM_DASH },
  { id: "exit_kind", header: "kind", cell: (t) => t.exit_kind ?? EM_DASH },
  {
    id: "gross_pnl",
    header: "gross",
    cell: (t) => formatMoney(t.gross_pnl),
  },
  {
    id: "fees_paid",
    header: "fees",
    cell: (t) => formatMoney(t.fees_paid),
  },
  {
    id: "hold_bars",
    header: "hold",
    cell: (t) => formatHoldBars(t.hold_bars),
  },
  qualityColumn("mfe_pct", (t) => formatReturnPct(t.mfe_pct)),
  qualityColumn("mae_pct", (t) => formatReturnPct(t.mae_pct)),
  qualityColumn("captured_pct", (t) => formatReturnPct(t.captured_pct)),
  qualityColumn("capture_ratio", (t) => formatReturnPct(t.capture_ratio)),
  qualityColumn("giveback_pct", (t) => formatReturnPct(t.giveback_pct)),
  qualityColumn("quality_flags", (t) =>
    t.quality_flags && t.quality_flags.length > 0 ? formatQualityFlags(t.quality_flags) : EM_DASH,
  ),
];
