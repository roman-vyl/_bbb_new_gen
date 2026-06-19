import { describe, expect, it } from "vitest";

import {
  buildTraceDisplayChunkKey,
  planMissingTraceDisplayChunkFetch,
  TRACE_DISPLAY_CHUNK_BAR_COUNT,
} from "@/features/chart/runtime/traceDisplayChunkScheduling";
import { buildTraceRequestKey } from "@/features/chart/runtime/signalTraceRequestCoordinator";
import {
  createSignalTraceDisplayCache,
  mergeDisplayChunkFromResponse,
} from "@/features/chart/signalTraceDisplayCache";

function makeBars(count: number, startTime = 1_700_000_000, stepSec = 300) {
  return Array.from({ length: count }, (_, i) => ({
    time: startTime + i * stepSec,
    open: 100,
    high: 101,
    low: 99,
    close: 100.5,
  }));
}

function makeTraceBundle(times: number[]) {
  return {
    times,
    meta: {
      variant: "exp_a",
      component_ids: {
        direction: "d",
        setups: [],
        trigger: "t",
        risk: "r",
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
  };
}

const RUN_ID = "run-a";
const VARIANT = "exp_a";
const TIMEFRAME = "5m";

describe("buildTraceDisplayChunkKey", () => {
  it("includes run, variant, context ref, timeframe, and normalized sec bounds", () => {
    const key = buildTraceDisplayChunkKey({
      runId: RUN_ID,
      variant: VARIANT,
      contextOverlayRef: "htf_1",
      chartTimeframe: TIMEFRAME,
      fromSec: 1000,
      toSec: 2000,
    });
    expect(key).toContain(RUN_ID);
    expect(key).toContain(VARIANT);
    expect(key).toContain("htf_1");
    expect(key).toContain(TIMEFRAME);
    expect(key).toContain("1000");
    expect(key).toContain("2000");
  });
});

describe("planMissingTraceDisplayChunkFetch", () => {
  it("returns null on full display cache hit (no network)", () => {
    const cache = createSignalTraceDisplayCache();
    cache.reset("run:v1:");
    const bars = makeBars(100);
    mergeDisplayChunkFromResponse(cache, makeTraceBundle(bars.map((bar) => bar.time)));

    expect(
      planMissingTraceDisplayChunkFetch({
        cache,
        candles: bars,
        runId: RUN_ID,
        variant: VARIANT,
        contextOverlayRef: null,
        chartTimeframe: TIMEFRAME,
      }),
    ).toBeNull();
  });

  it("plans one normalized chunk for a full window miss", () => {
    const cache = createSignalTraceDisplayCache();
    cache.reset("run:v1:");
    const bars = makeBars(120);

    const plan = planMissingTraceDisplayChunkFetch({
      cache,
      candles: bars,
      runId: RUN_ID,
      variant: VARIANT,
      contextOverlayRef: null,
      chartTimeframe: TIMEFRAME,
    });

    expect(plan).not.toBeNull();
    expect(plan!.fromSec).toBe(bars[0]!.time);
    expect(plan!.toSec).toBe(bars[bars.length - 1]!.time);
    expect(plan!.fromMs).toBe(bars[0]!.time * 1000);
    expect(plan!.toOpenTimeMs).toBe(bars[bars.length - 1]!.time * 1000);
    expect(plan!.missingRange).toEqual({
      fromSec: bars[0]!.time,
      toSec: bars[bars.length - 1]!.time,
    });
  });

  it("plans chunk from missing-range start for partial coverage", () => {
    const cache = createSignalTraceDisplayCache();
    cache.reset("run:v1:");
    const bars = makeBars(10);
    const covered = bars.slice(0, 4);
    mergeDisplayChunkFromResponse(cache, makeTraceBundle(covered.map((bar) => bar.time)));

    const plan = planMissingTraceDisplayChunkFetch({
      cache,
      candles: bars,
      runId: RUN_ID,
      variant: VARIANT,
      contextOverlayRef: null,
      chartTimeframe: TIMEFRAME,
    });

    expect(plan).not.toBeNull();
    expect(plan!.fromSec).toBe(bars[4]!.time);
    expect(plan!.toSec).toBe(bars[bars.length - 1]!.time);
    expect(plan!.missingRange).toEqual({
      fromSec: bars[3]!.time + 1,
      toSec: bars[bars.length - 1]!.time,
    });
  });

  it("keeps traceDisplayChunkKey separate from traceRequestKey", () => {
    const cache = createSignalTraceDisplayCache();
    cache.reset("run:v1:");
    const bars = makeBars(10);
    mergeDisplayChunkFromResponse(cache, makeTraceBundle(bars.slice(0, 4).map((bar) => bar.time)));
    const plan = planMissingTraceDisplayChunkFetch({
      cache,
      candles: bars,
      runId: RUN_ID,
      variant: VARIANT,
      contextOverlayRef: "htf_1",
      chartTimeframe: TIMEFRAME,
    })!;

    const chunkKey = plan.traceDisplayChunkKey;
    const requestKey = buildTraceRequestKey({
      runId: RUN_ID,
      variant: VARIANT,
      fromMs: plan.fromMs,
      toOpenTimeMs: plan.toOpenTimeMs,
      contextOverlayRef: "htf_1",
    });
    const fullWindowRequestKey = buildTraceRequestKey({
      runId: RUN_ID,
      variant: VARIANT,
      fromMs: bars[0]!.time * 1000,
      toOpenTimeMs: bars[bars.length - 1]!.time * 1000,
      contextOverlayRef: "htf_1",
    });

    expect(chunkKey).not.toBe(requestKey);
    expect(requestKey).not.toBe(fullWindowRequestKey);
    expect(chunkKey).toContain(TIMEFRAME);
    expect(requestKey).not.toContain(TIMEFRAME);
  });

  it("uses coarse 50k bar cap for normalized chunk end", () => {
    expect(TRACE_DISPLAY_CHUNK_BAR_COUNT).toBe(50_000);
    const cache = createSignalTraceDisplayCache();
    cache.reset("run:v1:");
    const bars = makeBars(60_000);
    const plan = planMissingTraceDisplayChunkFetch({
      cache,
      candles: bars,
      runId: RUN_ID,
      variant: VARIANT,
      contextOverlayRef: null,
      chartTimeframe: TIMEFRAME,
    })!;

    expect(plan.toSec).toBe(bars[49_999]!.time);
  });
});
