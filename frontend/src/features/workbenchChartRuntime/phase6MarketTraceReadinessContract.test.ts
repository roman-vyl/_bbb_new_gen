import { describe, expect, it } from "vitest";

import { evaluateSignalTraceBootstrap } from "@/shared/context/signalTraceBootstrap";
import { chartWindowKeyFromCandles } from "./chartModelRuntime";
import { resolveDisplayTraceRequestKey } from "./chartEventsRuntime";
import {
  applyTraceDisplayForWindow,
  buildTraceDisplayCacheKeyForRuntime,
  createTraceDisplayRuntimeController,
  resetTraceDisplayRuntimeCache,
} from "./traceDisplayRuntime";
import { makePhase6Candles, makePhase6Report, makePhase6Variant } from "./phase6ContractFixtures";

function bootstrapInput(
  overrides: Partial<Parameters<typeof evaluateSignalTraceBootstrap>[0]> = {},
): Parameters<typeof evaluateSignalTraceBootstrap>[0] {
  const report = makePhase6Report();
  const candles = makePhase6Candles(20);
  const windowKey = chartWindowKeyFromCandles(report.run_id, report.variants[0]!.variant, candles, null);
  return {
    report,
    reportLoadStatus: "ready",
    selectedRunId: report.run_id,
    selectedVariantKey: report.variants[0]!.variant,
    marketLoadStatus: "ready",
    runMarketViewIdentity: "identity-a",
    expectedRunMarketViewIdentity: "identity-a",
    chartWindowKey: windowKey,
    candles,
    renderWindowBounds: { fromSec: candles[0]!.time, toSec: candles[candles.length - 1]!.time },
    previousWindowKey: null,
    ...overrides,
  };
}

describe("Phase 6.1 market/trace readiness contract guards", () => {
  it("blocks trace bootstrap until market is ready", () => {
    const blocked = evaluateSignalTraceBootstrap(
      bootstrapInput({ marketLoadStatus: "loading" }),
    );
    expect(blocked.ready).toBe(false);
    if (blocked.ready) {
      return;
    }
    expect(blocked.reason).toBe("market_not_ready");
  });

  it("blocks trace bootstrap until render window bounds exist", () => {
    const blocked = evaluateSignalTraceBootstrap(
      bootstrapInput({ renderWindowBounds: null, candles: [] }),
    );
    expect(blocked.ready).toBe(false);
    if (blocked.ready) {
      return;
    }
    expect(blocked.reason).toBe("no_bounds");
  });

  it("allows trace bootstrap only after market and render-window readiness", () => {
    const ready = evaluateSignalTraceBootstrap(bootstrapInput());
    expect(ready.ready).toBe(true);
    if (!ready.ready) {
      return;
    }
    expect(ready.request.runId).toBe("run-a");
    expect(ready.windowKey).toContain("run-a:exp_a:");
  });

  it("keeps chart-events and dense fallback request keys stable for unchanged inputs", () => {
    const params = {
      runId: "run-a",
      variant: "exp_a",
      fromMs: 1_000_000,
      toOpenTimeMs: 1_900_000,
      contextOverlayRef: "overlay-a",
    };
    expect(resolveDisplayTraceRequestKey(params)).toBe(resolveDisplayTraceRequestKey(params));
    expect(
      buildTraceDisplayCacheKeyForRuntime({
        selectedRunId: "run-a",
        selectedVariantKey: "exp_a",
        effectiveContextOverlayRef: "overlay-a",
      }),
    ).toBe(
      buildTraceDisplayCacheKeyForRuntime({
        selectedRunId: "run-a",
        selectedVariantKey: "exp_a",
        effectiveContextOverlayRef: "overlay-a",
      }),
    );
  });

  it("retains prior display component events across unchanged loading re-applies", () => {
    const controller = createTraceDisplayRuntimeController();
    const cacheKey = buildTraceDisplayCacheKeyForRuntime({
      selectedRunId: "run-a",
      selectedVariantKey: makePhase6Variant().variant,
      effectiveContextOverlayRef: null,
    });
    resetTraceDisplayRuntimeCache(controller, cacheKey);
    const candles = makePhase6Candles(20);
    controller.componentEvents = [
      {
        time: candles[0]!.time,
        event_type: "point",
        role: "entry_block",
        side: "long",
        component_id: "entry",
        instance_id: "entry-1",
        label: "Entry",
        metadata: {},
      },
    ];
    controller.lastSlicedHtfOverlayPointCount = 1;

    applyTraceDisplayForWindow(controller, candles, "loading");
    const retainedEvents = controller.componentEvents;
    const revisionAfterFirstApply = controller.displayApplyRevision;

    applyTraceDisplayForWindow(controller, candles, "loading");

    expect(controller.componentEvents).toBe(retainedEvents);
    expect(controller.displayApplyRevision).toBeGreaterThan(revisionAfterFirstApply);
    expect(controller.displayCacheVersion).toBe(1);
  });
});
