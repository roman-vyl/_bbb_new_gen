import { describe, expect, it } from "vitest";

import {
  buildSignalTraceUrlPath,
  buildTraceRequestKey,
  createSignalTraceRequestCoordinator,
  type TraceFetchParams,
} from "@/features/chart/runtime/signalTraceRequestCoordinator";

const PARAMS: TraceFetchParams = {
  runId: "2026-06-01T171633Z_ema_pullback_BTCUSDT_1h",
  variant: "ema_pullback_fast100_anchor200_slow1000",
  fromMs: 1762611900000,
  toOpenTimeMs: 1777611600000,
  contextOverlayRef: null,
};

const PARAMS_K2: TraceFetchParams = {
  ...PARAMS,
  fromMs: 1762700000000,
  toOpenTimeMs: 1777700000000,
};

describe("buildTraceRequestKey", () => {
  it("matches fetchSignalTrace URL resource", () => {
    const key = buildTraceRequestKey(PARAMS);
    const path = buildSignalTraceUrlPath(PARAMS);
    expect(path).toContain(`from=${PARAMS.fromMs}`);
    expect(path).toContain(`to_open_time_ms=${PARAMS.toOpenTimeMs}`);
    expect(path).toContain(`variant=${encodeURIComponent(PARAMS.variant)}`);
    expect(key).toBe(buildTraceRequestKey(PARAMS));
    expect(buildTraceRequestKey({ ...PARAMS })).toBe(key);
  });

  it("includes context_overlay_ref in key when set", () => {
    const withRef = { ...PARAMS, contextOverlayRef: "htf_regime_1" };
    expect(buildTraceRequestKey(withRef)).not.toBe(buildTraceRequestKey(PARAMS));
    expect(buildSignalTraceUrlPath(withRef)).toContain("context_overlay_ref=htf_regime_1");
  });
});

describe("SignalTraceRequestCoordinator", () => {
  it("authorizes fetch on cache miss", () => {
    const c = createSignalTraceRequestCoordinator();
    const key = buildTraceRequestKey(PARAMS);
    expect(c.evaluate({ key, generation: 1, displayCacheCoversWindow: false })).toEqual({
      action: "fetch",
      key,
      generation: 1,
    });
  });

  it("blocks in_flight for same key", () => {
    const c = createSignalTraceRequestCoordinator();
    const key = buildTraceRequestKey(PARAMS);
    c.markInFlight(key, 1);
    expect(c.evaluate({ key, generation: 1, displayCacheCoversWindow: false })).toEqual({
      action: "skip",
      key,
      reason: "in_flight",
    });
  });

  it("already_merged blocks fetch when display cache does not cover full window", () => {
    const c = createSignalTraceRequestCoordinator();
    const key = buildTraceRequestKey(PARAMS);
    c.markMerged(key, "network");
    expect(c.evaluate({ key, generation: 1, displayCacheCoversWindow: false })).toEqual({
      action: "skip",
      key,
      reason: "already_merged",
    });
  });

  it("cache_hit when merged and display covers", () => {
    const c = createSignalTraceRequestCoordinator();
    const key = buildTraceRequestKey(PARAMS);
    c.markMerged(key, "network");
    expect(c.evaluate({ key, generation: 1, displayCacheCoversWindow: true })).toEqual({
      action: "skip",
      key,
      reason: "cache_hit",
    });
  });

  it("failed_same_key prevents retry until reset", () => {
    const c = createSignalTraceRequestCoordinator();
    const key = buildTraceRequestKey(PARAMS);
    c.markFailed(key);
    expect(c.evaluate({ key, generation: 1, displayCacheCoversWindow: false })).toEqual({
      action: "skip",
      key,
      reason: "failed_same_key",
    });
    c.reset();
    expect(c.evaluate({ key, generation: 2, displayCacheCoversWindow: false }).action).toBe("fetch");
  });

  it("session_restore markMerged blocks subsequent fetch", () => {
    const c = createSignalTraceRequestCoordinator();
    const key = buildTraceRequestKey(PARAMS);
    c.markMerged(key, "session_restore");
    expect(c.evaluate({ key, generation: 1, displayCacheCoversWindow: false }).action).toBe("skip");
  });

  it("pan K1 K2 K1: merged K1 survives K2 fetch", () => {
    const c = createSignalTraceRequestCoordinator();
    const k1 = buildTraceRequestKey(PARAMS);
    const k2 = buildTraceRequestKey(PARAMS_K2);
    c.markMerged(k1, "network");
    expect(c.evaluate({ key: k2, generation: 1, displayCacheCoversWindow: false }).action).toBe("fetch");
    c.markMerged(k2, "network");
    expect(c.evaluate({ key: k1, generation: 1, displayCacheCoversWindow: false })).toEqual({
      action: "skip",
      key: k1,
      reason: "already_merged",
    });
  });

  it("multi-instance same key: second evaluate in_flight or already_merged", () => {
    const c = createSignalTraceRequestCoordinator();
    const key = buildTraceRequestKey(PARAMS);
    c.markInFlight(key, 1);
    expect(c.evaluate({ key, generation: 1, displayCacheCoversWindow: false }).reason).toBe("in_flight");
    c.clearInFlight(key, 1);
    c.markMerged(key, "network");
    expect(c.evaluate({ key, generation: 1, displayCacheCoversWindow: false }).reason).toBe(
      "already_merged",
    );
  });

  it("isResponseCurrent false after reset", () => {
    const c = createSignalTraceRequestCoordinator();
    const key = buildTraceRequestKey(PARAMS);
    c.markInFlight(key, 1);
    expect(c.isResponseCurrent(key, 1)).toBe(true);
    c.reset();
    expect(c.isResponseCurrent(key, 1)).toBe(false);
  });

  it("reset clears merged keys for new variant identity", () => {
    const c = createSignalTraceRequestCoordinator();
    const key = buildTraceRequestKey(PARAMS);
    c.markMerged(key, "network");
    c.reset();
    expect(c.evaluate({ key, generation: 1, displayCacheCoversWindow: false }).action).toBe("fetch");
  });
});
