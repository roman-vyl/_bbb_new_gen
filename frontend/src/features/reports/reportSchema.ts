import type { VariantMetrics } from "@/api/types";

export function isDiagnosticsV4(reportSchemaVersion: number): boolean {
  return reportSchemaVersion === 4 || reportSchemaVersion === 5 || reportSchemaVersion === 6;
}

export function hasVariantDiagnostics(metrics: VariantMetrics): boolean {
  return (
    metrics.fee_diagnostics !== undefined ||
    metrics.profile_breakdown !== undefined ||
    metrics.exit_reason_breakdown !== undefined ||
    metrics.quality_flag_breakdown !== undefined ||
    metrics.exit_component_quality_breakdown !== undefined ||
    metrics.trade_management_summary !== undefined ||
    metrics.baseline_vs_managed_summary !== undefined
  );
}
