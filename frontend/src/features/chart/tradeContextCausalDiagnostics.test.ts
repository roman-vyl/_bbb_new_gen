import { describe, expect, it } from "vitest";

import type { SideSignalTrace, SignalTraceBundle, TradeRecord } from "@/api/types";
import {
  buildEntryBarCausalDiagnostics,
  formatGateDecision,
  formatGateDecisionLabel,
  matchesConsumptionRecord,
  tradeBarIndex,
} from "@/features/chart/tradeContextCausalDiagnostics";

function sideTrace(barCount: number): SideSignalTrace {
  const ok = Array(barCount).fill(true) as boolean[];
  const no = Array(barCount).fill(false) as boolean[];
  return {
    direction_ok: ok,
    blockers_ok: ok,
    setup_ok: ok,
    trigger_ok: ok,
    risk_ok: ok,
    signal_entry: no,
    stop_ready: ok,
    portfolio_entry: no,
    internals: {},
  };
}

function traceFixture(): SignalTraceBundle {
  return {
    times: [1_714_561_400],
    meta: {
      variant: "default",
      component_ids: { direction: "d", setup: "s", trigger: "t", risk: "r" },
      setup_params: { lookback: 50, active_bars: 3 },
      blocker_instances: [{ instance_id: "blocker_main", component_id: "counter_candle_blocker" }],
    },
    htf_context: {
      state: ["down"],
      fast: [1],
      anchor: [1],
      slow: [1],
      meta: { context_ref: "htf", timeframe: "4h", source: "test" },
    },
    context_consumption_trace: [
      {
        role: "blockers",
        component_id: "counter_candle_blocker",
        context_ref: "htf",
        policy_id: "htf_regime_gate",
        context_applied: [false],
        instance_id: "blocker_main",
        outcome: {
          allowed_regimes: ["aligned"],
          evaluated_side: "long",
          raw_state: ["down"],
          resolved_regime: ["countertrend"],
        },
      },
    ],
    long: sideTrace(1),
    short: sideTrace(1),
  };
}

const trade: TradeRecord = {
  trade_id: 1,
  direction: "long",
  status: "closed",
  entry_time_ms: 1_714_561_400_000,
  exit_time_ms: 1_714_561_400_000,
  entry_price: 100,
  exit_price: 101,
  size: 1,
  pnl: 1,
  return_pct: 0.01,
  exit_reason: "unknown",
  entry_context_consumption: {
    role: "blockers",
    component_id: "counter_candle_blocker",
    context_ref: "htf",
    policy_id: "htf_regime_gate",
    applied: false,
    instance_id: "blocker_main",
  },
};

