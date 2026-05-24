import { describe, expect, it } from "vitest";

import type { TradeRecord } from "@/api/types";
import { listActiveExitComponents, resolveExitKind } from "@/features/chart/exitPolicyForTrade";

const baseTrade: TradeRecord = {
  trade_id: 1,
  direction: "long",
  status: "closed",
  entry_time_ms: 1,
  exit_time_ms: 2,
  entry_price: 100,
  exit_price: 101,
  exit_reason: "signal:rsi_exit_base",
  size: 1,
  pnl: 1,
  return_pct: 0.01,
  active_exit_profile: "aligned",
  exit_instance_id: "rsi_exit_base",
  exit_kind: "signal",
};

const exitPolicy = {
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
          ema: 21,
          confirm_bars: 2,
        },
      ],
    },
    countertrend: { exits: [] },
    neutral: { exits: [] },
  },
};

describe("resolveExitKind", () => {
  it("prefers rule.exit_kind over component_id heuristic", () => {
    const kind = resolveExitKind(
      { component_id: "atr_stop_loss", exit_kind: "signal" },
      baseTrade,
      false,
    );
    expect(kind).toBe("signal");
  });

  it("uses trade.exit_kind only for closing row", () => {
    const rule = { component_id: "atr_stop_loss" };
    expect(resolveExitKind(rule, baseTrade, true)).toBe("signal");
    expect(resolveExitKind(rule, baseTrade, false)).toBe("stop_loss");
  });
});

describe("listActiveExitComponents", () => {
  it("lists always_on and profile exits", () => {
    const { rows } = listActiveExitComponents(exitPolicy, baseTrade);
    expect(rows).toHaveLength(2);
    expect(rows[0].group).toBe("always_on");
    expect(rows[1].group).toBe("profile");
    expect(rows[1].profile).toBe("aligned");
  });

  it("marks closing component", () => {
    const { rows } = listActiveExitComponents(exitPolicy, baseTrade);
    const closing = rows.find((r) => r.isClosing);
    expect(closing?.instance_id).toBe("rsi_exit_base");
  });
});
