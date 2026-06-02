import type { SideSignalTrace } from "@/api/types";
import { formatBool, formatChartPrice } from "@/features/chart/signalTraceLookup";

/** Per-bar arrays under `side.internals.exit_management` (research Signal Trace). */
export type ExitManagementInternals = Record<string, Array<boolean | number | string | null>>;

const PRICE_FIELDS = new Set([
  "effective_stop_price",
  "pending_stop_price",
  "break_even_trigger_price",
  "break_even_stop_moved_to",
  "break_even_initial_risk",
]);

const FIELD_LABELS: Record<string, string> = {
  effective_stop_price: "effective stop",
  pending_stop_price: "pending stop",
  break_even_active: "break-even active",
  break_even_triggered_on_bar: "triggered on bar",
  break_even_trigger_price: "trigger price",
  break_even_stop_moved_to: "stop moved to",
  break_even_initial_risk: "initial risk (1R)",
  break_even_instance_id: "rule instance",
  active_stop_management_source: "management source",
};

export function readExitManagementInternals(
  side: SideSignalTrace,
): ExitManagementInternals | undefined {
  const root = side.internals;
  if (!root || typeof root !== "object") {
    return undefined;
  }
  const raw = (root as Record<string, unknown>).exit_management;
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  return raw as ExitManagementInternals;
}

export function exitManagementFieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

export function formatExitManagementFieldValue(
  key: string,
  raw: boolean | number | string | null | undefined,
  priceDecimals: number,
): string {
  if (raw === null || raw === undefined) {
    return "—";
  }
  if (typeof raw === "boolean") {
    return formatBool(raw);
  }
  if (typeof raw === "number" && PRICE_FIELDS.has(key)) {
    return formatChartPrice(raw, priceDecimals);
  }
  return String(raw);
}

export function exitManagementActiveAtBar(
  fields: ExitManagementInternals | undefined,
  index: number,
): boolean {
  if (!fields) {
    return false;
  }
  const active = fields.break_even_active?.[index];
  if (active === true) {
    return true;
  }
  for (const key of PRICE_FIELDS) {
    const v = fields[key]?.[index];
    if (v !== null && v !== undefined && !(typeof v === "number" && Number.isNaN(v))) {
      return true;
    }
  }
  const instance = fields.break_even_instance_id?.[index];
  return instance !== null && instance !== undefined && String(instance).length > 0;
}
