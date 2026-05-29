import type {
  ContextConsumptionAttribution,
  ContextConsumptionTraceRecord,
  JsonObject,
  SignalTraceBundle,
  TradeRecord,
} from "@/api/types";
import { barIndexAtTime } from "@/features/chart/signalTraceLookup";
import { EM_DASH, type TradeDiagnosticField } from "@/features/reports/tradeDiagnosticsFields";
import type { SignalTraceLoadStatus } from "@/shared/context/signalTraceLoadPolicy";

export type CausalSectionStatus =
  | { kind: "ready"; fields: TradeDiagnosticField[] }
  | { kind: "trace_not_loaded" }
  | { kind: "bar_outside_window"; barLabel: string }
  | { kind: "no_consumer_trace" };

export function formatGateDecision(applied: boolean): "allow" | "block" {
  return applied ? "allow" : "block";
}

export function formatGateDecisionLabel(applied: boolean): string {
  return formatGateDecision(applied);
}

/** Re-export for Bar Inspector parity. */
export { formatBool } from "@/features/chart/signalTraceLookup";

export function tradeBarIndex(
  trace: SignalTraceBundle,
  timeMs: number | null | undefined,
): number {
  if (timeMs === null || timeMs === undefined || trace.times.length === 0) {
    return -1;
  }
  const timeSec = Math.floor(timeMs / 1000);
  const times = trace.times;
  if (timeSec < times[0] || timeSec > times[times.length - 1]) {
    return -1;
  }
  const index = barIndexAtTime(times, timeSec);
  if (index < 0 || index >= times.length) {
    return -1;
  }
  return index;
}

function field(
  key: string,
  label: string,
  value: string,
  hint?: string,
): TradeDiagnosticField {
  return hint ? { key, label, value, hint } : { key, label, value };
}

function traceHtfContextRef(trace: SignalTraceBundle): string | null {
  const meta = trace.htf_context?.meta;
  if (!meta || typeof meta.context_ref !== "string") {
    return null;
  }
  return meta.context_ref;
}

function htfStateAtIndex(trace: SignalTraceBundle, index: number, contextRef: string): string {
  const traceRef = traceHtfContextRef(trace);
  if (traceRef !== contextRef || !trace.htf_context?.state?.length) {
    return EM_DASH;
  }
  if (index < 0 || index >= trace.htf_context.state.length) {
    return EM_DASH;
  }
  return String(trace.htf_context.state[index] ?? EM_DASH);
}

export type ConsumptionIdentity = Pick<
  ContextConsumptionAttribution,
  "role" | "component_id" | "policy_id" | "context_ref" | "instance_id"
>;

/** Match trace consumer row to trade wiring (v5 attribution identity). */
export function matchesConsumptionRecord(
  record: ContextConsumptionTraceRecord,
  wired: ConsumptionIdentity,
): boolean {
  if (record.role !== wired.role) {
    return false;
  }
  if (record.component_id !== wired.component_id) {
    return false;
  }
  if (record.policy_id !== wired.policy_id) {
    return false;
  }
  if (record.context_ref !== wired.context_ref) {
    return false;
  }
  if (wired.instance_id != null && wired.instance_id !== "") {
    return record.instance_id === wired.instance_id;
  }
  return true;
}

function findBlockerTraceRecord(
  trace: SignalTraceBundle,
  trade: TradeRecord,
): ContextConsumptionTraceRecord | undefined {
  const wired = trade.entry_context_consumption;
  if (!wired) {
    return undefined;
  }
  return (trace.context_consumption_trace ?? []).find((r) => matchesConsumptionRecord(r, wired));
}

function findExitPolicyTraceRecord(
  trace: SignalTraceBundle,
  trade: TradeRecord,
): ContextConsumptionTraceRecord | undefined {
  const wired = trade.exit_context_consumption;
  if (!wired) {
    return undefined;
  }
  return (trace.context_consumption_trace ?? []).find((r) => matchesConsumptionRecord(r, wired));
}

