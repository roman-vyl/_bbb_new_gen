import type { SeriesMarker, Time } from "lightweight-charts";
import { describe, expect, it } from "vitest";

import type { ComponentEventMarker } from "@/api/types";
import {
  buildComponentEventMarkers,
  buildComponentEventMarkersForView,
  componentEventMarkerTooltip,
  hasHtfAlignedComponentMarkers,
} from "@/features/chart/chartComponentEventMarkers";

function sampleMarker(overrides: Partial<ComponentEventMarker> = {}): ComponentEventMarker {
  return {
    time: 100,
    role: "entry_block",
    side: "long",
    component_id: "rsi_lookback_extreme_blocker",
    instance_id: "rsi1",
    feature_family: "rsi",
    source_timeframe: "1h",
    base_timeframe: "5m",
    rsi_value: 85,
    condition: "extreme_seen",
    params: { threshold: 80 },
    label: "X-RSI",
    ...overrides,
  };
}

describe("buildComponentEventMarkers", () => {
  it("maps N trace events to N markers in dense mode", () => {
    const markers = Array.from({ length: 12 }, (_, index) =>
      sampleMarker({ time: 100 + index * 300 }),
    );
    const rendered = buildComponentEventMarkers(markers, {
      showEntryBlock: true,
      showExitSignal: true,
    });
    expect(rendered).toHaveLength(12);
  });

  it("styles by role and side only, not component_id", () => {
    const blocker = buildComponentEventMarkers([sampleMarker()], {
      showEntryBlock: true,
      showExitSignal: true,
    });
    const exitMarker = buildComponentEventMarkers(
      [
        sampleMarker({
          role: "exit_signal",
          side: "short",
          component_id: "rsi_signal_exit",
          label: "RSI↑",
        }),
      ],
      { showEntryBlock: true, showExitSignal: true },
    );
    expect(blocker[0]?.shape).toBe("circle");
    expect(blocker[0]?.position).toBe("aboveBar");
    expect(exitMarker[0]?.shape).toBe("square");
    expect(exitMarker[0]?.position).toBe("belowBar");
  });

  it("filters layers by role toggles", () => {
    const markers = [
      sampleMarker({ role: "entry_block" }),
      sampleMarker({ role: "exit_signal", label: "RSI↓" }),
    ];
    const entryOnly = buildComponentEventMarkers(markers, {
      showEntryBlock: true,
      showExitSignal: false,
    });
    expect(entryOnly).toHaveLength(1);
    expect(entryOnly[0]?.text).toBe("X-RSI");
  });
});

describe("buildComponentEventMarkersForView", () => {
  it("filters markers to visible candle window", () => {
    const markers = [
      sampleMarker({ time: 50 }),
      sampleMarker({ time: 100 }),
      sampleMarker({ time: 200 }),
    ];
    const rendered = buildComponentEventMarkersForView(markers, {
      showEntryBlock: true,
      showExitSignal: true,
      viewCandles: [{ time: 90 }, { time: 150 }],
    });
    expect(rendered.map((m) => m.time as number)).toEqual([100]);
  });

  it("does not expand HTF spans beyond trace list", () => {
    const markers = [sampleMarker({ time: 100 }), sampleMarker({ time: 400 })];
    const rendered = buildComponentEventMarkersForView(markers, {
      showEntryBlock: true,
      showExitSignal: true,
      viewCandles: [{ time: 100 }, { time: 400 }],
    }) as SeriesMarker<Time>[];
    expect(rendered).toHaveLength(2);
  });
});

describe("componentEventMarkerTooltip", () => {
  it("uses tooltip field when present", () => {
    expect(componentEventMarkerTooltip(sampleMarker({ tooltip: "custom" }))).toBe("custom");
  });
});

describe("hasHtfAlignedComponentMarkers", () => {
  it("detects source_timeframe different from base_timeframe", () => {
    expect(hasHtfAlignedComponentMarkers([sampleMarker()])).toBe(true);
    expect(
      hasHtfAlignedComponentMarkers([sampleMarker({ source_timeframe: "5m", base_timeframe: "5m" })]),
    ).toBe(false);
  });
});
