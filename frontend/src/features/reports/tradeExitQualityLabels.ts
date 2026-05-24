export type TradeExitQualityFlagId =
  | "high_mfe_high_capture"
  | "high_mfe_low_capture"
  | "signal_exit_winner"
  | "signal_exit_giveback_failure"
  | "stop_loss_after_low_mfe"
  | "stop_loss_after_bad_context";

export type TradeExitQualityMetricKey =
  | "mfe_pct"
  | "mae_pct"
  | "captured_pct"
  | "capture_ratio"
  | "giveback_pct"
  | "bars_to_mfe"
  | "bars_from_mfe_to_exit"
  | "quality_flags";

const QUALITY_FLAG_LABELS: Record<TradeExitQualityFlagId, string> = {
  high_mfe_high_capture: "сильный ход + хороший выход",
  high_mfe_low_capture: "сильный ход, но плохо забрали",
  signal_exit_winner: "сигнал выхода сработал хорошо",
  signal_exit_giveback_failure: "сигнал выхода отдал импульс",
  stop_loss_after_low_mfe: "стоп без нормального движения",
  stop_loss_after_bad_context: "стоп в плохом контексте",
};

const CHART_METRIC_LABELS: Record<
  TradeExitQualityMetricKey,
  { label: string; hint: string }
> = {
  mfe_pct: { label: "MFE", hint: "макс. ход в плюс от ТВХ" },
  mae_pct: { label: "MAE", hint: "макс. ход против ТВХ" },
  captured_pct: { label: "Captured", hint: "забрано на выходе" },
  capture_ratio: { label: "Capture ratio", hint: "доля забранного хода" },
  giveback_pct: { label: "Giveback", hint: "отдано после пика" },
  bars_to_mfe: { label: "Bars to MFE", hint: "свечей до пика" },
  bars_from_mfe_to_exit: {
    label: "Bars from MFE to exit",
    hint: "свечей после пика",
  },
  quality_flags: { label: "Quality flags", hint: "ярлыки качества" },
};

const TABLE_COLUMN_LABELS: Record<
  TradeExitQualityMetricKey,
  { header: string; hint: string }
> = {
  mfe_pct: { header: "MFE %", hint: "макс. плюс" },
  mae_pct: { header: "MAE %", hint: "макс. против" },
  captured_pct: { header: "Capture %", hint: "забрано" },
  capture_ratio: { header: "Capture ratio", hint: "доля хода" },
  giveback_pct: { header: "Giveback %", hint: "отдано" },
  bars_to_mfe: { header: "Bars to MFE", hint: "свечей до пика" },
  bars_from_mfe_to_exit: {
    header: "Bars from MFE to exit",
    hint: "свечей после пика",
  },
  quality_flags: { header: "Quality flags", hint: "ярлыки" },
};

export function isTradeExitQualityMetricKey(key: string): key is TradeExitQualityMetricKey {
  return key in CHART_METRIC_LABELS;
}

export function chartMetricLabel(key: TradeExitQualityMetricKey): string {
  return CHART_METRIC_LABELS[key].label;
}

export function chartMetricHint(key: TradeExitQualityMetricKey): string {
  return CHART_METRIC_LABELS[key].hint;
}

export function tableColumnHeader(key: TradeExitQualityMetricKey): string {
  return TABLE_COLUMN_LABELS[key].header;
}

export function tableColumnHint(key: TradeExitQualityMetricKey): string {
  return TABLE_COLUMN_LABELS[key].hint;
}

export function qualityFlagLabel(flagId: string): string {
  return QUALITY_FLAG_LABELS[flagId as TradeExitQualityFlagId] ?? flagId;
}

export function formatQualityFlags(flags: readonly string[] | null | undefined): string {
  if (!flags || flags.length === 0) return "";
  return flags.map((flag) => qualityFlagLabel(flag)).join(", ");
}

export const QUALITY_FLAG_FILTER_OPTIONS = [
  { id: "all" as const, label: "Все" },
  ...(Object.entries(QUALITY_FLAG_LABELS) as [TradeExitQualityFlagId, string][]).map(
    ([id, label]) => ({ id, label }),
  ),
];
