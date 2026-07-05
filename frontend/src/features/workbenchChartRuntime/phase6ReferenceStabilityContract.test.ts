import { beforeEach, describe, expect, it } from "vitest";

import type { ChartMarketBundle } from "@/api/types";
import { clearMarketResourceCache, mergeCandlesWindowBundle } from "@/features/chart/marketResourceCache";
import { createChartDataWindowManager } from "@/features/chart/chartDataWindowManager";
import { buildRunMarketViewIdentity, resolveRunMarketView } from "@/features/chart/runMarketView";
import { resolveMarketTargetWindow } from "@/features/chart/workbenchMarketLoad";
import { createMarketLoadHarness } from "./marketLoadHarness";
import { evaluatePanPrefetchCandidate } from "./panRuntime";
import { resolveChartModelRuntime } from "./chartModelRuntime";
import {
  createChartWindowStabilizeCaches,
  resolveChartWindowRuntime,
} from "./chartWindowRuntime";
import { resolveMarketWindowRuntime } from "./marketWindowRuntime";
import { makePhase6Candles, makePhase6Report, makePhase6Variant } from "./phase6ContractFixtures";

describe("Phase 6.1 reference stability contract guards", () => {
  beforeEach(() => {
    clearMarketResourceCache();
  });

  it("keeps chart window slice array references stable for unchanged bounds keys", () => {
    const candles = makePhase6Candles(120);
    const bundle: ChartMarketBundle = {
      candles,
      ema_overlays: [],
    };
    const manager = createChartDataWindowManager();
    manager.reset(candles.length);
    manager.buildTailWindow();
    const stabilizeCaches = createChartWindowStabilizeCaches();

    const first = resolveChartWindowRuntime({
      bundle,
      marketLoadStatus: "ready",
      manager,
      auxEmaOverlays: [],
      marketIdentity: "identity-a",
      stabilizeCaches,
    });
    const second = resolveChartWindowRuntime({
      bundle,
      marketLoadStatus: "ready",
      manager,
      auxEmaOverlays: [],
      marketIdentity: "identity-a",
      stabilizeCaches,
    });

    expect(first.implemented).toBe(true);
    expect(second.implemented).toBe(true);
    if (!first.implemented || !second.implemented) {
      return;
    }
    expect(first.count).toBeGreaterThan(0);

    expect(first.seriesKey).toBe(second.seriesKey);
    expect(first.parts.candles).toBe(second.parts.candles);
    expect(first.parts.emaOverlays).toBe(second.parts.emaOverlays);
    expect(first.parts.auxEmaOverlays).toBe(second.parts.auxEmaOverlays);
  });

  it("does not expand coverage on programmatic viewport suppression", () => {
    const view = resolveRunMarketView({
      report: makePhase6Report(),
      chartTimeframe: "5m",
      variant: makePhase6Variant(),
      reloadToken: 0,
    });
    const coverageWindow = {
      fromMs: 1_000_000,
      toMs: 1_900_000,
      toOpenTimeMs: 1_600_000,
    };

    const decision = evaluatePanPrefetchCandidate({
      view,
      coverageWindow,
      visibleFromSec: 1_000,
      visibleToSec: 1_050,
      timeframeMs: 300_000,
      chartHeavyIoEnabled: true,
      interactionState: "user_panning",
      programmaticViewportActive: true,
    });

    expect(decision.expansion).toBeNull();
    expect(decision.reason).toBe("suppressed_programmatic");
    expect(decision.suppressedProgrammatic).toBe(true);
  });

  it("does not promote market ready state again on repeated cache-hit cycles", async () => {
    const report = makePhase6Report();
    const variant = makePhase6Variant();
    const view = resolveRunMarketView({
      report,
      chartTimeframe: "5m",
      variant,
      reloadToken: 0,
    });
    const viewIdentity = buildRunMarketViewIdentity(view);
    const target = resolveMarketTargetWindow(view, null);
    mergeCandlesWindowBundle(view.candlesKey, {
      candles: [{ time: target.fromMs / 1000, open: 1, high: 1, low: 1, close: 1 }],
      coverage: {
        requested_from_ms: target.fromMs,
        requested_to_ms: target.toMs,
        actual_from_ms: target.fromMs,
        actual_to_ms: target.toMs,
        truncated: false,
      },
    });

    const harness = createMarketLoadHarness({ view, viewIdentity });
    const first = await harness.runLoad({
      symbol: report.symbol,
      timeframe: "5m",
      executeLoad: async () => ({ candlesFetched: false, emaFetched: 0 }),
    });
    const candlesRevisionBefore = harness.context.controller.candlesRevision;
    const second = await harness.runLoad({
      symbol: report.symbol,
      timeframe: "5m",
      executeLoad: async () => ({ candlesFetched: false, emaFetched: 0 }),
    });

    expect(first.outcome).toBe("cache_hit_ready");
    expect(first.focusReadyFromCache).toBe(true);
    expect(second.outcome).toBe("applied");
    expect(second.focusReadyFromCache).toBe(false);
    expect(harness.context.controller.status).toBe("ready");
    expect(harness.context.controller.candlesRevision).toBe(candlesRevisionBefore);
  });

  it("keeps chart model seriesKey stable for unchanged chart window parts", () => {
    const candles = makePhase6Candles(40);
    const parts = {
      candles,
      emaOverlays: [],
      auxEmaOverlays: [],
      componentEvents: [],
    };

    const first = resolveChartModelRuntime({
      chartWindowParts: parts,
      displayAuxEmaOverlays: [],
      traceDisplay: {
        implemented: true,
        status: "idle",
        componentEvents: [],
        componentEventsStale: false,
        displayApplyRevision: 1,
        missingRange: null,
        traceDisplayState: {
          status: "current",
          fromSec: candles[0]!.time,
          toSec: candles[candles.length - 1]!.time,
          events: [],
          htfSlice: { times: [], htf_context: undefined },
          coveredRanges: [],
          missingRange: null,
        },
        displayCacheCoversWindow: true,
        displayCacheHasWindowData: false,
      },
      auxOverlay: {
        implemented: true,
        auxEmaOverlays: [],
        displayAuxEmaOverlays: [],
        htfAuxEmaOverlayStale: false,
        auxOverlayCount: 0,
        htfOverlayCount: 0,
        auxEmaSpecs: [],
      },
      viewMode: "around-trade",
      centerTimeSec: 1_200,
      firstTimeSec: candles[0]!.time,
      lastTimeSec: candles[candles.length - 1]!.time,
      count: candles.length,
    });

    const second = resolveChartModelRuntime({
      chartWindowParts: parts,
      displayAuxEmaOverlays: [],
      traceDisplay: {
        implemented: true,
        status: "idle",
        componentEvents: [],
        componentEventsStale: false,
        displayApplyRevision: 1,
        missingRange: null,
        traceDisplayState: {
          status: "current",
          fromSec: candles[0]!.time,
          toSec: candles[candles.length - 1]!.time,
          events: [],
          htfSlice: { times: [], htf_context: undefined },
          coveredRanges: [],
          missingRange: null,
        },
        displayCacheCoversWindow: true,
        displayCacheHasWindowData: false,
      },
      auxOverlay: {
        implemented: true,
        auxEmaOverlays: [],
        displayAuxEmaOverlays: [],
        htfAuxEmaOverlayStale: false,
        auxOverlayCount: 0,
        htfOverlayCount: 0,
        auxEmaSpecs: [],
      },
      viewMode: "around-trade",
      centerTimeSec: 1_200,
      firstTimeSec: candles[0]!.time,
      lastTimeSec: candles[candles.length - 1]!.time,
      count: candles.length,
    });

    expect(first.implemented).toBe(true);
    expect(second.implemented).toBe(true);
    if (!first.implemented || !second.implemented) {
      return;
    }

    expect(first.chartViewModel.seriesKey).toBe(second.chartViewModel.seriesKey);
    expect(first.chartViewModel.candles).toBe(second.chartViewModel.candles);
  });

  it("preserves market window state when reset key is unchanged", () => {
    const report = makePhase6Report();
    const variant = makePhase6Variant();
    const view = resolveRunMarketView({
      report,
      chartTimeframe: "5m",
      variant,
      reloadToken: 0,
    });
    const first = resolveMarketWindowRuntime({
      view,
      marketIdentity: "identity-a",
      expectedMarketIdentity: "identity-a",
      selectedTradeEntryTimeMs: 1_200_000,
    });
    const second = resolveMarketWindowRuntime({
      view,
      marketIdentity: "identity-a",
      expectedMarketIdentity: "identity-a",
      selectedTradeEntryTimeMs: 1_200_000,
      previous: {
        marketIdentity: first.marketIdentity,
        selectedTradeEntryTimeMs: first.selectedTradeEntryTimeMs,
        resetKey: first.resetKey,
        focusWindow: first.focusWindow,
        coverageWindow: first.coverageWindow,
      },
    });

    expect(second.resetReasons).toContain("unchanged");
    expect(second.focusWindow).toEqual(first.focusWindow);
    expect(second.coverageWindow).toEqual(first.coverageWindow);
    expect(second.focusMode).toBe("around-trade");
  });
});
