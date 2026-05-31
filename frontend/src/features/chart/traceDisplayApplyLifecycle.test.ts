import { describe, expect, it } from "vitest";

import type { ComponentEvent } from "@/api/types";
import { candleTimeBounds } from "@/features/chart/chartRenderWindowDisplay";
import {
  createSignalTraceDisplayCache,
  mergeDisplayChunkFromResponse,
} from "@/features/chart/signalTraceDisplayCache";
import { sliceTraceDisplayForCandles } from "@/features/chart/traceDisplayApply";

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
});