function joinList(values: unknown[] | undefined): string | null {
  if (!values?.length) {
    return null;
  }
  return values.map(String).join(", ");
}

function stringAtIndex(series: unknown, index: number): string | null {
  if (!Array.isArray(series) || index < 0 || index >= series.length) {
    return null;
  }
  const value = series[index];
  return value === null || value === undefined ? null : String(value);
}

function allowedStatesFromTraceOutcome(
  record: ContextConsumptionTraceRecord,
): string | null {
  const outcome = record.outcome;
  if (!outcome || !Array.isArray(outcome.allowed_states)) {
    return null;
  }
  return joinList(outcome.allowed_states as unknown[]);
}

function allowedRegimesFromTraceOutcome(
  record: ContextConsumptionTraceRecord,
): string | null {
  const outcome = record.outcome;
  if (!outcome || !Array.isArray(outcome.allowed_regimes)) {
    return null;
  }
  return joinList(outcome.allowed_regimes as unknown[]);
}

function policyParamsFromSpec(
  strategySpec: JsonObject | undefined,
  contextRef: string,
  policyId: string,
): JsonObject | null {
  if (!strategySpec) {
    return null;
  }
  const components = strategySpec.components as JsonObject | undefined;
  const blockers = components?.blockers;
  if (!Array.isArray(blockers)) {
    return null;
  }
  for (const rule of blockers) {
    if (!rule || typeof rule !== "object") {
      continue;
    }
    const consumption = (rule as JsonObject).context_consumption as JsonObject | undefined;
    if (!consumption || consumption.context_ref !== contextRef) {
      continue;
    }
    const policy = consumption.policy as JsonObject | undefined;
    if (policy?.policy_id !== policyId) {
      continue;
    }
    const params = policy.params;
    if (params && typeof params === "object" && !Array.isArray(params)) {
      return params as JsonObject;
    }
  }
  return null;
}

function allowedStatesFromSpec(
  strategySpec: JsonObject | undefined,
  contextRef: string,
  policyId: string,
): string | null {
  const params = policyParamsFromSpec(strategySpec, contextRef, policyId);
  const raw = params?.allowed_states;
  return Array.isArray(raw) ? joinList(raw as unknown[]) : null;
}

function allowedRegimesFromSpec(
  strategySpec: JsonObject | undefined,
  contextRef: string,
  policyId: string,
): string | null {
  const params = policyParamsFromSpec(strategySpec, contextRef, policyId);
  const raw = params?.allowed_regimes;
  return Array.isArray(raw) ? joinList(raw as unknown[]) : null;
}

