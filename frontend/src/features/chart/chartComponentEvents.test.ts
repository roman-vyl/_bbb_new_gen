import { describe, expect, it } from "vitest";

import type { ComponentEvent } from "@/api/types";
import {
  buildComponentEventChartMarkers,
  buildComponentEventsForView,
  componentEventTooltip,
  hasHtfAlignedComponentEvents,
} from "@/features/chart/chartComponentEvents";

function sampleEvent(overrides: Partial<ComponentEvent> = {}): ComponentEvent {
  return {
    time: 100,
    event_type: "span_start",
    role: "entry_block",
    side: "long",
    component_id: "rsi_lookback_extreme_blocker",
    instance_id: "blocker_1",
    label: "Block▶",
    metadata: { condition: "block_start" },
    source_timeframe: "5m",
    base_timeframe: "5m",
    ...overrides,
  };
}

describe("buildComponentEventChartMarkers", () => {
  it("renders by event_type and role without component_id branching", () => {
    const markers = [
      sampleEvent({ event_type: "source", label: "Src" }),
      sampleEvent({ event_type: "span_end", label: "Block■", time: 200 }),
      sampleEvent({
        event_type: "point",
        role: "exit_signal",
        label: "Exit↓",
        time: 300,
      }),
    ];
    const rendered = buildComponentEventChartMarkers(markers, {
      showEntryBlock: true,
      showExitSignal: true,
    });
    expect(rendered).toHaveLength(3);
    expect(rendered.map((m) => m.text)).toEqual(["Src", "Block■", "Exit↓"]);
  });

  it("styles depend on event_type not component_id", () => {
    const source = buildComponentEventChartMarkers(
      [sampleEvent({ event_type: "source", label: "Src" })],
      { showEntryBlock: true, showExitSignal: true },
    );
    const spanStart = buildComponentEventChartMarkers(
      [sampleEvent({ event_type: "span_start" })],
      { showEntryBlock: true, showExitSignal: true },
    );
    expect(source[0]?.color).not.toBe(spanStart[0]?.color);
    const otherComponent = buildComponentEventChartMarkers(
      [
        sampleEvent({
          component_id: "counter_candle_blocker",
          event_type: "span_start",
        }),
      ],
      { showEntryBlock: true, showExitSignal: true },
    );
    expect(otherComponent[0]?.color).toBe(spanStart[0]?.color);
  });

  it("filters by role toggles", () => {
    const markers = [
      sampleEvent(),
      sampleEvent({
        event_type: "point",
        role: "exit_signal",
        label: "Exit↓",
      }),
    ];
    const entryOnly = buildComponentEventChartMarkers(markers, {
      showEntryBlock: true,
      showExitSignal: false,
    });
    expect(entryOnly).toHaveLength(1);
    expect(entryOnly[0]?.text).toBe("Block▶");
  });

  it("renders setup events through generic role/event_type handling", () => {
    const rendered = buildComponentEventChartMarkers(
      [
        sampleEvent({
          event_type: "span_start",
          role: "setup",
          component_id: "ema_bounce_counter_setup",
          instance_id: "ema_bounce_counter_setup",
          label: "Setup▶",
          metadata: { event_name: "pending_bounce_start" },
        }),
      ],
      { showEntryBlock: false, showExitSignal: false },
    );

    expect(rendered).toHaveLength(1);
    expect(rendered[0]?.text).toBe("Setup▶");
  });
});

describe("buildComponentEventsForView", () => {
  it("filters to visible candle range", () => {
    const markers = [
      sampleEvent({ time: 50 }),
      sampleEvent({ time: 150 }),
      sampleEvent({ time: 250 }),
    ];
    const rendered = buildComponentEventsForView(markers, {
      showEntryBlock: true,
      showExitSignal: true,
      viewCandles: [{ time: 100 }, { time: 200 }],
    });
    expect(rendered).toHaveLength(1);
    expect(rendered[0]?.time).toBe(150);
  });
});

describe("componentEventTooltip", () => {
  it("uses tooltip when provided", () => {
    expect(componentEventTooltip(sampleEvent({ tooltip: "custom" }))).toBe("custom");
  });
});

describe("hasHtfAlignedComponentEvents", () => {
  it("detects HTF from top-level timeframes", () => {
    expect(
      hasHtfAlignedComponentEvents([
        sampleEvent({ source_timeframe: "1h", base_timeframe: "5m" }),
      ]),
    ).toBe(true);
    expect(hasHtfAlignedComponentEvents([sampleEvent()])).toBe(false);
  });
});
