import { describe, expect, it } from "vitest";

import type { ComponentEvent, HtfContextTrace, SignalTraceBundle } from "@/api/types";
import {
  buildTraceDisplayCacheKey,
  componentEventDedupeKey,
  computeChunkBoundsFromResponse,
  coversTimeRange,
  createSignalTraceDisplayCache,
  extractDisplayChunkFromResponse,
  isTraceResponseTruncated,
  mergeDisplayChunkFromResponse,
  missingTimeRange,
} from "@/features/chart/signalTraceDisplayCache";

function makeEvent(overrides: Partial<ComponentEvent> & Pick<ComponentEvent, "time">): ComponentEvent {
  return {
    event_type: "point",
    role: "exit_signal",
    side: "long",
    component_id: "comp_a",
    instance_id: "inst_a",
    label: "evt",
    span_id: null,
    feature_family: null,
    source_timeframe: null,
    base_timeframe: null,
    metadata: {},
    ...overrides,
  };
}

function makeHtf(length: number, startTime: number): HtfContextTrace {
  return {
    state: Array.from({ length }, () => "up" as const),
    fast: Array.from({ length }, (_, i) => 100 + i),
    anchor: Array.from({ length }, (_, i) => 90 + i),
    slow: Array.from({ length }, (_, i) => 80 + i),
    meta: { startTime },
  };
}

