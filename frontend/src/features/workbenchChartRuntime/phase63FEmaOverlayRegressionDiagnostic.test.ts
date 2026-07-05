import { beforeEach, describe, expect, it } from "vitest";

import { CHART_OVERLAY_EMA_KIND } from "@/api/types";
import { clearMarketResourceCache, mergeCandlesWindowBundle, mergeEmaWindowBundle } from "@/features/chart/marketResourceCache";
import { resolveRunMarketView } from "@/features/chart/runMarketView";
import {
  buildMarketTargetWindowKey,
  type MarketDisplayWindowMs,
} from "@/features/chart/workbenchMarketLoad";

import { makePhase6Report } from "./phase6ContractFixtures";
import { readWorkspaceSource } from "./phase6StaticGuardUtils";
import { findForbiddenAdapterFallbackPatterns } from "./runtimeOutputAdapter.contract";
import { resolvePhase63AModelRuntimeSlice } from "./phase63AModelAdapterBridge";
import {
  createPhase63BRenderWindowOwnerState,
  resolvePhase63BChartWindowSlice,
  runPhase63BRenderWindowInit,
} from "./phase63BRenderWindowBridge";
import {
  createPhase63FMarketLoadOwnerState,
  resolvePhase63FMarketBundleSnapshot,
} from "./phase63FMarketLoadBridge";

const FOCUS_WINDOW: MarketDisplayWindowMs = {
  fromMs: 1_300_000,
  toMs: 1_900_000,
  toOpenTimeMs: 1_600_000,
};

const COVERAGE_WINDOW: MarketDisplayWindowMs = {
  fromMs: 1_000_000,
  toMs: 1_900_000,
  toOpenTimeMs: 1_600_000,
};

function seedCandlesForWindows(candlesKey: string, times: number[]): void {
  mergeCandlesWindowBundle(candlesKey, {
    candles: times.map((time) => ({ time, open: 1, high: 1, low: 1, close: 1 })),
    coverage: {
      requested_from_ms: COVERAGE_WINDOW.fromMs,
      requested_to_ms: COVERAGE_WINDOW.toMs,
      actual_from_ms: COVERAGE_WINDOW.fromMs,
      actual_to_ms: COVERAGE_WINDOW.toMs,
      truncated: false,
    },
  });
  mergeCandlesWindowBundle(candlesKey, {
    candles: times.map((time) => ({ time, open: 1, high: 1, low: 1, close: 1 })),
    coverage: {
      requested_from_ms: FOCUS_WINDOW.fromMs,
      requested_to_ms: FOCUS_WINDOW.toMs,
      actual_from_ms: FOCUS_WINDOW.fromMs,
      actual_to_ms: FOCUS_WINDOW.toMs,
      truncated: false,
    },
  });
}

function seedAnchorEma(
  overlayKey: string,
  times: number[],
): void {
  mergeEmaWindowBundle(overlayKey, {
    points: times.map((time) => ({ time, value: time, kind: CHART_OVERLAY_EMA_KIND })),
    coverage: {
      requested_from_ms: COVERAGE_WINDOW.fromMs,
      requested_to_ms: COVERAGE_WINDOW.toMs,
      actual_from_ms: COVERAGE_WINDOW.fromMs,
      actual_to_ms: COVERAGE_WINDOW.toMs,
      calculation_origin_ms: COVERAGE_WINDOW.fromMs,
      coverage_to_ms: COVERAGE_WINDOW.toMs,
      cache_hit: false,
      truncated: false,
    },
  });
}

