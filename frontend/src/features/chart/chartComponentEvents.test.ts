import { describe, expect, it } from "vitest";

import type { ComponentEvent } from "@/api/types";
import {
  buildComponentEventChartMarkers,
  buildComponentEventsForView,
  componentEventTooltip,
  hasHtfAlignedComponentEvents,
} from "@/features/chart/chartComponentEvents";
import { EMA_BOUNCE_COUNTER_SETUP_COMPONENT_ID } from "@/features/chart/emaBounceCounterComponentEventPresentation";

const defaultMarkerOptions = {
  showEntryBlock: true,
  showExitSignal: true,
  showSetup: true,
};

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

function bounceEvent(
  eventName: string,
  eventType: ComponentEvent["event_type"],
  overrides: Partial<ComponentEvent> = {},
): ComponentEvent {
  return sampleEvent({
    event_type: eventType,
    role: "setup",
    component_id: EMA_BOUNCE_COUNTER_SETUP_COMPONENT_ID,
    instance_id: "bounce_counter",
    label: "Setup▶",
    metadata: {
      event_name: eventName,
      effective_bounce_number: 2,
      max_bounces: 3,
      completed_bounce_count: 1,
      trend_active: true,
      trend_episode_id: 4,
      armed: true,
      raw_touch: false,
      pending_bounce: true,
      in_touch_lookback: true,
      setup_allowed: true,
      touch_lookback_bars: 10,
      touch_lookback_left: 3,
      fast_ema: 50,
      anchor_ema: 200,
      slow_ema: 500,
      price_side_of_anchor: "above",
    },
    ...overrides,
  });
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
    const rendered = buildComponentEventChartMarkers(markers, defaultMarkerOptions);
    expect(rendered).toHaveLength(3);
    expect(rendered.map((m) => m.text)).toEqual(["Src", "Block■", "Exit↓"]);
  });

  it("styles depend on event_type not component_id", () => {
    const source = buildComponentEventChartMarkers(
      [sampleEvent({ event_type: "source", label: "Src" })],
      defaultMarkerOptions,
    );
    const spanStart = buildComponentEventChartMarkers(
      [sampleEvent({ event_type: "span_start" })],
      defaultMarkerOptions,
    );
    expect(source[0]?.color).not.toBe(spanStart[0]?.color);
    const otherComponent = buildComponentEventChartMarkers(
      [
        sampleEvent({
          component_id: "counter_candle_blocker",
          event_type: "span_start",
        }),
      ],
      defaultMarkerOptions,
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
      bounceEvent("pending_bounce_start", "span_start"),
    ];
    const entryOnly = buildComponentEventChartMarkers(markers, {
      showEntryBlock: true,
      showExitSignal: false,
      showSetup: false,
    });
    expect(entryOnly).toHaveLength(1);
    expect(entryOnly[0]?.text).toBe("Block▶");
  });

  it("hides setup role when showSetup is false", () => {
    const rendered = buildComponentEventChartMarkers(
      [bounceEvent("pending_bounce_start", "span_start")],
      { showEntryBlock: false, showExitSignal: false, showSetup: false },
    );
    expect(rendered).toHaveLength(0);
  });

  it("formats ema bounce counter setup labels from metadata", () => {
    const rendered = buildComponentEventChartMarkers(
      [
        bounceEvent("bounce_opportunity_start", "source"),
        bounceEvent("pending_bounce_start", "span_start"),
        bounceEvent("pending_bounce_end", "span_end"),
        bounceEvent("trend_start", "point"),
        bounceEvent("trend_break", "point", { time: 200 }),
      ],
      { showEntryBlock: false, showExitSignal: false, showSetup: true },
    );
    expect(rendered.map((marker) => marker.text)).toEqual([
      "B2 touch",
      "B2▶",
      "B2■",
      "T+",
      "T-",
    ]);
    const spanStart = rendered[1];
    const genericSetup = buildComponentEventChartMarkers(
      [
        sampleEvent({
          event_type: "span_start",
          role: "setup",
          component_id: "untouched_anchor_setup",
          label: "Setup▶",
        }),
      ],
      { showEntryBlock: false, showExitSignal: false, showSetup: true },
    );
    expect(spanStart?.color).toBe(genericSetup[0]?.color);
    expect(spanStart?.shape).toBe(genericSetup[0]?.shape);
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
      ...defaultMarkerOptions,
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

  it("formats ema bounce counter tooltip with raw_touch and in_touch_lookback", () => {
    const tooltip = componentEventTooltip(
      bounceEvent("pending_bounce_end", "span_end", {
        metadata: {
          event_name: "pending_bounce_end",
          effective_bounce_number: 1,
          max_bounces: 3,
          completed_bounce_count: 0,
          trend_active: true,
          trend_episode_id: 2,
          armed: false,
          raw_touch: false,
          pending_bounce: true,
          in_touch_lookback: true,
          setup_allowed: false,
          touch_lookback_bars: 10,
          touch_lookback_left: 2,
          fast_ema: 50,
          anchor_ema: 200,
          slow_ema: 500,
          price_side_of_anchor: "below",
        },
      }),
    );
    expect(tooltip).toContain("raw_touch: no");
    expect(tooltip).toContain("in_touch_lookback: yes");
    expect(tooltip).toContain("setup_allowed: no");
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
