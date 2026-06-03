import { describe, expect, it } from "vitest";

import type { ComponentEvent } from "@/api/types";
import {
  ANCHOR_STACK_WIDTH_SETUP_COMPONENT_ID,
  formatAnchorStackWidthEventLabel,
  formatAnchorStackWidthEventTooltip,
} from "@/features/chart/anchorStackWidthComponentEventPresentation";

function sampleEvent(overrides: Partial<ComponentEvent> = {}): ComponentEvent {
  return {
    time: 1_700_000_000,
    event_type: "span_start",
    role: "setup",
    side: "long",
    component_id: ANCHOR_STACK_WIDTH_SETUP_COMPONENT_ID,
    instance_id: "anchor_stack_width",
    label: "Width ok",
    tooltip: "Anchor stack width setup\ncurrent_width_atr: 2.5",
    span_id: "anchor_stack_width:long:1",
    feature_family: "ema",
    source_timeframe: "1h",
    base_timeframe: "1h",
    metadata: {},
    ...overrides,
  };
}

describe("anchorStackWidthComponentEventPresentation", () => {
  it("formats Width ok / Width end labels", () => {
    expect(formatAnchorStackWidthEventLabel(sampleEvent())).toBe("Width ok");
    expect(
      formatAnchorStackWidthEventLabel(sampleEvent({ label: "Width end", event_type: "span_end" })),
    ).toBe("Width end");
  });

  it("returns backend tooltip when present", () => {
    const tooltip = formatAnchorStackWidthEventTooltip(sampleEvent());
    expect(tooltip).toContain("Anchor stack width setup");
    expect(tooltip).toContain("current_width_atr");
  });
});
