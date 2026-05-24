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
      hint: `EMA ${period} loaded as auxiliary overlay`,
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
    const periods = row.emaPeriods;
    if (periods.length === 0) {
      return { ...row, emaAvailabilityHint: null };
    }
    const hints = periods.map(
      (p) => classifyEmaPeriodAvailability(p, anchorStack, chartEmaOverlays).hint,
    );
    return { ...row, emaAvailabilityHint: hints.join(" · ") };
  });
}