export function buildEntryBarCausalDiagnostics(
  trade: TradeRecord,
  trace: SignalTraceBundle | null,
  signalTraceStatus: SignalTraceLoadStatus,
  strategySpec: JsonObject | undefined,
): CausalSectionStatus {
  if (signalTraceStatus !== "ready" || trace === null) {
    return { kind: "trace_not_loaded" };
  }

  const index = tradeBarIndex(trace, trade.entry_time_ms);
  if (index < 0 || index >= trace.times.length) {
    return { kind: "bar_outside_window", barLabel: "entry" };
  }

  const record = findBlockerTraceRecord(trace, trade);
  if (!record) {
    return { kind: "no_consumer_trace" };
  }

  const applied = record.context_applied[index] ?? false;
  const isRegimeGate = record.policy_id === "htf_regime_gate";
  const outcome = record.outcome ?? {};
  const rawState =
    stringAtIndex(outcome.raw_state, index) ??
    htfStateAtIndex(trace, index, record.context_ref);
  const resolvedRegime = stringAtIndex(outcome.resolved_regime, index);
  const evaluatedSide =
    typeof outcome.evaluated_side === "string" ? outcome.evaluated_side : null;

  const fields: TradeDiagnosticField[] = [
    field(
      "entry_causal.gate",
      "gate",
      formatGateDecisionLabel(applied),
      isRegimeGate
        ? "htf_regime_gate allow/block on the entry bar (from signal trace)"
        : "htf_state_gate allow/block on the entry bar (from signal trace)",
    ),
    field(
      "entry_causal.raw_state",
      "raw_state",
      rawState,
      "Raw HTF provider state on the entry bar",
    ),
    field("entry_causal.context_ref", "context_ref", record.context_ref),
    field("entry_causal.policy_id", "policy_id", record.policy_id),
    field("entry_causal.component_id", "component_id", record.component_id),
  ];

  if (isRegimeGate) {
    const allowedRegimes =
      allowedRegimesFromTraceOutcome(record) ??
      allowedRegimesFromSpec(strategySpec, record.context_ref, record.policy_id) ??
      EM_DASH;
    fields.push(field("entry_causal.allowed_regimes", "allowed_regimes", allowedRegimes));
    if (evaluatedSide) {
      fields.push(field("entry_causal.evaluated_side", "evaluated_side", evaluatedSide));
    }
    if (resolvedRegime) {
      fields.push(field("entry_causal.resolved_regime", "resolved_regime", resolvedRegime));
    }
  } else {
    const allowedStates =
      allowedStatesFromTraceOutcome(record) ??
      allowedStatesFromSpec(strategySpec, record.context_ref, record.policy_id) ??
      EM_DASH;
    fields.push(field("entry_causal.allowed_states", "allowed_states", allowedStates));
  }
  if (record.instance_id) {
    fields.push(field("entry_causal.instance_id", "instance_id", record.instance_id));
  }

  return { kind: "ready", fields };
}

export function buildExitBarCausalDiagnostics(
  trade: TradeRecord,
  trace: SignalTraceBundle | null,
  signalTraceStatus: SignalTraceLoadStatus,
): CausalSectionStatus {
  if (trade.status !== "closed") {
    return { kind: "no_consumer_trace" };
  }
  if (signalTraceStatus !== "ready" || trace === null) {
    return { kind: "trace_not_loaded" };
  }

  const index = tradeBarIndex(trace, trade.exit_time_ms);
  if (index < 0 || index >= trace.times.length) {
    return { kind: "bar_outside_window", barLabel: "exit" };
  }

  const record = findExitPolicyTraceRecord(trace, trade);
  if (!record) {
    return { kind: "no_consumer_trace" };
  }

  const outcome = record.outcome ?? {};
  const profileKey = trade.direction === "long" ? "profile_long" : "profile_short";
  const profiles = outcome[profileKey];
  const profileAtBar =
    Array.isArray(profiles) && index < profiles.length
      ? String(profiles[index] ?? EM_DASH)
      : EM_DASH;

  const fields: TradeDiagnosticField[] = [
    field(
      "exit_causal.profile",
      "exit profile",
      profileAtBar,
      "Active exit profile bucket on the exit bar (from trace outcome)",
    ),
    field(
      "exit_causal.htf_state",
      "HTF state",
      htfStateAtIndex(trace, index, record.context_ref),
      "Raw HTF provider state on the exit bar",
    ),
    field("exit_causal.context_ref", "context_ref", record.context_ref),
    field("exit_causal.policy_id", "policy_id", record.policy_id),
  ];

  return { kind: "ready", fields };
}

export function causalEmptyMessage(status: CausalSectionStatus): string {
  switch (status.kind) {
    case "trace_not_loaded":
      return "Bar-level gate decisions require a loaded signal trace for this chart window.";
    case "bar_outside_window":
      return `The trade ${status.barLabel} bar is outside the loaded signal trace window. Pan/zoom or reload trace.`;
    case "no_consumer_trace":
      return "No context consumption trace for this consumer on the loaded window.";
    default:
      return "";
  }
}
