export const EM_DASH = "—";

export function formatMoney(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EM_DASH;
  return value.toFixed(digits);
}

export function formatWinRate(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EM_DASH;
  return `${(value * 100).toFixed(0)}%`;
}

export function formatReturnPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EM_DASH;
  return `${(value * 100).toFixed(2)}%`;
}

export function formatProfitFactor(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EM_DASH;
  return value.toFixed(2);
}

export function formatHoldBars(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EM_DASH;
  return String(Math.round(value));
}

/** Portfolio fee rate (e.g. 0.001) shown as percent. */
export function formatFeesRate(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EM_DASH;
  return `${(value * 100).toFixed(4)}%`;
}

export function formatFeesPctOfGross(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EM_DASH;
  return `${(value * 100).toFixed(2)}%`;
}

export function formatExitReasonMix(mix: Record<string, number> | undefined): string {
  if (!mix || Object.keys(mix).length === 0) return EM_DASH;
  const sorted = Object.entries(mix).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 3);
  const rest = sorted.length - top.length;
  const text = top.map(([reason, count]) => `${reason} (${count})`).join(", ");
  if (rest > 0) return `${text}, +${rest} more`;
  return text;
}
