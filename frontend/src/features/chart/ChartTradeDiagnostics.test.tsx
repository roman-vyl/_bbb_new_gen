/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { SideSignalTrace, SignalTraceBundle, TradeRecord } from "@/api/types";
import { ChartTradeDiagnostics } from "@/features/chart/ChartTradeDiagnostics";

afterEach(() => cleanup());

const traceDefaults = {
  signalTrace: null as SignalTraceBundle | null,
  signalTraceStatus: "idle" as const,
};

const trade: TradeRecord = {
  trade_id: 2,
  direction: "long",
  status: "closed",
  entry_time_ms: 1714561400000,
  exit_time_ms: 1714565400000,
  entry_price: 62800,
  exit_price: 63100,
  size: 0.15,
  pnl: 100,
  return_pct: 0.03,
  exit_reason: "signal:rsi_exit_base",
  entry_profile: "aligned",
  active_exit_profile: "aligned",
  exit_kind: "signal",
  exit_instance_id: "rsi_exit_base",
  exit_component_id: "rsi_signal_exit",
  gross_pnl: 105,
  fees_paid: 5,
};

const strategySpec = {
  anchor_stack: {
    fast: { period: 200 },
    anchor: { period: 500 },
    slow: { period: 1000 },
  },
  trade_management: {
    exit_policy: {
      always_on: {
        exits: [
          {
            instance_id: "atr_sl",
            component_id: "atr_stop_loss",
            exit_kind: "stop_loss",
            distance: { timeframe: "5m", period: 14, multiplier: 2 },
          },
        ],
      },
      profiles: {
        aligned: {
          exits: [
            {
              instance_id: "rsi_exit_base",
              component_id: "rsi_signal_exit",
              exit_kind: "signal",
              ema: { source: "close", timeframe: "base", period: 21 },
            },
          ],
        },
        countertrend: { exits: [] },
        neutral: { exits: [] },
      },
    },
  },
};

