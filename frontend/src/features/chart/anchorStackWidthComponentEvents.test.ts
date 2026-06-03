import { describe, expect, it } from "vitest";

import type { ComponentEvent } from "@/api/types";
import { buildComponentEventChartMarkers } from "@/features/chart/chartComponentEvents";
import { ANCHOR_STACK_WIDTH_SETUP_COMPONENT_ID } from "@/features/chart/anchorStackWidthComponentEventPresentation";

describe("anchor stack width chart events", () => {
  it("renders only transition markers with Width ok / Width end labels", () => {
    const events: ComponentEvent[] = [
      {
        time: 100,
        event_type: "span_start",
        role: "setup",
        side: "long",
        component_id: ANCHOR_STACK_WIDTH_SETUP_COMPONENT_ID,
        instance_id: "anchor_stack_width",
        label: "Width ok",
        tooltip: "Anchor stack width setup",
        span_id: "x",
        metadata: {},
      },
      {
        time: 200,
        event_type: "span_end",
        role: "setup",
        side: "long",
        component_id: ANCHOR_STACK_WIDTH_SETUP_COMPONENT_ID,
        instance_id: "anchor_stack_width",
        label: "Width end",
        tooltip: "Anchor stack width ended",
        span_id: "x",
        metadata: {},
      },
    ];
    const markers = buildComponentEventChartMarkers(events, {
      showEntryBlock: false,
      showExitSignal: false,
      showSetup: true,
    });
    expect(markers).toHaveLength(2);
    expect(markers.map((m) => m.text)).toEqual(["Width ok", "Width end"]);
  });
});
