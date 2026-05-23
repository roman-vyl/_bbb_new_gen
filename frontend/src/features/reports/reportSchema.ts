import type { VariantMetrics } from "@/api/types";

export function isDiagnosticsV4(reportSchemaVersion: number): boolean {
  return reportSchemaVersion === 4;
}

export function hasVariantDiagnostics(metrics: VariantMetrics): boolean {
  return (
    metrics.fee_diagnostics !== undefined ||
    metrics.profile_breakdown !== undefined ||
    metrics.exit_reason_breakdown !== undefined
  );
}
