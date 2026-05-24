import type { AnchorStackEmaRole, ChartEmaOverlay } from "@/api/types";
import type { AnchorStackPeriods } from "@/features/chart/anchorStackFromSpec";
import type { ExitComponentRow } from "@/features/chart/exitPolicyForTrade";

export type EmaAvailabilityStatus =
  | "anchor_stack"
  | "in_bundle"
  | "unavailable"
  | "not_ema_rule";

export type EmaAvailabilityInfo = {
  status: EmaAvailabilityStatus;
  hint: string;
  period: number | null;
  anchorRole: AnchorStackEmaRole | null;
};

function readEmaPeriodsFromRule(parameters: Record<string, string | number>): number[] {
  const periods: number[] = [];
  for (const key of ["ema", "fast_ema", "slow_ema"] as const) {
    const v = parameters[key];
    if (typeof v === "number" && Number.isFinite(v)) periods.push(v);
  }
  return periods;
}

function anchorRoleForPeriod(
  periods: AnchorStackPeriods,
  period: number,
): AnchorStackEmaRole | null {
  if (period === periods.fast) return "fast";
  if (period === periods.anchor) return "anchor";
  if (period === periods.slow) return "slow";
  return null;
}

export function classifyEmaPeriodAvailability(
  period: number,
  anchorStack: AnchorStackPeriods | null,
  chartEmaOverlays: ChartEmaOverlay[],
): EmaAvailabilityInfo {
  if (anchorStack) {
    const role = anchorRoleForPeriod(anchorStack, period);
    if (role) {
      return {
        status: "anchor_stack",
        period,
        anchorRole: role,
        hint: `Shown as anchor stack EMA ${role} (${period})`,
      };
    }
  }

  const inBundle = chartEmaOverlays.some((o) => o.period === period);
  if (inBundle) {
    return {
      status: "in_bundle",
      period,
      anchorRole: null,
      hint: `EMA ${period} available in chart bundle (not drawn separately in v1)`,
    };
  }

  return {
    status: "unavailable",
    period,
    anchorRole: null,
    hint: `EMA overlay unavailable for period ${period} (requires BFF in a follow-up)`,
  };
}

export function attachEmaAvailabilityHints(
  rows: ExitComponentRow[],
  anchorStack: AnchorStackPeriods | null,
  chartEmaOverlays: ChartEmaOverlay[],
): ExitComponentRow[] {
  return rows.map((row) => {
    const periods = readEmaPeriodsFromRule(row.parameters);
    if (periods.length === 0) {
      return { ...row, emaAvailabilityHint: null };
    }
    const hints = periods.map(
      (p) => classifyEmaPeriodAvailability(p, anchorStack, chartEmaOverlays).hint,
    );
    return { ...row, emaAvailabilityHint: hints.join(" · ") };
  });
}
