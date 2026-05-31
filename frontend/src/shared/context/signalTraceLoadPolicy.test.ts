import { describe, expect, it } from "vitest";

import {
  decideSignalTraceLoad,
  lanesSignalTraceError,
  lanesSignalTraceStatus,
  signalTraceMatchesChartWindow,
  type SignalTraceRequest,
} from "@/shared/context/signalTraceLoadPolicy";

const REQUEST: SignalTraceRequest = {
  windowKey: "run-a:exp_a:1000:2000",
  runId: "run-a",
  variant: "exp_a",
  fromMs: 1_000_000,
  toOpenTimeMs: 2_000_000,
};

const WINDOW_B: SignalTraceRequest = {
  windowKey: "run-a:exp_a:3000:4000",
  runId: "run-a",
  variant: "exp_a",
  fromMs: 3_000_000,
  toOpenTimeMs: 4_000_000,
};

describe("decideSignalTraceLoad", () => {
  it("scenario A: skips when display cache and loaded signal trace both match window", () => {
    const decision = decideSignalTraceLoad({
      chartWindowKey: REQUEST.windowKey,
      displayCacheCoversWindow: true,
      sessionCacheHasWindow: true,
      loadedSignalTraceWindowKey: REQUEST.windowKey,
      loadingTraceWindowKey: null,
      signalTraceStatus: "ready",
      inFlightRequest: null,
      request: REQUEST,
    });
    expect(decision).toEqual({ action: "skip_display_cache_hit" });
  });

  it("regression: cache covers window A but session has A — restore without fetch", () => {
    const decision = decideSignalTraceLoad({
      chartWindowKey: REQUEST.windowKey,
      displayCacheCoversWindow: true,
      sessionCacheHasWindow: true,
      loadedSignalTraceWindowKey: WINDOW_B.windowKey,
      loadingTraceWindowKey: null,
      signalTraceStatus: "ready",
      inFlightRequest: null,
      request: REQUEST,
    });
    expect(decision).toEqual({ action: "restore_session_cache" });
  });

  it("regression: cache covers window A but loaded signal trace is window B — must fetch for lanes", () => {
    const decision = decideSignalTraceLoad({
      chartWindowKey: REQUEST.windowKey,
      displayCacheCoversWindow: true,
      sessionCacheHasWindow: false,
      loadedSignalTraceWindowKey: WINDOW_B.windowKey,
      loadingTraceWindowKey: null,
      signalTraceStatus: "ready",
      inFlightRequest: null,
      request: REQUEST,
    });
    expect(decision).toEqual({ action: "load_start", request: REQUEST });
  });

  it("scenario B: skips when same window is already loading", () => {
    const decision = decideSignalTraceLoad({
      chartWindowKey: REQUEST.windowKey,
      displayCacheCoversWindow: false,
      sessionCacheHasWindow: false,
      loadedSignalTraceWindowKey: null,
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
      sessionCacheHasWindow: false,
      loadedSignalTraceWindowKey: REQUEST.windowKey,
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
      sessionCacheHasWindow: false,
      loadedSignalTraceWindowKey: REQUEST.windowKey,
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
      sessionCacheHasWindow: false,
      loadedSignalTraceWindowKey: null,
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
      sessionCacheHasWindow: false,
      loadedSignalTraceWindowKey: null,
      loadingTraceWindowKey: null,
      signalTraceStatus: "idle",
      inFlightRequest: null,
      request: null,
    });
    expect(decision).toEqual({ action: "skip_idle" });
  });
});

describe("lanesSignalTraceStatus", () => {
  it("does not report ready when cache covers A but loaded trace is for B", () => {
    expect(
      lanesSignalTraceStatus(REQUEST.windowKey, WINDOW_B.windowKey, "ready"),
    ).toBe("loading");
    expect(signalTraceMatchesChartWindow(REQUEST.windowKey, WINDOW_B.windowKey)).toBe(false);
  });

  it("does not surface error from another window (pan back to cached A after B failed)", () => {
    expect(
      lanesSignalTraceStatus(REQUEST.windowKey, WINDOW_B.windowKey, "error"),
    ).toBe("loading");
  });

  it("surfaces error when it belongs to the current window", () => {
    expect(
      lanesSignalTraceStatus(REQUEST.windowKey, REQUEST.windowKey, "error"),
    ).toBe("error");
  });

  it("reports ready when loaded trace matches chart window", () => {
    expect(
      lanesSignalTraceStatus(REQUEST.windowKey, REQUEST.windowKey, "ready"),
    ).toBe("ready");
  });
});

describe("lanesSignalTraceError", () => {
  it("hides stale error after pan to a different window", () => {
    expect(
      lanesSignalTraceError(REQUEST.windowKey, WINDOW_B.windowKey, "window B failed"),
    ).toBeNull();
  });

  it("shows error for the current window", () => {
    expect(
      lanesSignalTraceError(REQUEST.windowKey, REQUEST.windowKey, "window A failed"),
    ).toBe("window A failed");
  });
});