describe("tradeContextCausalDiagnostics", () => {
  it("resolves bar index from entry time", () => {
    const trace = traceFixture();
    expect(tradeBarIndex(trace, trade.entry_time_ms)).toBe(0);
    expect(tradeBarIndex(trace, null)).toBe(-1);
  });

  it("formats gate allow/block", () => {
    expect(formatGateDecision(true)).toBe("allow");
    expect(formatGateDecision(false)).toBe("block");
    expect(formatGateDecisionLabel(false)).toBe("block");
  });

  it("builds entry causal fields from trace", () => {
    const status = buildEntryBarCausalDiagnostics(trade, traceFixture(), "ready", undefined);
    expect(status.kind).toBe("ready");
    if (status.kind !== "ready") {
      return;
    }
    const gate = status.fields.find((f) => f.key === "entry_causal.gate");
    expect(gate?.value).toBe("block");
    expect(status.fields.find((f) => f.key === "entry_causal.raw_state")?.value).toBe("down");
    expect(status.fields.find((f) => f.key === "entry_causal.allowed_regimes")?.value).toBe("aligned");
    expect(status.fields.find((f) => f.key === "entry_causal.resolved_regime")?.value).toBe(
      "countertrend",
    );
    expect(status.fields.find((f) => f.key === "entry_causal.allowed_states")).toBeUndefined();
  });

  it("builds entry causal fields for htf_regime_gate from trace outcome", () => {
    const trace: SignalTraceBundle = {
      ...traceFixture(),
      context_consumption_trace: [
        {
          role: "blockers",
          component_id: "counter_candle_blocker",
          context_ref: "htf",
          policy_id: "htf_regime_gate",
          context_applied: [true],
          instance_id: "blocker_main",
          outcome: {
            allowed_regimes: ["aligned", "neutral"],
            evaluated_side: "long",
            raw_state: ["up"],
            resolved_regime: ["aligned"],
          },
        },
      ],
    };
    const regimeTrade: TradeRecord = {
      ...trade,
      entry_context_consumption: {
        role: "blockers",
        component_id: "counter_candle_blocker",
        context_ref: "htf",
        policy_id: "htf_regime_gate",
        applied: true,
        instance_id: "blocker_main",
      },
    };
    const status = buildEntryBarCausalDiagnostics(regimeTrade, trace, "ready", undefined);
    expect(status.kind).toBe("ready");
    if (status.kind !== "ready") {
      return;
    }
    expect(status.fields.find((f) => f.key === "entry_causal.allowed_regimes")?.value).toBe(
      "aligned, neutral",
    );
    expect(status.fields.find((f) => f.key === "entry_causal.resolved_regime")?.value).toBe(
      "aligned",
    );
    expect(status.fields.find((f) => f.key === "entry_causal.evaluated_side")?.value).toBe("long");
    expect(status.fields.find((f) => f.key === "entry_causal.allowed_states")).toBeUndefined();
  });

  it("reports trace not loaded", () => {
    const status = buildEntryBarCausalDiagnostics(trade, null, "idle", undefined);
    expect(status.kind).toBe("trace_not_loaded");
  });

  it("matches consumption record by context_ref and instance_id", () => {
    const a = {
      role: "blockers",
      component_id: "counter_candle_blocker",
      context_ref: "htf",
      policy_id: "htf_regime_gate",
      context_applied: [true],
      instance_id: "blocker_a",
    };
    const b = {
      role: "blockers",
      component_id: "counter_candle_blocker",
      context_ref: "macro_htf",
      policy_id: "htf_regime_gate",
      context_applied: [false],
      instance_id: "blocker_b",
    };
    const wired = {
      role: "blockers",
      component_id: "counter_candle_blocker",
      context_ref: "macro_htf",
      policy_id: "htf_regime_gate",
      applied: false,
      instance_id: "blocker_b",
    };
    expect(matchesConsumptionRecord(a, wired)).toBe(false);
    expect(matchesConsumptionRecord(b, wired)).toBe(true);
  });

  it("picks the wired blocker trace row when multiple consumers exist", () => {
    const trace: SignalTraceBundle = {
      ...traceFixture(),
      context_consumption_trace: [
        {
          role: "blockers",
          component_id: "counter_candle_blocker",
          context_ref: "htf",
          policy_id: "htf_regime_gate",
          context_applied: [true],
          instance_id: "blocker_a",
          outcome: {
            allowed_regimes: ["aligned"],
            evaluated_side: "long",
            raw_state: ["up"],
            resolved_regime: ["aligned"],
          },
        },
        {
          role: "blockers",
          component_id: "counter_candle_blocker",
          context_ref: "macro_htf",
          policy_id: "htf_regime_gate",
          context_applied: [false],
          instance_id: "blocker_b",
          outcome: {
            allowed_regimes: ["aligned"],
            evaluated_side: "long",
            raw_state: ["down"],
            resolved_regime: ["countertrend"],
          },
        },
      ],
    };
    const wiredTrade: TradeRecord = {
      ...trade,
      entry_context_consumption: {
        role: "blockers",
        component_id: "counter_candle_blocker",
        context_ref: "macro_htf",
        policy_id: "htf_regime_gate",
        applied: false,
        instance_id: "blocker_b",
      },
    };
    const status = buildEntryBarCausalDiagnostics(wiredTrade, trace, "ready", undefined);
    expect(status.kind).toBe("ready");
    if (status.kind !== "ready") {
      return;
    }
    expect(status.fields.find((f) => f.key === "entry_causal.gate")?.value).toBe("block");
    expect(status.fields.find((f) => f.key === "entry_causal.context_ref")?.value).toBe("macro_htf");
    expect(status.fields.find((f) => f.key === "entry_causal.instance_id")?.value).toBe("blocker_b");
  });

  it("reports bar outside trace window", () => {
    const trace = traceFixture();
    const status = buildEntryBarCausalDiagnostics(
      { ...trade, entry_time_ms: 9_999_999_999_000 },
      trace,
      "ready",
      undefined,
    );
    expect(status.kind).toBe("bar_outside_window");
  });
});
