import type { JsonObject, TradeManagementSummary, VariantMetrics } from "@/api/types";

export const TRADE_MANAGEMENT_PHASE_ORDER = [
  "initial_risk",
  "proven",
  "protected",
  "runner",
  "exhaustion",
] as const;

export function hasTradeManagementSummary(
  metrics: VariantMetrics,
): metrics is VariantMetrics & { trade_management_summary: TradeManagementSummary } {
  return metrics.trade_management_summary !== undefined && metrics.trade_management_summary !== null;
}

export function phaseRows(summary: TradeManagementSummary): Array<{
  phase: string;
  bucket: NonNullable<TradeManagementSummary["by_phase_reached"]>[string];
}> {
  const byPhase = summary.by_phase_reached;
  if (!byPhase || typeof byPhase !== "object") {
    return [];
  }
  const ordered = TRADE_MANAGEMENT_PHASE_ORDER.filter(
    (phase) => byPhase[phase] !== undefined && byPhase[phase] !== null,
  );
  const extras = Object.keys(byPhase).filter(
    (phase) => !(TRADE_MANAGEMENT_PHASE_ORDER as readonly string[]).includes(phase),
  );
  return [...ordered, ...extras.sort()].map((phase) => ({
    phase,
    bucket: byPhase[phase] ?? {},
  }));
}

export function countMapRows(
  map: Record<string, number> | undefined,
): Array<{ key: string; count: number }> {
  if (!map || typeof map !== "object") {
    return [];
  }
  return Object.entries(map)
    .filter(([, count]) => typeof count === "number")
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, count }));
}

export function jsonObjectField(
  obj: JsonObject | undefined,
  key: string,
): unknown {
  if (!obj || typeof obj !== "object") {
    return undefined;
  }
  return obj[key];
}

export function optionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
}
