import { describe, expect, it } from "vitest";

import type { SignalTraceBundle } from "@/api/types";
import {
  MAX_SESSION_TRACE_BUNDLES_PER_KEY,
  buildSessionCacheIdentity,
  createSignalTraceBundleSessionCache,
} from "@/features/chart/signalTraceBundleSessionCache";

function makeMinimalBundle(times: number[]): SignalTraceBundle {
  const falseList = times.map(() => false);
  const trueList = times.map(() => true);
  return {
    times,
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
      direction_ok: falseList,
      blockers_ok: trueList,
      setup_ok: falseList,
      trigger_ok: falseList,
      risk_ok: trueList,
      signal_entry: falseList,
      stop_ready: trueList,
      portfolio_entry: falseList,
      internals: {},
    },
    short: {
      direction_ok: falseList,
      blockers_ok: trueList,
      setup_ok: falseList,
      trigger_ok: falseList,
      risk_ok: trueList,
      signal_entry: falseList,
      stop_ready: trueList,
      portfolio_entry: falseList,
      internals: {},
    },
    component_events: [],
  };
}

describe("buildSessionCacheIdentity", () => {
  it("includes reloadToken and market cache key", () => {
    const idA = buildSessionCacheIdentity("run1", "v1", "htf_1", 0, "market-key-a");
    const idB = buildSessionCacheIdentity("run1", "v1", "htf_1", 1, "market-key-a");
    expect(idA).not.toBe(idB);
  });
});

describe("SignalTraceBundleSessionCache", () => {
  const IDENTITY = buildSessionCacheIdentity("run", "v1", "htf_1", 0, "market");

  it("stores and restores bundle by chartWindowKey", () => {
    const cache = createSignalTraceBundleSessionCache();
    cache.reset(IDENTITY);
    const bundle = makeMinimalBundle([100, 200]);
    cache.set("run:v1:100:200:htf_1", bundle);
    expect(cache.get("run:v1:100:200:htf_1")).toBe(bundle);
  });

  it("LRU evicts oldest at cap and keeps current key", () => {
    const cache = createSignalTraceBundleSessionCache();
    cache.reset(IDENTITY);
    for (let i = 0; i < MAX_SESSION_TRACE_BUNDLES_PER_KEY; i += 1) {
      cache.set(`key-${i}`, makeMinimalBundle([i]));
    }
    expect(cache.entryCount()).toBe(MAX_SESSION_TRACE_BUNDLES_PER_KEY);
    const newest = makeMinimalBundle([999]);
    cache.set("key-newest", newest);
    expect(cache.entryCount()).toBe(MAX_SESSION_TRACE_BUNDLES_PER_KEY);
    expect(cache.has("key-0")).toBe(false);
    expect(cache.get("key-newest")).toBe(newest);
  });

  it("reset clears stale bundles after reloadToken change", () => {
    const cache = createSignalTraceBundleSessionCache();
    cache.reset(IDENTITY);
    cache.set("run:v1:100:200:htf_1", makeMinimalBundle([100]));
    cache.reset(buildSessionCacheIdentity("run", "v1", "htf_1", 1, "market"));
    expect(cache.has("run:v1:100:200:htf_1")).toBe(false);
    expect(cache.get("run:v1:100:200:htf_1")).toBeNull();
  });
});
