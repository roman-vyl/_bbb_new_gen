import { describe, expect, it } from "vitest";

import {
  planTraceDisplayLoad,
  shouldBlockTraceFetchForActivePan,
  traceDisplayPlanTouchesViewport,
} from "@/features/chart/runtime/traceDisplayOrchestrator";

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

const IDLE_PAN = {
  interactionState: "idle_user_view" as const,
  hasPendingShift: false,
  displayCacheCoversWindow: false,
  committedWindowKey: READY_BOOTSTRAP.windowKey,
  loadedWindowKey: null,
  status: "idle" as const,
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
        panScheduling: { ...IDLE_PAN, displayCacheCoversWindow: true },
        loadDecision: { action: "proceed" },
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
          status: "idle",
        },
        loadDecision: { action: "proceed" },
      }),
    ];
    for (const plan of plans) {
      expect(traceDisplayPlanTouchesViewport(plan)).toBe(false);
    }
  });

  it("cache hit during pending shift still goes through network evaluation stage", () => {
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
        status: "ready",
      },
      loadDecision: { action: "proceed" },
    });
    expect(plan).toEqual({ action: "evaluate_network" });
  });

  it("defers network evaluation while pan is active", () => {
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
        status: "idle",
      },
      loadDecision: { action: "proceed" },
    });
    expect(plan).toEqual({ action: "pan_block", applyDisplayFromCache: false });
  });

  it("routes covered idle window to evaluate_network for coordinator decision", () => {
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
        status: "ready",
      },
      loadDecision: { action: "proceed" },
    });
    expect(plan).toEqual({ action: "evaluate_network" });
  });

  it("routes uncovered idle window to evaluate_network", () => {
    const plan = planTraceDisplayLoad({
      bootstrap: READY_BOOTSTRAP,
      coalescedWindowKey: null,
      committedWindowKey: READY_BOOTSTRAP.windowKey,
      panScheduling: IDLE_PAN,
      loadDecision: { action: "proceed" },
    });
    expect(plan).toEqual({ action: "evaluate_network" });
  });
});
