import { describe, expect, it } from "vitest";

import type { TradeManagementEvent, TradeRecord } from "@/api/types";
import {
  buildComponentEventChartMarkers,
  buildComponentEventsForView,
} from "@/features/chart/chartComponentEvents";
import type { ComponentEvent } from "@/api/types";
import {
  buildTradeManagementEventChartMarkers,
  buildTradeManagementEventsForView,
  filterTradeManagementEventsForView,
  hasTradeManagementEvents,
  phaseTransitionMarkerLabel,
  tradeManagementEventTooltip,
} from "@/features/chart/tradeManagementChartEvents";

function samplePhaseEvent(overrides: Partial<TradeManagementEvent> = {}): TradeManagementEvent {
  return {
    trade_id: "2",
    time_ms: 1714561400000,
    bar_index: 10,
    side: "long",
    event_type: "phase_changed",
    from_phase: "initial_risk",
    to_phase: "runner",
    rule_id: "to_runner_at_2_5atr",
    mfe_pct: 0.06,
    mae_pct: 0.01,
    bars_in_trade: 4,
    ...overrides,
  };
}

function sampleExitEvent(overrides: Partial<TradeManagementEvent> = {}): TradeManagementEvent {
  return {
    trade_id: "2",
    time_ms: 1714570400000,
    bar_index: 20,
    side: "long",
    event_type: "exit_executed",
    from_phase: "runner",
    rule_id: "exit",
    component_id: "signal_exit",
    mfe_pct: 0.06,
    mae_pct: 0.01,
    bars_in_trade: 8,
    metadata: { exit_reason: "signal:exit" },
    ...overrides,
  };
}

const viewCandles = [{ time: 1714561200 }, { time: 1714570800 }];

function minimalTrade(tradeId: number | string): TradeRecord {
  return {
    trade_id: tradeId,
    direction: "long",
    status: "closed",
    entry_time_ms: 1_000,
    exit_time_ms: 2_000,
    entry_price: 100,
    exit_price: 101,
    size: 1,
    pnl: 1,
    return_pct: 0.01,
    exit_reason: "signal:test",
  };
}

describe("hasTradeManagementEvents", () => {
  it("returns false for missing events", () => {
    expect(hasTradeManagementEvents(undefined)).toBe(false);
    expect(hasTradeManagementEvents(null)).toBe(false);
    expect(hasTradeManagementEvents([])).toBe(false);
  });
});

