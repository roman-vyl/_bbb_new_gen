import { describe, expect, it } from "vitest";

import type { ComponentEvent } from "@/api/types";
import { candleTimeBounds } from "@/features/chart/chartRenderWindowDisplay";
import {
  createSignalTraceDisplayCache,
  mergeDisplayChunkFromResponse,
} from "@/features/chart/signalTraceDisplayCache";
import {
  deriveTraceDisplayStateForCandles,
  shouldRetainPreviousTraceDisplay,
  sliceTraceDisplayForCandles,
} from "@/features/chart/traceDisplayApply";

function makeBars(count: number, startTime: number) {
  return Array.from({ length: count }, (_, i) => ({
    time: startTime + i * 300,
    open: 100,
    high: 101,
    low: 99,
    close: 100.5,
  }));
}

function makeEvent(time: number): ComponentEvent {
  return {
    time,
    event_type: "point",
    role: "exit_signal",
    side: "long",
    component_id: "comp",
    instance_id: "inst",
    label: "x",
    span_id: null,
    feature_family: null,
    source_timeframe: null,
    base_timeframe: null,
    metadata: {},
  };
}

describe("trace display apply lifecycle", () => {
  it("initial chart window gets events after merge without render window change", () => {
    const cache = createSignalTraceDisplayCache();
    cache.reset("run:v1:");

    const bars = makeBars(100, 1_700_000_000);
    const bounds = candleTimeBounds(bars);
    expect(bounds).not.toBeNull();

    const eventTime = bars[50]!.time;
    mergeDisplayChunkFromResponse(
      cache,
      {
        times: bars.map((bar) => bar.time),
        meta: {
          variant: "v1",
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
          direction_ok: bars.map(() => false),
          blockers_ok: bars.map(() => true),
          setup_ok: bars.map(() => false),
          trigger_ok: bars.map(() => false),
          risk_ok: bars.map(() => true),
          signal_entry: bars.map(() => false),
          stop_ready: bars.map(() => true),
          portfolio_entry: bars.map(() => false),
          internals: {},
        },
        short: {
          direction_ok: bars.map(() => false),
          blockers_ok: bars.map(() => true),
          setup_ok: bars.map(() => false),
          trigger_ok: bars.map(() => false),
          risk_ok: bars.map(() => true),
          signal_entry: bars.map(() => false),
          stop_ready: bars.map(() => true),
          portfolio_entry: bars.map(() => false),
          internals: {},
        },
        component_events: [makeEvent(eventTime)],
      },
    );

    const before = sliceTraceDisplayForCandles(cache, bars);
    expect(before?.events.length).toBeGreaterThan(0);

    const after = sliceTraceDisplayForCandles(cache, bars);
    expect(after?.events.length).toBe(before?.events.length);
    expect(cache.coversRange(bounds!.fromSec, bounds!.toSec)).toBe(true);
  });

  it("marks partial/loading coverage without discarding covered events", () => {
    const cache = createSignalTraceDisplayCache();
    cache.reset("run:v1:");

    const bars = makeBars(10, 1_700_000_000);
    const coveredBars = bars.slice(0, 4);
    const eventTime = coveredBars[2]!.time;

    mergeDisplayChunkFromResponse(cache, {
      times: coveredBars.map((bar) => bar.time),
      meta: {
        variant: "v1",
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
        direction_ok: coveredBars.map(() => false),
        blockers_ok: coveredBars.map(() => true),
        setup_ok: coveredBars.map(() => false),
        trigger_ok: coveredBars.map(() => false),
        risk_ok: coveredBars.map(() => true),
        signal_entry: coveredBars.map(() => false),
        stop_ready: coveredBars.map(() => true),
        portfolio_entry: coveredBars.map(() => false),
        internals: {},
      },
      short: {
        direction_ok: coveredBars.map(() => false),
        blockers_ok: coveredBars.map(() => true),
        setup_ok: coveredBars.map(() => false),
        trigger_ok: coveredBars.map(() => false),
        risk_ok: coveredBars.map(() => true),
        signal_entry: coveredBars.map(() => false),
        stop_ready: coveredBars.map(() => true),
        portfolio_entry: coveredBars.map(() => false),
        internals: {},
      },
      component_events: [makeEvent(eventTime)],
    });

    const state = deriveTraceDisplayStateForCandles(cache, bars, "loading");

    expect(state.status).toBe("loading_missing");
    expect(state.events).toHaveLength(1);
    expect(state.coveredRanges).toEqual([
      { fromSec: coveredBars[0]!.time, toSec: coveredBars[coveredBars.length - 1]!.time },
    ]);
    expect(state.missingRange).toEqual({
      fromSec: coveredBars[coveredBars.length - 1]!.time + 1,
      toSec: bars[bars.length - 1]!.time,
    });
  });

  it("retains previous display on full cache miss while new trace is loading", () => {
    const cache = createSignalTraceDisplayCache();
    cache.reset("run:v1:");

    const bars = makeBars(10, 1_700_000_000);
    const state = deriveTraceDisplayStateForCandles(cache, bars, "loading");

    expect(state.status).toBe("loading_missing");
    expect(state.events).toHaveLength(0);
    expect(shouldRetainPreviousTraceDisplay(state, { eventCount: 2, htfOverlayPointCount: 0 })).toBe(
      true,
    );
    expect(shouldRetainPreviousTraceDisplay(state, { eventCount: 0, htfOverlayPointCount: 0 })).toBe(
      false,
    );
  });

  it("does not retain previous display for covered partial ranges that legitimately have no events", () => {
    const cache = createSignalTraceDisplayCache();
    cache.reset("run:v1:");

    const bars = makeBars(10, 1_700_000_000);
    const coveredBars = bars.slice(0, 2);
    mergeDisplayChunkFromResponse(cache, {
      times: coveredBars.map((bar) => bar.time),
      meta: {
        variant: "v1",
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
        direction_ok: coveredBars.map(() => false),
        blockers_ok: coveredBars.map(() => true),
        setup_ok: coveredBars.map(() => false),
        trigger_ok: coveredBars.map(() => false),
        risk_ok: coveredBars.map(() => true),
        signal_entry: coveredBars.map(() => false),
        stop_ready: coveredBars.map(() => true),
        portfolio_entry: coveredBars.map(() => false),
        internals: {},
      },
      short: {
        direction_ok: coveredBars.map(() => false),
        blockers_ok: coveredBars.map(() => true),
        setup_ok: coveredBars.map(() => false),
        trigger_ok: coveredBars.map(() => false),
        risk_ok: coveredBars.map(() => true),
        signal_entry: coveredBars.map(() => false),
        stop_ready: coveredBars.map(() => true),
        portfolio_entry: coveredBars.map(() => false),
        internals: {},
      },
      component_events: [],
    });

    const state = deriveTraceDisplayStateForCandles(cache, bars, "ready");

    expect(state.status).toBe("partial");
    expect(state.coveredRanges).toHaveLength(1);
    expect(shouldRetainPreviousTraceDisplay(state, { eventCount: 2, htfOverlayPointCount: 0 })).toBe(
      false,
    );
  });
});