describe("ChartTradeDiagnostics", () => {
  it("renders v4 trade fields", () => {
    render(
      <ChartTradeDiagnostics
        trade={trade}
        selectedTradeId={2}
        strategySpec={strategySpec}
        chartEmaOverlays={[]}
        focusWarning={null}
        {...traceDefaults}
      />,
    );
    expect(screen.getByTestId("chart-trade-diagnostics")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Trade #2" })).toBeTruthy();
    expect(screen.getByTestId("trade-status-chip").textContent).toBe("CLOSED");
    expect(screen.queryByText("status")).toBeNull();
    expect(screen.getByTestId("trade-direction-chip").textContent).toBe("LONG");
    expect(screen.queryByText("direction")).toBeNull();
    const result = screen.getByTestId("chart-trade-result");
    expect(result.textContent).toContain("3.00%");
    expect(result.textContent).toContain("100.00");
    expect(result.className).toContain("pnl-positive");
    expect(screen.queryByText("trade_id")).toBeNull();
    expect(screen.getByText("Exit profile")).toBeTruthy();
    expect(screen.getAllByText("aligned").length).toBeGreaterThan(0);
  });

  it("renders v5 entry and exit context consumption attribution", () => {
    render(
      <ChartTradeDiagnostics
        trade={{
          ...trade,
          entry_context_state: "up",
          entry_context_consumption: {
            role: "blockers",
            component_id: "counter_candle_blocker",
            context_ref: "htf",
            policy_id: "htf_regime_gate",
            applied: true,
            instance_id: "blocker_main",
          },
          exit_context_consumption: {
            role: "exit_policy",
            component_id: "exit_policy",
            context_ref: "htf",
            policy_id: "exit_profile_by_htf_state",
            applied: true,
          },
        }}
        selectedTradeId={2}
        strategySpec={strategySpec}
        chartEmaOverlays={[]}
        focusWarning={null}
        {...traceDefaults}
      />,
    );

    expect(screen.getByText("HTF state at entry")).toBeTruthy();
    expect(screen.getByText("Raw context provider state on the entry bar")).toBeTruthy();
    expect(screen.getByText("up")).toBeTruthy();

    expect(
      screen.getByRole("heading", { level: 4, name: "Entry context consumption (configured)" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 4, name: "Exit context consumption (configured)" }),
    ).toBeTruthy();
    expect(screen.getByTestId("chart-trade-entry-causal-empty")).toBeTruthy();

    const contextRefs = screen.getAllByText("htf");
    expect(contextRefs.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("htf_regime_gate")).toBeTruthy();
    expect(screen.getByText("exit_profile_by_htf_state")).toBeTruthy();
    expect(screen.getAllByText("yes").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("blocker_main")).toBeTruthy();
  });

  it("renders entry bar causal gate from signal trace", () => {
    const entryMs = 1_714_561_400_000;
    const side: SideSignalTrace = {
      direction_ok: [true],
      blockers_ok: [true],
      setup_ok: [true],
      trigger_ok: [true],
      risk_ok: [true],
      signal_entry: [false],
      stop_ready: [true],
      portfolio_entry: [false],
      internals: {},
    };
    const trace: SignalTraceBundle = {
      times: [Math.floor(entryMs / 1000)],
      meta: {
        variant: "default",
        component_ids: {
          direction: "d",
          setups: [{ instance_id: "setup", component_id: "s" }],
          trigger: "t",
          risk: "r",
        },
        setup_params: [
          {
            instance_id: "setup",
            component_id: "s",
            lookback: 50,
            active_bars: 3,
          },
        ],
        blocker_instances: [{ instance_id: "blocker_main", component_id: "counter_candle_blocker" }],
      },
      htf_context: {
        state: ["down"],
        fast: [1],
        anchor: [1],
        slow: [1],
        meta: { context_ref: "htf" },
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
      long: side,
      short: side,
    };

    render(
      <ChartTradeDiagnostics
        trade={{
          ...trade,
          entry_time_ms: entryMs,
          entry_context_consumption: {
            role: "blockers",
            component_id: "counter_candle_blocker",
            context_ref: "htf",
            policy_id: "htf_regime_gate",
            applied: false,
            instance_id: "blocker_main",
          },
        }}
        selectedTradeId={2}
        strategySpec={strategySpec}
        chartEmaOverlays={[]}
        focusWarning={null}
        signalTrace={trace}
        signalTraceStatus="ready"
      />,
    );

    expect(screen.getByRole("heading", { level: 4, name: "Entry bar decision" })).toBeTruthy();
    expect(screen.getByText("block")).toBeTruthy();
    expect(screen.getAllByText("down").length).toBeGreaterThan(0);
    expect(screen.getAllByText("aligned").length).toBeGreaterThan(0);
  });

  it("renders v5 trade quality diagnostics", () => {
    render(
      <ChartTradeDiagnostics
        trade={{
          ...trade,
          mfe_pct: 0.042,
          mae_pct: -0.008,
          captured_pct: 0.031,
          capture_ratio: 0.74,
          giveback_pct: 0.011,
          bars_to_mfe: 18,
          bars_from_mfe_to_exit: 7,
          quality_flags: ["signal_exit_winner", "high_mfe_high_capture"],
        }}
        selectedTradeId={2}
        strategySpec={strategySpec}
        chartEmaOverlays={[]}
        focusWarning={null}
        {...traceDefaults}
      />,
    );

    expect(screen.getByText("MFE")).toBeTruthy();
    expect(screen.getByText("макс. ход в плюс от ТВХ")).toBeTruthy();
    expect(screen.getByText("4.20%")).toBeTruthy();
    expect(screen.getByText("MAE")).toBeTruthy();
    expect(screen.getByText("макс. ход против ТВХ")).toBeTruthy();
    expect(screen.getByText("-0.80%")).toBeTruthy();
    expect(screen.getByText("Capture ratio")).toBeTruthy();
    expect(screen.getByText("доля забранного хода")).toBeTruthy();
    expect(screen.getByText("74.00%")).toBeTruthy();
    expect(screen.getByText("Bars to MFE")).toBeTruthy();
    expect(screen.getByText("свечей до пика")).toBeTruthy();
    expect(screen.getByText("18")).toBeTruthy();
    expect(screen.getByText("Quality flags")).toBeTruthy();
    expect(screen.getByText("ярлыки качества")).toBeTruthy();
    expect(
      screen.getByText(
        "сигнал выхода сработал хорошо, сильный ход + хороший выход",
      ),
    ).toBeTruthy();
  });

  it("colors loss result red", () => {
    render(
      <ChartTradeDiagnostics
        trade={{ ...trade, pnl: -39.73, return_pct: -0.0074 }}
        selectedTradeId={2}
        strategySpec={strategySpec}
        chartEmaOverlays={[]}
        focusWarning={null}
        {...traceDefaults}
      />,
    );
    const result = screen.getByTestId("chart-trade-result");
    expect(result.className).toContain("pnl-negative");
    expect(result.textContent).toContain("-0.74%");
    expect(result.textContent).toContain("-39.73");
  });

  it("highlights closing exit component", () => {
    render(
      <ChartTradeDiagnostics
        trade={trade}
        selectedTradeId={2}
        strategySpec={strategySpec}
        chartEmaOverlays={[]}
        focusWarning={null}
        {...traceDefaults}
      />,
    );
    expect(screen.getByTestId("closing-exit-component")).toBeTruthy();
  });

  it("shows stale empty state when trade missing", () => {
    render(
      <ChartTradeDiagnostics
        trade={undefined}
        selectedTradeId={99}
        strategySpec={strategySpec}
        chartEmaOverlays={[]}
        focusWarning="Trade #99 not found in variant trade_records."
        {...traceDefaults}
      />,
    );
    expect(screen.getByTestId("chart-trade-diagnostics-stale")).toBeTruthy();
    expect(screen.queryByTestId("active-exit-components")).toBeNull();
  });
});
