import type { ExitProfileLabel, JsonObject, TradeRecord } from "@/api/types";
import { readEmaRuleParams } from "@/features/chart/exitPolicyEmaParams";
import { EM_DASH } from "@/features/reports/tradeDiagnosticsFields";

export type ExitComponentGroup = "always_on" | "profile";

export type ExitComponentRow = {
  group: ExitComponentGroup;
  profile: ExitProfileLabel | null;
  component_id: string;
  instance_id: string;
  exit_kind: string;
  parameters: Record<string, string>;
  emaPeriods: number[];
  isClosing: boolean;
  emaAvailabilityHint: string | null;
};

const COMPONENT_ID_EXIT_KIND: Record<string, string> = {
  no_signal_exit: "signal",
  rsi_signal_exit: "signal",
  ema_close_loss_exit: "signal",
  ema_cross_loss_exit: "signal",
  atr_stop_loss: "stop_loss",
  atr_take_profit: "take_profit",
  constant_usd_stop_loss: "stop_loss",
  constant_usd_take_profit: "take_profit",
};

function asObject(value: unknown): JsonObject | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

function readString(rule: JsonObject, key: string): string | null {
  const v = rule[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function resolveExitKind(
  rule: JsonObject,
  trade: TradeRecord,
  isClosing: boolean,
): string {
  const ruleKind = readString(rule, "exit_kind");
  if (ruleKind) return ruleKind;
  if (isClosing && trade.exit_kind) return trade.exit_kind;
  const componentId = readString(rule, "component_id");
  if (componentId && COMPONENT_ID_EXIT_KIND[componentId]) {
    return COMPONENT_ID_EXIT_KIND[componentId];
  }
  return EM_DASH;
}

function readDistanceParams(rule: JsonObject): Record<string, string> {
  const distance = asObject(rule.distance);
  if (!distance) return {};
  const out: Record<string, string> = {};
  for (const key of ["timeframe", "period", "multiplier"] as const) {
    const v = distance[key];
    if (typeof v === "string") out[key] = v;
    else if (typeof v === "number" && Number.isFinite(v)) out[key] = String(v);
  }
  return out;
}

function ruleParameters(rule: JsonObject): { parameters: Record<string, string>; emaPeriods: number[] } {
  const distance = readDistanceParams(rule);
  if (Object.keys(distance).length > 0) {
    return { parameters: distance, emaPeriods: [] };
  }
  return readEmaRuleParams(rule);
}

function parseExitRules(
  exits: unknown,
  group: ExitComponentGroup,
  profile: ExitProfileLabel | null,
  trade: TradeRecord,
  closingInstanceId: string | null | undefined,
): ExitComponentRow[] {
  if (!Array.isArray(exits)) return [];
  const rows: ExitComponentRow[] = [];
  for (const raw of exits) {
    const rule = asObject(raw);
    if (!rule) continue;
    const instance_id = readString(rule, "instance_id");
    const component_id = readString(rule, "component_id");
    if (!instance_id || !component_id) continue;
    const isClosing =
      closingInstanceId !== null &&
      closingInstanceId !== undefined &&
      instance_id === closingInstanceId;
    const { parameters, emaPeriods } = ruleParameters(rule);
    rows.push({
      group,
      profile,
      component_id,
      instance_id,
      exit_kind: resolveExitKind(rule, trade, isClosing),
      parameters,
      emaPeriods,
      isClosing,
      emaAvailabilityHint: null,
    });
  }
  return rows;
}

export type ListActiveExitComponentsResult = {
  rows: ExitComponentRow[];
  warning: string | null;
};

export function readExitPolicy(strategySpec: JsonObject): JsonObject | null {
  const tradeManagement = asObject(strategySpec.trade_management);
  if (!tradeManagement) return null;
  return asObject(tradeManagement.exit_policy);
}

export function listActiveExitComponents(
  exitPolicy: JsonObject | null,
  trade: TradeRecord,
): ListActiveExitComponentsResult {
  if (!exitPolicy) {
    return { rows: [], warning: "exit_policy missing from strategy_spec" };
  }

  const closingInstanceId = trade.exit_instance_id ?? null;
  const alwaysOn = asObject(exitPolicy.always_on);
  const rows: ExitComponentRow[] = [
    ...parseExitRules(alwaysOn?.exits, "always_on", null, trade, closingInstanceId),
  ];

  const activeProfile = trade.active_exit_profile;
  if (!activeProfile) {
    return {
      rows,
      warning: rows.length > 0 ? "active_exit_profile missing — profile exits omitted" : null,
    };
  }

  const profiles = asObject(exitPolicy.profiles);
  const profileBucket = profiles ? asObject(profiles[activeProfile]) : null;
  rows.push(
    ...parseExitRules(profileBucket?.exits, "profile", activeProfile, trade, closingInstanceId),
  );

  return { rows, warning: null };
}