describe("Phase 6.3F EMA overlay regression diagnostics", () => {
  beforeEach(() => {
    clearMarketResourceCache();
  });

  it("characterization: candles-only cache yields zero anchor EMA overlays in market bundle", () => {
    const report = makePhase6Report();
    const variant = report.variants[0]!;
    const view = resolveRunMarketView({
      report,
      chartTimeframe: "5m",
      variant,
      reloadToken: 0,
    });
    const times = Array.from({ length: 20 }, (_, i) => 1_300 + i * 300);
    seedCandlesForWindows(view.candlesKey, times);

    const owner = createPhase63FMarketLoadOwnerState();
    const snapshot = resolvePhase63FMarketBundleSnapshot({
      owner,
      view,
      focusWindow: FOCUS_WINDOW,
      coverageWindow: COVERAGE_WINDOW,
      focusWindowKey: buildMarketTargetWindowKey("identity", FOCUS_WINDOW),
      marketLoadStatus: "ready",
      marketLoadError: null,
    });

    expect(snapshot.bundle?.candles.length).toBeGreaterThan(0);
    expect(snapshot.bundle?.ema_overlays.length).toBe(0);
  });

  it("characterization: seeded anchor EMA overlays survive into market bundle", () => {
    const report = makePhase6Report();
    const variant = report.variants[0]!;
    const view = resolveRunMarketView({
      report,
      chartTimeframe: "5m",
      variant,
      reloadToken: 0,
    });
    const times = Array.from({ length: 20 }, (_, i) => 1_300 + i * 300);
    seedCandlesForWindows(view.candlesKey, times);
    for (const ref of view.overlayRefs) {
      seedAnchorEma(ref.key, times);
    }

    const owner = createPhase63FMarketLoadOwnerState();
    const snapshot = resolvePhase63FMarketBundleSnapshot({
      owner,
      view,
      focusWindow: FOCUS_WINDOW,
      coverageWindow: COVERAGE_WINDOW,
      focusWindowKey: buildMarketTargetWindowKey("identity", FOCUS_WINDOW),
      marketLoadStatus: "ready",
      marketLoadError: null,
    });

    expect(snapshot.bundle?.ema_overlays.length).toBe(view.overlayRefs.length);
  });

  it("characterization: empty bundle anchor EMA yields zero render-window slice overlays", () => {
    const report = makePhase6Report();
    const variant = report.variants[0]!;
    const view = resolveRunMarketView({
      report,
      chartTimeframe: "5m",
      variant,
      reloadToken: 0,
    });
    const times = Array.from({ length: 20 }, (_, i) => 1_300 + i * 300);
    seedCandlesForWindows(view.candlesKey, times);

    const owner = createPhase63FMarketLoadOwnerState();
    const snapshot = resolvePhase63FMarketBundleSnapshot({
      owner,
      view,
      focusWindow: FOCUS_WINDOW,
      coverageWindow: COVERAGE_WINDOW,
      focusWindowKey: buildMarketTargetWindowKey("identity", FOCUS_WINDOW),
      marketLoadStatus: "ready",
      marketLoadError: null,
    });
    expect(snapshot.bundle).not.toBeNull();

    const renderOwner = createPhase63BRenderWindowOwnerState(() => {});
    runPhase63BRenderWindowInit(renderOwner, {
      foundationKey: snapshot.foundationKey,
      marketLoadStatus: "ready",
      bundleCandles: snapshot.bundle!.candles,
      selectedTradeEntryTimeMs: null,
      variantKey: variant.variant,
    });

    const slice = resolvePhase63BChartWindowSlice(renderOwner, {
      bundle: snapshot.bundle,
      marketLoadStatus: "ready",
      auxEmaOverlays: [],
      marketIdentity: "identity",
    });

    expect(slice.implemented).toBe(true);
    if (slice.implemented) {
      expect(slice.parts.emaOverlays.length).toBe(0);
    }
  });

  it("characterization: seeded bundle anchor EMA produces nonzero render-window slice overlays", () => {
    const report = makePhase6Report();
    const variant = report.variants[0]!;
    const view = resolveRunMarketView({
      report,
      chartTimeframe: "5m",
      variant,
      reloadToken: 0,
    });
    const times = Array.from({ length: 20 }, (_, i) => 1_300 + i * 300);
    seedCandlesForWindows(view.candlesKey, times);
    for (const ref of view.overlayRefs) {
      seedAnchorEma(ref.key, times);
    }

    const owner = createPhase63FMarketLoadOwnerState();
    const snapshot = resolvePhase63FMarketBundleSnapshot({
      owner,
      view,
      focusWindow: FOCUS_WINDOW,
      coverageWindow: COVERAGE_WINDOW,
      focusWindowKey: buildMarketTargetWindowKey("identity", FOCUS_WINDOW),
      marketLoadStatus: "ready",
      marketLoadError: null,
    });

    const renderOwner = createPhase63BRenderWindowOwnerState(() => {});
    runPhase63BRenderWindowInit(renderOwner, {
      foundationKey: snapshot.foundationKey,
      marketLoadStatus: "ready",
      bundleCandles: snapshot.bundle!.candles,
      selectedTradeEntryTimeMs: null,
      variantKey: variant.variant,
    });

    const slice = resolvePhase63BChartWindowSlice(renderOwner, {
      bundle: snapshot.bundle,
      marketLoadStatus: "ready",
      auxEmaOverlays: [],
      marketIdentity: "identity",
    });

    expect(slice.implemented).toBe(true);
    if (slice.implemented) {
      expect(slice.parts.emaOverlays.length).toBe(view.overlayRefs.length);
    }
  });

  it("characterization: model adapter outputs zero chartEmaOverlays when chartView has none", () => {
    const { chartViewModel } = resolvePhase63AModelRuntimeSlice({
      chartView: {
        candles: [{ time: 100, open: 1, high: 1, low: 1, close: 1 }],
        emaOverlays: [],
        auxEmaOverlays: [],
        mode: "tail",
        centerTimeSec: null,
        firstTimeSec: 100,
        lastTimeSec: 100,
        count: 1,
      },
      chartDisplayAuxEmaOverlays: [],
      chartDisplayComponentEvents: [],
      htfAuxEmaOverlayStale: false,
      componentEventsStale: false,
      traceDisplayState: { status: "empty", missingRange: null },
    });

    expect(chartViewModel.emaOverlays.length).toBe(0);
  });

  it("regression guard: market bridge does not use old-market bundle fallback patterns", () => {
    const bridgeSource = readWorkspaceSource(
      "src/features/workbenchChartRuntime/phase63FMarketLoadBridge.ts",
    );
    expect(findForbiddenAdapterFallbackPatterns(bridgeSource)).toEqual([]);
    expect(bridgeSource).not.toContain("?? oldMarketBundle");
  });
});
