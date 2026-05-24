import type { JsonObject } from "@/api/types";

function asObject(value: unknown): JsonObject | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

export function formatEmaParamSummary(source: string, timeframe: string, period: number): string {
  return `${source}/${timeframe}/${period}`;
}

export function readEmaRuleParams(rule: JsonObject): {
  parameters: Record<string, string>;
  emaPeriods: number[];
} {
  const parameters: Record<string, string> = {};
  const emaPeriods: number[] = [];

  for (const key of ["ema", "fast_ema", "slow_ema"] as const) {
    if (!(key in rule)) continue;
    const raw = rule[key];
    if (typeof raw === "number" && Number.isFinite(raw)) {
      parameters[key] = String(raw);
      emaPeriods.push(raw);
      continue;
    }
    const obj = asObject(raw);
    if (!obj) continue;
    const period = obj.period;
    if (typeof period !== "number" || !Number.isFinite(period)) continue;
    const source = typeof obj.source === "string" && obj.source.length > 0 ? obj.source : "close";
    const timeframe =
      typeof obj.timeframe === "string" && obj.timeframe.length > 0 ? obj.timeframe : "base";
    parameters[key] = formatEmaParamSummary(source, timeframe, period);
    emaPeriods.push(period);
  }

  const confirm = rule.confirm_bars;
  if (typeof confirm === "number" && Number.isFinite(confirm)) {
    parameters.confirm_bars = String(confirm);
  }

  return { parameters, emaPeriods };
}
