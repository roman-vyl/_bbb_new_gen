import type { AnchorStackPeriods, JsonObject } from "@/api/types";
import type { IndicatorPoint, SignalTraceBundle } from "@/api/types";
import { CHART_OVERLAY_EMA_KIND } from "@/api/types";
import { readExitPolicy } from "@/features/chart/exitPolicyForTrade";
import { readEmaRuleParams } from "@/features/chart/exitPolicyEmaParams";

export type AuxEmaSource = "bff" | "htf_trace";

export type AuxEmaSpec = {
  id: string;
  label: string;
  period: number;
  timeframe: string;
  source: AuxEmaSource;
  htfRole?: "fast" | "anchor" | "slow";
};

function asObject(value: unknown): JsonObject | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

export function resolveComponentTimeframe(raw: unknown, chartTimeframe: string): string | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  if (raw === "base") return chartTimeframe;
  return raw;
}

function isChartTimeframe(timeframe: string, chartTimeframe: string): boolean {
  return timeframe === chartTimeframe;
}

function readHtfPeriod(ctx: JsonObject, key: string): number | null {
  const v = ctx[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function walkExitRules(exitPolicy: JsonObject, visit: (rule: JsonObject) => void): void {
  const alwaysOn = asObject(exitPolicy.always_on);
  if (Array.isArray(alwaysOn?.exits)) {
    for (const raw of alwaysOn.exits) {
      const rule = asObject(raw);
      if (rule) visit(rule);
    }
  }
  const profiles = asObject(exitPolicy.profiles);
  if (!profiles) return;
  for (const profileKey of ["aligned", "countertrend", "neutral"] as const) {
    const bucket = asObject(profiles[profileKey]);
    if (!Array.isArray(bucket?.exits)) continue;
    for (const raw of bucket.exits) {
      const rule = asObject(raw);
      if (rule) visit(rule);
    }
  }
}

/** EMA lines to draw beyond anchor_stack (exit on chart TF + HTF context via trace). */
export function collectAuxEmaSpecs(
  strategySpec: JsonObject,
  chartTimeframe: string,
  anchorStack: AnchorStackPeriods,
): AuxEmaSpec[] {
  const specs: AuxEmaSpec[] = [];
  const seen = new Set<string>();
  const anchorPeriods = new Set([anchorStack.fast, anchorStack.anchor, anchorStack.slow]);

  const exitPolicy = readExitPolicy(strategySpec);
  if (!exitPolicy) return specs;

  const context = asObject(exitPolicy.context);
  if (context) {
    const htfTf = resolveComponentTimeframe(context.timeframe, chartTimeframe) ?? String(context.timeframe ?? "htf");
    for (const [role, periodKey] of [
      ["fast", "fast_period"],
      ["anchor", "anchor_period"],
      ["slow", "slow_period"],
    ] as const) {
      const period = readHtfPeriod(context, periodKey);
      if (period === null) continue;
      const id = `htf_${role}`;
      if (seen.has(id)) continue;
      seen.add(id);
      specs.push({
        id,
        label: `HTF ${role} ${period}/${htfTf}`,
        period,
        timeframe: htfTf,
        source: "htf_trace",
        htfRole: role,
      });
    }
  }

  walkExitRules(exitPolicy, (rule) => {
    const instanceId =
      typeof rule.instance_id === "string" && rule.instance_id.length > 0
        ? rule.instance_id
        : "exit";
    const { parameters } = readEmaRuleParams(rule);

    for (const [paramKey, summary] of Object.entries(parameters)) {
      if (paramKey === "confirm_bars") continue;
      const parts = summary.split("/");
      if (parts.length < 3) continue;
      const period = Number(parts[2]);
      if (!Number.isFinite(period)) continue;
      const ruleTf = resolveComponentTimeframe(parts[1], chartTimeframe);
      if (!ruleTf || !isChartTimeframe(ruleTf, chartTimeframe)) continue;
      if (anchorPeriods.has(period)) continue;

      const id = `exit_${instanceId}_${paramKey}`;
      if (seen.has(id)) continue;
      seen.add(id);
      specs.push({
        id,
        label: `${instanceId} · ${paramKey} ${summary}`,
        period,
        timeframe: ruleTf,
        source: "bff",
      });
    }

    // Legacy numeric-only EMA params on chart TF
    for (const paramKey of ["ema", "fast_ema", "slow_ema"] as const) {
      const raw = rule[paramKey];
      if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
      if (anchorPeriods.has(raw)) continue;
      const id = `exit_${instanceId}_${paramKey}`;
      if (seen.has(id)) continue;
      seen.add(id);
      specs.push({
        id,
        label: `${instanceId} · ${paramKey} ${raw}/${chartTimeframe}`,
        period: raw,
        timeframe: chartTimeframe,
        source: "bff",
      });
    }
  });

  return specs;
}

export function htfEmaPointsFromSignalTrace(
  trace: SignalTraceBundle,
  role: "fast" | "anchor" | "slow",
): IndicatorPoint[] {
  const htf = trace.htf_context;
  if (!htf) return [];
  const values = htf[role];
  const points: IndicatorPoint[] = [];
  for (let i = 0; i < trace.times.length; i += 1) {
    const value = values[i];
    if (value === null || value === undefined || Number.isNaN(value)) continue;
    points.push({
      time: trace.times[i]!,
      value,
      kind: CHART_OVERLAY_EMA_KIND,
    });
  }
  return points;
}

export function auxOverlayFromHtfTrace(
  spec: AuxEmaSpec,
  trace: SignalTraceBundle,
): { id: string; label: string; period: number; timeframe: string; points: IndicatorPoint[]; dashed: boolean } | null {
  if (spec.source !== "htf_trace" || !spec.htfRole) return null;
  const points = htfEmaPointsFromSignalTrace(trace, spec.htfRole);
  if (points.length === 0) return null;
  return {
    id: spec.id,
    label: spec.label,
    period: spec.period,
    timeframe: spec.timeframe,
    points,
    dashed: true,
  };
}