describe("buildTradeManagementEventChartMarkers", () => {
  it("maps phase_changed to phase marker label", () => {
    const markers = buildTradeManagementEventChartMarkers([samplePhaseEvent()], {
      showPhases: true,
      showExits: false,
      selectedTradeId: null,
    });
    expect(markers).toHaveLength(1);
    expect(markers[0]?.text).toBe("Runner");
  });

  it("maps managed layer events to markers when exits toggle is on", () => {
    const events = [
      samplePhaseEvent({
        event_type: "active_stop_updated",
        to_phase: null,
        component_id: "break_even_stop",
        stop_price: 10000,
      }),
      samplePhaseEvent({
        event_type: "exit_rule_triggered",
        to_phase: null,
        component_id: "break_even_stop",
      }),
    ];
    const markers = buildTradeManagementEventChartMarkers(events, {
      showPhases: false,
      showExits: true,
      selectedTradeId: null,
    });
    expect(markers).toHaveLength(2);
    expect(markers.map((m) => m.text)).toEqual(["Stop↑", "Rule"]);
  });

  it("maps exit_executed to exit marker", () => {
    const markers = buildTradeManagementEventChartMarkers([sampleExitEvent()], {
      showPhases: false,
      showExits: true,
      selectedTradeId: null,
    });
    expect(markers).toHaveLength(1);
    expect(markers[0]?.text).toBe("Exit");
  });

  it("uses sequential display number in highlighted marker text", () => {
    const markers = buildTradeManagementEventChartMarkers(
      [sampleExitEvent({ trade_id: "long:641890" })],
      {
        showPhases: false,
        showExits: true,
        selectedTradeId: "long:641890",
        trades: [
          {
            trade_id: "long:641890",
            direction: "long",
            status: "closed",
            entry_time_ms: 1_000,
            exit_time_ms: 2_000,
            entry_price: 100,
            exit_price: 101,
            size: 1,
            pnl: 1,
            return_pct: 0.01,
            exit_reason: "unknown",
          },
        ],
      },
    );
    expect(markers[0]?.text).toBe("Exit#1");
  });

  it("toggle OFF hides trade-management markers", () => {
    const events = [samplePhaseEvent(), sampleExitEvent()];
    expect(
      buildTradeManagementEventChartMarkers(events, {
        showPhases: false,
        showExits: false,
        selectedTradeId: null,
      }),
    ).toHaveLength(0);
    expect(
      buildTradeManagementEventChartMarkers(events, {
        showPhases: true,
        showExits: false,
        selectedTradeId: null,
      }),
    ).toHaveLength(1);
    expect(
      buildTradeManagementEventChartMarkers(events, {
        showPhases: false,
        showExits: true,
        selectedTradeId: null,
      }),
    ).toHaveLength(1);
  });

  it("selected trade filters events by trade_id", () => {
    const events = [
      samplePhaseEvent({ trade_id: "1", to_phase: "proven" }),
      samplePhaseEvent({ trade_id: "2", to_phase: "runner" }),
    ];
    const filtered = filterTradeManagementEventsForView(events, {
      selectedTradeId: 2,
      fromSec: viewCandles[0]!.time,
      toSec: viewCandles[1]!.time,
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.trade_id).toBe("2");

    const markers = buildTradeManagementEventsForView(events, {
      showPhases: true,
      showExits: false,
      selectedTradeId: 2,
      viewCandles,
      trades: [minimalTrade(1), minimalTrade(2)],
    });
    expect(markers).toHaveLength(1);
    expect(markers[0]?.text).toBe("Runner#2");
  });

  it("excludes events without trade_id when a trade is selected", () => {
    const filtered = filterTradeManagementEventsForView(
      [samplePhaseEvent({ trade_id: "" })],
      {
        selectedTradeId: 2,
        fromSec: viewCandles[0]!.time,
        toSec: viewCandles[1]!.time,
      },
    );
    expect(filtered).toHaveLength(0);
  });

  it("missing optional event fields do not crash", () => {
    const sparse = samplePhaseEvent({
      rule_id: null,
      mfe_pct: null,
      mae_pct: null,
      bars_in_trade: null,
      to_phase: null,
    });
    expect(() =>
      buildTradeManagementEventChartMarkers([sparse], {
        showPhases: true,
        showExits: false,
        selectedTradeId: null,
      }),
    ).not.toThrow();
    expect(tradeManagementEventTooltip(sparse)).toContain("trade_id: 2");
  });

  it("skips events without time_ms", () => {
    const markers = buildTradeManagementEventChartMarkers(
      [samplePhaseEvent({ time_ms: null })],
      { showPhases: true, showExits: false, selectedTradeId: null },
    );
    expect(markers).toHaveLength(0);
  });
});

describe("phaseTransitionMarkerLabel", () => {
  it("renders initial_risk/proven/protected/runner labels when present", () => {
    expect(phaseTransitionMarkerLabel("proven")).toBe("Proven");
    expect(phaseTransitionMarkerLabel("protected")).toBe("Protected");
    expect(phaseTransitionMarkerLabel("runner")).toBe("Runner");
    expect(phaseTransitionMarkerLabel("exhaustion")).toBe("Exhaust");
  });
});

describe("tradeManagementEventTooltip", () => {
  it("includes available exit fields only", () => {
    const trade: TradeRecord = {
      trade_id: 2,
      direction: "long",
      status: "closed",
      entry_time_ms: 1,
      exit_time_ms: 2,
      entry_price: 1,
      exit_price: 2,
      size: 1,
      pnl: 1,
      return_pct: 0.01,
      exit_reason: "signal:exit",
      exit_kind: "signal",
      trade_management: {
        phase_at_exit: "runner",
        max_phase_reached: "runner",
        exit_layer: "signal",
        exit_rule_id: "exit",
      },
    };
    const tooltip = tradeManagementEventTooltip(sampleExitEvent(), trade);
    expect(tooltip).toContain("exit_layer: signal");
    expect(tooltip).toContain("exit_rule_id: exit");
    expect(tooltip).toContain("exit_component_id: signal_exit");
    expect(tooltip).toContain("exit_reason: signal:exit");
    expect(tooltip).toContain("max_phase: runner");
  });
});

describe("component events unchanged", () => {
  const componentEvent: ComponentEvent = {
    time: 1714561400,
    event_type: "point",
    role: "exit_signal",
    side: "long",
    component_id: "rsi_exit",
    instance_id: "exit_1",
    label: "ExitSig",
    metadata: {},
  };

  it("existing component_events markers still render unchanged", () => {
    const before = buildComponentEventChartMarkers([componentEvent], {
      showEntryBlock: false,
      showExitSignal: true,
      showSetup: false,
    });
    const after = buildComponentEventsForView([componentEvent], {
      showEntryBlock: false,
      showExitSignal: true,
      showSetup: false,
      viewCandles: [{ time: 1714561200 }, { time: 1714561500 }],
    });
    expect(before[0]?.text).toBe("ExitSig");
    expect(after[0]?.text).toBe("ExitSig");
  });
});
