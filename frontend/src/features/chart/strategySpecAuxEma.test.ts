import { describe, expect, it } from "vitest";

import { CHART_OVERLAY_EMA_KIND } from "@/api/types";
import {
  collectAuxEmaSpecs,
  htfEmaPointsFromSignalTrace,
} from "@/features/chart/strategySpecAuxEma";

const anchorStack = { fast: 200, anchor: 500, slow: 1000 };

const strategySpec = {
  anchor_stack: {
    fast: { period: 200 },
    anchor: { period: 500 },
    slow: { period: 1000 },
  },
  contexts: {
    htf: {
      component_id: "htf_context",
      timeframe: "4h",
      fast_period: 100,
      anchor_period: 200,
      slow_period: 1000,
    },
  },
  trade_management: {
    exit_policy: {
      always_on: { exits: [] },
      profiles: {
        aligned: {
          exits: [
            {
              instance_id: "ema_close",
              component_id: "ema_close_loss_exit",
              ema: { source: "close", timeframe: "base", period: 500 },
            },
            {
              instance_id: "ema_cross",
              component_id: "ema_cross_loss_exit",
              fast_ema: { source: "close", timeframe: "base", period: 21 },
              slow_ema: { source: "close", timeframe: "base", period: 800 },
            },
          ],
        },
        countertrend: { exits: [] },
        neutral: { exits: [] },
      },
    },
  },
};

describe("collectAuxEmaSpecs", () => {
  it("includes HTF context when explicit overlay ref is selected", () => {
    const specs = collectAuxEmaSpecs(strategySpec, "5m", anchorStack, "htf");
    expect(specs.some((s) => s.id === "htf_fast" && s.source === "htf_trace")).toBe(true);
    expect(specs.some((s) => s.id === "exit_ema_cross_fast_ema")).toBe(true);
    expect(specs.some((s) => s.id === "exit_ema_cross_slow_ema")).toBe(true);
    expect(specs.some((s) => s.id.startsWith("exit_ema_close"))).toBe(false);
  });

  it("does not infer HTF overlay from legacy exit_policy.context", () => {
    const legacy = {
      ...strategySpec,
      contexts: {},
      trade_management: {
        exit_policy: {
          context: {
            component_id: "htf_context",
            timeframe: "4h",
            fast_period: 100,
            anchor_period: 200,
            slow_period: 1000,
          },
          always_on: { exits: [] },
          profiles: strategySpec.trade_management.exit_policy.profiles,
        },
      },
    };
    const specs = collectAuxEmaSpecs(legacy, "5m", anchorStack, null);
    expect(specs.some((s) => s.source === "htf_trace")).toBe(false);
  });
});

describe("htfEmaPointsFromSignalTrace", () => {
  it("maps trace times to indicator points", () => {
    const points = htfEmaPointsFromSignalTrace(
      {
        times: [100, 200],
        meta: {} as never,
        long: {} as never,
        short: {} as never,
        htf_context: {
          state: ["up", "up"],
          fast: [1, 2],
          anchor: [3, 4],
          slow: [5, 6],
          meta: {},
        },
      },
      "fast",
    );
    expect(points).toEqual([
      { time: 100, value: 1, kind: CHART_OVERLAY_EMA_KIND },
      { time: 200, value: 2, kind: CHART_OVERLAY_EMA_KIND },
    ]);
  });
});
