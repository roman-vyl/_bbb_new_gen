import type { TradeRecord } from "@/api/types";
import {
  EM_DASH,
  formatHoldBars,
  formatMoney,
  formatReturnPct,
} from "@/features/reports/formatDiagnostics";

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

export const DIAGNOSTICS_COLUMNS: {
  id: DiagnosticsColumnId;
  header: string;
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
  {
    id: "mfe_pct",
    header: "MFE %",
    cell: (t) => formatReturnPct(t.mfe_pct),
  },
  {
    id: "mae_pct",
    header: "MAE %",
    cell: (t) => formatReturnPct(t.mae_pct),
  },
  {
    id: "captured_pct",
    header: "Capture %",
    cell: (t) => formatReturnPct(t.captured_pct),
  },
  {
    id: "capture_ratio",
    header: "Capture Ratio",
    cell: (t) => formatReturnPct(t.capture_ratio),
  },
  {
    id: "giveback_pct",
    header: "Giveback %",
    cell: (t) => formatReturnPct(t.giveback_pct),
  },
  {
    id: "quality_flags",
    header: "Quality Flags",
    cell: (t) => (t.quality_flags && t.quality_flags.length > 0 ? t.quality_flags.join(", ") : EM_DASH),
  },
];
