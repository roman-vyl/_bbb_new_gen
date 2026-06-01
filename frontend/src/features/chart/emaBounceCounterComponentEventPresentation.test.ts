import { describe, expect, it } from "vitest";

import type { ComponentEvent } from "@/api/types";
import {
  formatEmaBounceCounterEventLabel,
  formatEmaBounceCounterEventTooltip,
} from "@/features/chart/emaBounceCounterComponentEventPresentation";

function bounceEvent(metadata: Record<string, unknown>): ComponentEvent {
  return {
    time: 100,
    event_type: "span_start",
    role: "setup",
    side: "long",
    component_id: "ema_bounce_counter_setup",
    instance_id: "bounce_counter",
    label: "Setup▶",
    metadata,
  };
}

describe("formatEmaBounceCounterEventLabel", () => {
  it("returns null for non-bounce components", () => {
    expect(
      formatEmaBounceCounterEventLabel({
        ...bounceEvent({ event_name: "pending_bounce_start", effective_bounce_number: 1 }),
        component_id: "rsi_lookback_extreme_blocker",
      }),
    ).toBeNull();
  });
});

describe("formatEmaBounceCounterEventTooltip", () => {
  it("includes trend_active and lookback fields", () => {
    const tooltip = formatEmaBounceCounterEventTooltip(
      bounceEvent({
        event_name: "pending_bounce_start",
        effective_bounce_number: 2,
        max_bounces: 3,
        completed_bounce_count: 1,
        trend_active: true,
        trend_episode_id: 5,
        armed: true,
        raw_touch: true,
        pending_bounce: true,
        in_touch_lookback: true,
        setup_allowed: true,
        touch_lookback_bars: 10,
        touch_lookback_left: 7,
        fast_ema: 50,
        anchor_ema: 200,
        slow_ema: 500,
        price_side_of_anchor: "above",
      }),
    );
    expect(tooltip).toContain("trend active: yes");
    expect(tooltip).toContain("episode #5");
    expect(tooltip).toContain("in_touch_lookback: yes");
    expect(tooltip).toContain("raw_touch: yes");
  });
});
