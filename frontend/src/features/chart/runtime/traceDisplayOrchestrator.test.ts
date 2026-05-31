import { describe, expect, it } from "vitest";

import {
  planTraceDisplayLoad,
  shouldBlockTraceFetchForActivePan,
  traceDisplayPlanTouchesViewport,
} from "@/features/chart/runtime/traceDisplayOrchestrator";
import type { SignalTraceLoadDecision } from "@/shared/context/signalTraceLoadPolicy";

const READY_BOOTSTRAP = {
  ready: true as const,
  windowKey: "run-a:exp_a:1000:2000",
  request: {
    windowKey: "run-a:exp_a:1000:2000",
    runId: "run-a",
    variant: "exp_a",
    fromMs: 1_000_000,
    toOpenTimeMs: 2_000_000,
  },
  fetchSource: "initial" as const,
};

describe("shouldBlockTraceFetchForActivePan", () => {
  it("allows cache-hit display refresh during pan", () => {
    expect(
      shouldBlockTraceFetchForActivePan({
        interactionState: "user_panning",
        hasPendingShift: false,
        displayCacheCoversWindow: true,
        committedWindowKey: READY_BOOTSTRAP.windowKey,
        loadedWindowKey: null,
        loadingWindowKey: null,
        status: "ready",
      }),
    ).toBe(false);
  });
});

describe("planTraceDisplayLoad", () => {
  it("never plans viewport changes", () => {
    const plans = [
      planTraceDisplayLoad({
        bootstrap: READY_BOOTSTRAP,
        coalescedWindowKey: null,
        committedWindowKey: READY_BOOTSTRAP.windowKey,
        panScheduling: {
          interactionState: "idle_user_view",
          hasPendingShift: false,
          displayCacheCoversWindow: true,
          committedWindowKey: READY_BOOTSTRAP.windowKey,
          loadedWindowKey: null,
          loadingWindowKey: null,
          status: "ready",
        },
        loadDecision: { action: "skip_display_cache_hit" },
      }),
      planTraceDisplayLoad({
        bootstrap: READY_BOOTSTRAP,
        coalescedWindowKey: null,
        committedWindowKey: READY_BOOTSTRAP.windowKey,
        panScheduling: {
          interactionState: "user_panning",
          hasPendingShift: true,
          displayCacheCoversWindow: false,
          committedWindowKey: READY_BOOTSTRAP.windowKey,
          loadedWindowKey: null,
          loadingWindowKey: null,
          status: "idle",
        },
        loadDecision: { action: "load_start", request: READY_BOOTSTRAP.request },
      }),
    ];
    for (const plan of plans) {
      expect(traceDisplayPlanTouchesViewport(plan)).toBe(false);
    }
  });

  it("cache hit during pending shift applies display without fetch", () => {
    const plan = planTraceDisplayLoad({
      bootstrap: READY_BOOTSTRAP,
      coalescedWindowKey: null,
      committedWindowKey: READY_BOOTSTRAP.windowKey,
      panScheduling: {
        interactionState: "pending_shift",
        hasPendingShift: true,
        displayCacheCoversWindow: true,
        committedWindowKey: READY_BOOTSTRAP.windowKey,
        loadedWindowKey: "other",
        loadingWindowKey: null,
        status: "ready",
      },
      loadDecision: { action: "skip_display_cache_hit" },
    });
    expect(plan).toEqual({ action: "display_cache_hit" });
  });

  it("defers network fetch while pan is active", () => {
    const plan = planTraceDisplayLoad({
      bootstrap: READY_BOOTSTRAP,
      coalescedWindowKey: null,
      committedWindowKey: READY_BOOTSTRAP.windowKey,
      panScheduling: {
        interactionState: "user_panning",
        hasPendingShift: false,
        displayCacheCoversWindow: false,
        committedWindowKey: READY_BOOTSTRAP.windowKey,
        loadedWindowKey: null,
        loadingWindowKey: null,
        status: "idle",
      },
      loadDecision: { action: "load_start", request: READY_BOOTSTRAP.request },
    });
    expect(plan).toEqual({ action: "pan_block", applyDisplayFromCache: false });
  });

  it("maps display cache hit without network", () => {
    const plan = planTraceDisplayLoad({
      bootstrap: READY_BOOTSTRAP,
      coalescedWindowKey: null,
      committedWindowKey: READY_BOOTSTRAP.windowKey,
      panScheduling: {
        interactionState: "idle_user_view",
        hasPendingShift: false,
        displayCacheCoversWindow: true,
        committedWindowKey: READY_BOOTSTRAP.windowKey,
        loadedWindowKey: "run-a:exp_a:3000:4000",
        loadingWindowKey: null,
        status: "ready",
      },
      loadDecision: { action: "skip_display_cache_hit" },
    });
    expect(plan).toEqual({ action: "display_cache_hit" });
  });
});
