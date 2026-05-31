import { describe, expect, it } from "vitest";

import {
  decideSignalTraceLoad,
  type SignalTraceRequest,
} from "@/shared/context/signalTraceLoadPolicy";

const REQUEST: SignalTraceRequest = {
  windowKey: "run-a:exp_a:1000:2000",
  runId: "run-a",
  variant: "exp_a",
  fromMs: 1_000_000,
  toOpenTimeMs: 2_000_000,
};

describe("decideSignalTraceLoad", () => {
  it("scenario A: skips when display cache covers render window", () => {
    const decision = decideSignalTraceLoad({
      chartWindowKey: REQUEST.windowKey,
      displayCacheCoversWindow: true,
      loadingTraceWindowKey: null,
      signalTraceStatus: "ready",
      inFlightRequest: null,
      request: REQUEST,
    });
    expect(decision).toEqual({ action: "skip_display_cache_hit" });
  });

  it("scenario B: skips when same window is already loading", () => {
    const decision = decideSignalTraceLoad({
      chartWindowKey: REQUEST.windowKey,
      displayCacheCoversWindow: false,
      loadingTraceWindowKey: REQUEST.windowKey,
      signalTraceStatus: "loading",
      inFlightRequest: REQUEST,
      request: REQUEST,
    });
    expect(decision).toEqual({ action: "skip_already_loading" });
  });

  it("scenario C: starts load when chartWindowKey changes and cache misses", () => {
    const nextKey = "run-a:exp_a:3000:4000";
    const nextRequest = { ...REQUEST, windowKey: nextKey, fromMs: 3_000_000, toOpenTimeMs: 4_000_000 };
    const decision = decideSignalTraceLoad({
      chartWindowKey: nextKey,
      displayCacheCoversWindow: false,
      loadingTraceWindowKey: null,
      signalTraceStatus: "ready",
      inFlightRequest: null,
      request: nextRequest,
    });
    expect(decision).toEqual({ action: "load_start", request: nextRequest });
  });

  it("scenario D: starts load when variant changes (new window key)", () => {
    const nextKey = "run-a:exp_b:1000:2000";
    const nextRequest = { ...REQUEST, windowKey: nextKey, variant: "exp_b" };
    const decision = decideSignalTraceLoad({
      chartWindowKey: nextKey,
      displayCacheCoversWindow: false,
      loadingTraceWindowKey: null,
      signalTraceStatus: "ready",
      inFlightRequest: null,
      request: nextRequest,
    });
    expect(decision).toEqual({ action: "load_start", request: nextRequest });
  });

  it("skips identical in-flight request", () => {
    const decision = decideSignalTraceLoad({
      chartWindowKey: REQUEST.windowKey,
      displayCacheCoversWindow: false,
      loadingTraceWindowKey: null,
      signalTraceStatus: "idle",
      inFlightRequest: REQUEST,
      request: REQUEST,
    });
    expect(decision).toEqual({ action: "skip_identical_in_flight" });
  });

  it("returns skip_idle when chartWindowKey is null", () => {
    const decision = decideSignalTraceLoad({
      chartWindowKey: null,
      displayCacheCoversWindow: false,
      loadingTraceWindowKey: null,
      signalTraceStatus: "idle",
      inFlightRequest: null,
      request: null,
    });
    expect(decision).toEqual({ action: "skip_idle" });
  });
});
