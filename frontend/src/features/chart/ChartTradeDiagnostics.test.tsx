/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { TradeRecord } from "@/api/types";
import { ChartTradeDiagnostics } from "@/features/chart/ChartTradeDiagnostics";

afterEach(() => cleanup());

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
      />,
    );
    expect(screen.getByTestId("chart-trade-diagnostics")).toBeTruthy();
    expect(screen.getByText("active_exit_profile")).toBeTruthy();
    expect(screen.getAllByText("aligned").length).toBeGreaterThan(0);
  });

  it("highlights closing exit component", () => {
    render(
      <ChartTradeDiagnostics
        trade={trade}
        selectedTradeId={2}
        strategySpec={strategySpec}
        chartEmaOverlays={[]}
        focusWarning={null}
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
      />,
    );
    expect(screen.getByTestId("chart-trade-diagnostics-stale")).toBeTruthy();
    expect(screen.queryByTestId("active-exit-components")).toBeNull();
  });
});
