import { describe, expect, it } from "vitest";

import type { ChartAuxEmaOverlay, ChartBar, ComponentEvent } from "@/api/types";
import { CHART_OVERLAY_EMA_KIND } from "@/api/types";
import {
  buildAuxOverlaysStabilizeKey,
  buildRenderWindowBoundsKey,
  displayAuxOverlaysForRenderWindow,
  displayComponentEventsForRenderWindow,
  stabilizeByWindowBoundsKey,
} from "@/features/chart/chartRenderWindowDisplay";
import {
  createSignalTraceDisplayCache,
  mergeDisplayChunkFromResponse,
} from "@/features/chart/signalTraceDisplayCache";
import { buildChartDataKey, buildChartSeriesDataKey } from "@/features/chart/chartDataKey";

function makeBars(count: number, startTime: number): ChartBar[] {
  return Array.from({ length: count }, (_, i) => ({
    time: startTime + i * 300,
    open: 100,
    high: 101,
    low: 99,
    close: 100.5,
  }));
}

function makeHtfOverlay(points: { time: number; value: number }[]): ChartAuxEmaOverlay {
  return {
    id: "htf_fast",
    label: "HTF fast",
    period: 200,
    timeframe: "4h",
    dashed: true,
    points: points.map((p) => ({ ...p, kind: CHART_OVERLAY_EMA_KIND })),
  };
}

describe("display cache pan-back", () => {
  it("serves events from merged display cache across non-adjacent windows", () => {
    const cache = createSignalTraceDisplayCache();
    cache.reset("run:v1:");

    const makeBundle = (times: number[], eventTime: number) => ({
      times,
      meta: {
        variant: "v1",
        component_ids: { direction: "d", setups: [], trigger: "t", risk: "r" },
        setup_params: [],
        blocker_instances: [],
      },
      long: {
        direction_ok: times.map(() => false),
        blockers_ok: times.map(() => true),
        setup_ok: times.map(() => false),
        trigger_ok: times.map(() => false),
        risk_ok: times.map(() => true),
        signal_entry: times.map(() => false),
        stop_ready: times.map(() => true),
        portfolio_entry: times.map(() => false),
        internals: {},
      },
      short: {
        direction_ok: times.map(() => false),
        blockers_ok: times.map(() => true),
        setup_ok: times.map(() => false),
        trigger_ok: times.map(() => false),
        risk_ok: times.map(() => true),
        signal_entry: times.map(() => false),
        stop_ready: times.map(() => true),
        portfolio_entry: times.map(() => false),
        internals: {},
      },
      component_events: [
        {
          time: eventTime,
          event_type: "point" as const,
          role: "exit_signal" as const,
          side: "long" as const,
          component_id: "x",
          instance_id: "i",
          label: String(eventTime),
          span_id: null,
          feature_family: null,
          source_timeframe: null,
          base_timeframe: null,
          metadata: {},
        },
      ],
    });

    mergeDisplayChunkFromResponse(cache, makeBundle([1000, 1100], 1050));
    mergeDisplayChunkFromResponse(cache, makeBundle([5000, 5100], 5050));

    const earlyWindow = makeBars(5, 1000);
    const lateWindow = makeBars(5, 5000);

    expect(cache.sliceEventsForWindow(earlyWindow[0]!.time, earlyWindow[4]!.time)).toHaveLength(1);
    expect(cache.sliceEventsForWindow(lateWindow[0]!.time, lateWindow[4]!.time)).toHaveLength(1);
    expect(cache.coversRange(1000, 1100)).toBe(true);
    expect(cache.coversRange(5000, 5100)).toBe(true);
  });
});

describe("displayAuxOverlaysForRenderWindow", () => {
  it("re-slices frozen HTF to new render window when trace is stale", () => {
    const oldWindow = makeBars(10, 1_000_000);
    const newWindow = makeBars(10, 1_000_000 + 50 * 300);
    const frozenHtf = [
      makeHtfOverlay([
        { time: oldWindow[0]!.time, value: 1 },
        { time: oldWindow[5]!.time, value: 2 },
        { time: oldWindow[9]!.time, value: 3 },
      ]),
    ];

    const display = displayAuxOverlaysForRenderWindow([], frozenHtf, false, newWindow);

    const htf = display.find((o) => o.id.startsWith("htf_"));
    expect(htf).toBeDefined();
    expect(
      htf!.points.every((p) => p.time >= newWindow[0]!.time && p.time <= newWindow[9]!.time),
    ).toBe(true);
    expect(htf!.points.some((p) => p.time === oldWindow[0]!.time)).toBe(false);
  });
});

