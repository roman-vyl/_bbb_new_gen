import { describe, expect, it } from "vitest";

import type { TradeRecord } from "@/api/types";
import {
  buildTradeManagementDiagnosticFields,
  formatPrice,
  hasManagedTradeManagementFields,
} from "@/features/reports/tradeDiagnosticsFields";

describe("formatPrice", () => {
  it("rounds exit-style prices to one decimal", () => {
    expect(formatPrice(80392.42142857143, 1)).toBe("80392.4");
  });

  it("trims trailing zeros for whole prices", () => {
    expect(formatPrice(62800, 1)).toBe("62800");
  });
});

describe("buildTradeManagementDiagnosticFields", () => {
  const baseTrade: TradeRecord = {
    trade_id: "long:10",
    direction: "long",
    status: "closed",
    entry_time_ms: 1,
    exit_time_ms: 2,
    entry_price: 100,
    exit_price: 101,
    size: 1,
    pnl: 1,
    return_pct: 0.01,
    exit_reason: "exit_management:be",
    exit_layer: "exit_management",
    managed_exit_candidate_type: "managed_stop",
    trade_management: {
      phase_at_exit: "protected",
      max_phase_reached: "protected",
      exit_layer: "exit_management",
      exit_rule_id: "be_at_protected",
      exit_component_id: "break_even_stop",
      exit_candidate_type: "managed_stop",
      active_stop_at_exit: 100,
      active_take_at_exit: "disable_initial_tp",
      managed_events: [
        {
          trade_id: "long:10",
          bar_index: 1,
          side: "long",
          event_type: "active_stop_updated",
        },
      ],
    },
  };

  it("includes managed attribution fields when present", () => {
    const fields = buildTradeManagementDiagnosticFields(baseTrade);
    const labels = fields.map((f) => f.label);
    expect(labels).toContain("active_stop_at_exit");
    expect(labels).toContain("exit_candidate_type");
    expect(labels).toContain("managed_events");
    expect(labels).toContain("exit_layer (record)");
    expect(hasManagedTradeManagementFields(baseTrade.trade_management!)).toBe(true);
  });

  it("returns empty list when trade_management is absent", () => {
    expect(buildTradeManagementDiagnosticFields({ ...baseTrade, trade_management: undefined })).toEqual([]);
  });
});

