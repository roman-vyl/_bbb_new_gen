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
  it("returns skip_idle when chartWindowKey is null", () => {
    const decision = decideSignalTraceLoad({
      chartWindowKey: null,
      sessionCacheHasWindow: false,
      loadedSignalTraceWindowKey: null,
      request: null,
    });
    expect(decision).toEqual({ action: "skip_idle" });
  });

  it("returns restore_session_cache when session has window but loaded trace is stale", () => {
    const decision = decideSignalTraceLoad({
      chartWindowKey: REQUEST.windowKey,
      sessionCacheHasWindow: true,
      loadedSignalTraceWindowKey: WINDOW_B.windowKey,
      request: REQUEST,
    });
    expect(decision).toEqual({ action: "restore_session_cache" });
  });

  it("returns proceed for normal load path (coordinator authorizes network)", () => {
    const decision = decideSignalTraceLoad({
      chartWindowKey: REQUEST.windowKey,
      sessionCacheHasWindow: false,
      loadedSignalTraceWindowKey: null,
      request: REQUEST,
    });
    expect(decision).toEqual({ action: "proceed" });
  });

  it("returns proceed when session matches loaded window", () => {
    const decision = decideSignalTraceLoad({
      chartWindowKey: REQUEST.windowKey,
      sessionCacheHasWindow: true,
      loadedSignalTraceWindowKey: REQUEST.windowKey,
      request: REQUEST,
    });
    expect(decision).toEqual({ action: "proceed" });
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