describe("displayComponentEventsForRenderWindow", () => {
  it("re-filters frozen events to new render window when trace is stale", () => {
    const oldFrom = 1_000_000;
    const newFrom = 1_000_000 + 50 * 300;
    const frozen: ComponentEvent[] = [
      {
        time: oldFrom,
        event_type: "point",
        role: "exit_signal",
        side: "long",
        component_id: "x",
        instance_id: "i",
        label: "old",
        span_id: null,
        feature_family: null,
        source_timeframe: null,
        base_timeframe: null,
        metadata: {},
      },
      {
        time: newFrom + 300,
        event_type: "point",
        role: "exit_signal",
        side: "long",
        component_id: "x",
        instance_id: "i",
        label: "in-new",
        span_id: null,
        feature_family: null,
        source_timeframe: null,
        base_timeframe: null,
        metadata: {},
      },
    ];

    const newWindow = makeBars(10, newFrom);
    const display = displayComponentEventsForRenderWindow([], frozen, false, newWindow);

    expect(display).toHaveLength(1);
    expect(display[0]!.time).toBe(newFrom + 300);
    expect(display.every((e) => e.time >= newFrom && e.time <= newWindow[9]!.time)).toBe(true);
  });
});

describe("stabilizeByWindowBoundsKey", () => {
  it("returns same reference when bounds key unchanged", () => {
    const cache = { current: { key: "", value: [] as number[] } };
    const first = stabilizeByWindowBoundsKey(cache, "a:1:10", [1, 2, 3]);
    const second = stabilizeByWindowBoundsKey(cache, "a:1:10", [4, 5, 6]);
    expect(second).toBe(first);
  });

  it("updates reference when bounds key changes", () => {
    const cache = { current: { key: "", value: [] as number[] } };
    const first = stabilizeByWindowBoundsKey(cache, "a:1:10", [1]);
    const second = stabilizeByWindowBoundsKey(cache, "b:2:10", [2]);
    expect(second).not.toBe(first);
    expect(second).toEqual([2]);
  });

  it("must not return stale aux when bounds key unchanged but aux content grew (HTF arrive after pan)", () => {
    const cache = { current: { key: "", value: [] as ChartAuxEmaOverlay[] } };
    const key = "1763941200:1778940900:50000";
    const empty = stabilizeByWindowBoundsKey(cache, key, []);
    const withHtf = stabilizeByWindowBoundsKey(
      cache,
      buildAuxOverlaysStabilizeKey(
        key,
        [
          makeHtfOverlay([
            { time: 1_768_000_000, value: 1 },
            { time: 1_769_000_000, value: 2 },
          ]),
        ],
      ),
      [
        makeHtfOverlay([
          { time: 1_768_000_000, value: 1 },
          { time: 1_769_000_000, value: 2 },
        ]),
      ],
    );
    expect(withHtf).not.toBe(empty);
    expect(withHtf).toHaveLength(1);
    expect(withHtf[0]!.points.length).toBe(2);
  });
});

describe("in-zone trade select series key", () => {
  const window = { firstTimeSec: 900_000, lastTimeSec: 910_000, count: 50_000 };

  it("chartSeriesDataKey unchanged when only trade/center change", () => {
    const seriesA = buildChartSeriesDataKey(window);
    const seriesB = buildChartSeriesDataKey(window);
    expect(seriesA).toBe(seriesB);
    expect(seriesA).not.toBe("");

    const dataKeyA = buildChartDataKey({ ...window, selectedTradeId: 1, centerTimeSec: 905_000 });
    const dataKeyB = buildChartDataKey({ ...window, selectedTradeId: 2, centerTimeSec: 906_000 });
    expect(dataKeyA).not.toBe(dataKeyB);
    expect(buildChartSeriesDataKey(window)).toBe(seriesA);
  });

  it("buildRenderWindowBoundsKey matches series key shape", () => {
    expect(buildRenderWindowBoundsKey(window.firstTimeSec, window.lastTimeSec, window.count)).toBe(
      buildChartSeriesDataKey(window),
    );
  });
});