function makeBundle(partial: Partial<SignalTraceBundle> & Pick<SignalTraceBundle, "times">): SignalTraceBundle {
  const times = partial.times;
  return {
    meta: {
      variant: "v1",
      component_ids: {
        direction: "dir",
        setups: [],
        trigger: "tr",
        risk: "risk",
      },
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
    component_events: [],
    ...partial,
  };
}

describe("computeChunkBoundsFromResponse", () => {
  it("uses times grid endpoints for coverage when component_events are empty", () => {
    const bundle = makeBundle({
      times: [100, 200, 300],
      component_events: [],
      htf_context: makeHtf(3, 100),
    });

    expect(computeChunkBoundsFromResponse(bundle)).toEqual({ fromSec: 100, toSec: 300 });
  });

  it("returns null when times grid is empty (htf_context alone is not a time axis)", () => {
    const bundle = makeBundle({
      times: [],
      component_events: [],
      htf_context: {
        state: ["up"],
        fast: [1],
        anchor: [2],
        slow: [3],
        meta: {},
      },
    });

    expect(computeChunkBoundsFromResponse(bundle)).toBeNull();
    expect(extractDisplayChunkFromResponse(bundle)).toBeNull();
  });

  it("uses actual response times, not requested window", () => {
    const bundle = makeBundle({
      times: [100, 200, 300],
      component_events: [makeEvent({ time: 250 })],
    });

    expect(computeChunkBoundsFromResponse(bundle)).toEqual({ fromSec: 100, toSec: 300 });
  });

  it("detects truncation vs requested render window", () => {
    const actual = computeChunkBoundsFromResponse(makeBundle({ times: [100, 200, 300] }));
    expect(isTraceResponseTruncated({ fromSec: 100, toSec: 5000 }, actual)).toBe(true);
    expect(isTraceResponseTruncated({ fromSec: 100, toSec: 300 }, actual)).toBe(false);
  });
});

describe("component events dedupe", () => {
  it("keeps events that differ by component_id or side", () => {
    const cache = createSignalTraceDisplayCache();
    cache.reset("run:v1:");

    const chunkA = extractDisplayChunkFromResponse(
      makeBundle({
        times: [100],
        component_events: [
          makeEvent({ time: 100, component_id: "comp_a", side: "long" }),
          makeEvent({ time: 100, component_id: "comp_b", side: "long" }),
          makeEvent({ time: 100, component_id: "comp_a", side: "short" }),
        ],
      }),
    )!;

    cache.mergeDisplayChunk(chunkA);
    expect(cache.sliceEventsForWindow(100, 100)).toHaveLength(3);
  });

  it("dedupes identical display identity tuples", () => {
    const a = makeEvent({ time: 100, label: "one" });
    const b = makeEvent({ time: 100, label: "one" });
    expect(componentEventDedupeKey(a)).toBe(componentEventDedupeKey(b));
  });
});

describe("SignalTraceDisplayCache", () => {
  it("covers merged ranges and reports missing gaps", () => {
    const cache = createSignalTraceDisplayCache();
    cache.reset(buildTraceDisplayCacheKey("run", "v1", "htf_1"));

    cache.mergeDisplayChunk({
      fromSec: 100,
      toSec: 200,
      component_events: [],
      times: [100, 150, 200],
      htf_context: makeHtf(3, 100),
    });
    cache.mergeDisplayChunk({
      fromSec: 250,
      toSec: 350,
      component_events: [],
      times: [250, 300, 350],
      htf_context: makeHtf(3, 250),
    });

    expect(cache.coversRange(100, 200)).toBe(true);
    expect(cache.coversRange(250, 350)).toBe(true);
    expect(cache.coversRange(100, 350)).toBe(false);
    expect(cache.coveredRanges(150, 300)).toEqual([
      { fromSec: 150, toSec: 200 },
      { fromSec: 250, toSec: 300 },
    ]);
    expect(cache.missingRange(100, 350)).toEqual({ fromSec: 201, toSec: 350 });
  });

  it("pan-back slice returns merged events and HTF without side traces", () => {
    const cache = createSignalTraceDisplayCache();
    cache.reset("run:v1:");

    mergeDisplayChunkFromResponse(
      cache,
      makeBundle({
        times: [100, 200],
        component_events: [makeEvent({ time: 150, label: "first" })],
        htf_context: makeHtf(2, 100),
      }),
    );
    mergeDisplayChunkFromResponse(
      cache,
      makeBundle({
        times: [300, 400],
        component_events: [makeEvent({ time: 350, label: "second" })],
        htf_context: makeHtf(2, 300),
      }),
    );

    expect(cache.sliceEventsForWindow(100, 200)).toHaveLength(1);
    expect(cache.sliceEventsForWindow(300, 400)).toHaveLength(1);
    const htfSlice = cache.sliceHtfContextForWindow(300, 400);
    expect(htfSlice.times).toEqual([300, 400]);
    expect(htfSlice.htf_context?.fast).toEqual([100, 101]);
  });

  it("truncated response records partial coverage only", () => {
    const cache = createSignalTraceDisplayCache();
    cache.reset("run:v1:");

    mergeDisplayChunkFromResponse(
      cache,
      makeBundle({
        times: Array.from({ length: 100 }, (_, i) => 1000 + i),
      }),
    );

    expect(cache.coversRange(1000, 1099)).toBe(true);
    expect(cache.coversRange(1000, 5000)).toBe(false);
  });

  it("full 50k window merge coversRange for first and last bar", () => {
    const n = 50_000;
    const barSec = 300;
    const tFirst = 1_700_000_000;
    const times = Array.from({ length: n }, (_, i) => tFirst + i * barSec);
    const tLast = times[n - 1]!;

    const cache = createSignalTraceDisplayCache();
    cache.reset("run:v1:");

    mergeDisplayChunkFromResponse(
      cache,
      makeBundle({
        times,
      }),
    );

    expect(times).toHaveLength(n);
    expect(times[0]).toBe(tFirst);
    expect(times[n - 1]).toBe(tLast);
    expect(cache.coversRange(tFirst, tLast)).toBe(true);
    expect(isTraceResponseTruncated({ fromSec: tFirst, toSec: tLast }, { fromSec: tFirst, toSec: tLast })).toBe(
      false,
    );
  });

  it("evicts oldest chunks when LRU cap exceeded", () => {
    const cache = createSignalTraceDisplayCache();
    cache.reset("run:v1:");

    for (let i = 0; i < 12; i += 1) {
      cache.mergeDisplayChunk({
        fromSec: i * 100,
        toSec: i * 100 + 50,
        component_events: [makeEvent({ time: i * 100, label: `chunk-${i}` })],
        times: [i * 100],
        htf_context: undefined,
      });
    }

    expect(cache.chunkCount()).toBe(10);
    expect(cache.sliceEventsForWindow(0, 50)).toHaveLength(0);
    expect(cache.sliceEventsForWindow(100, 150)).toHaveLength(0);
    expect(cache.sliceEventsForWindow(200, 250)).toHaveLength(1);
    expect(cache.sliceEventsForWindow(1100, 1150)).toHaveLength(1);
  });
});

describe("coverage interval helpers", () => {
  it("mergeCoverage via coversTimeRange handles adjacent intervals", () => {
    const intervals = [
      { fromSec: 100, toSec: 200 },
      { fromSec: 201, toSec: 300 },
    ];
    expect(coversTimeRange(intervals, 100, 300)).toBe(true);
    expect(missingTimeRange(intervals, 100, 400)).toEqual({ fromSec: 301, toSec: 400 });
  });
});
