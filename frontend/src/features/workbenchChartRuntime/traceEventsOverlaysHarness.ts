import type { ChartMarketBundle, RunReport, RunVariant } from "@/api/types";
import type { RunMarketView } from "@/features/chart/runMarketView";
import type { MarketDisplayWindowMs } from "@/features/chart/workbenchMarketLoad";
import { candleTimeBounds } from "@/features/chart/chartRenderWindowDisplay";

import {
  createAuxOverlayRuntimeController,
  loadBffAuxOverlaysRuntime,
  applyHtfOverlaysFromDisplaySlice,
  applyHtfOverlaysFromDenseTrace,
  resolveAuxEmaSpecsRuntime,
  resolveAuxOverlayRuntimeSnapshot,
  syncAuxOverlaySpecs,
  updateTraceDisplayHtfPointCount,
  type AuxOverlayRuntimeBoundary,
} from "./auxOverlayRuntime";
import {
  resolveChartEventsRuntimeSnapshot,
  type ChartEventsRuntimeBoundary,
} from "./chartEventsRuntime";
import {
  chartWindowKeyFromCandles,
  createChartModelStabilizeCache,
  resolveChartModelRuntime,
  type ChartModelRuntimeBoundary,
  type ChartModelStabilizeCache,
} from "./chartModelRuntime";
import {
  createDisplayRenderViewportHarness,
  type DisplayRenderViewportHarness,
  type DisplayRenderViewportSnapshot,
} from "./displayRenderViewportHarness";
import type { RuntimeLoadStatus } from "./runtimeTypes";
import {
  applyTraceDisplayForWindow,
  buildTraceDisplayCacheKeyForRuntime,
  createTraceDisplayRuntimeController,
  resetTraceDisplayRuntimeCache,
  resolveTraceDisplayRuntimeSnapshot,
  type TraceDisplayRuntimeBoundary,
} from "./traceDisplayRuntime";
import {
  buildTraceSessionCacheIdentity,
  createTraceRuntimeController,
  resetTraceCoordinator,
  resetTraceSessionCache,
  resolveTraceRuntimeSnapshot,
  runTraceLoadCycle,
  type TraceLoadCycleResult,
  type TraceRuntimeBoundary,
} from "./traceRuntime";

export type TraceEventsOverlaysHarnessContext = {
  displayHarness: DisplayRenderViewportHarness;
  traceDisplayController: ReturnType<typeof createTraceDisplayRuntimeController>;
  traceController: ReturnType<typeof createTraceRuntimeController>;
  auxOverlayController: ReturnType<typeof createAuxOverlayRuntimeController>;
  report: RunReport;
  variant: RunVariant;
  selectedRunId: string;
  selectedVariantKey: string;
  chartTimeframe: string;
  effectiveContextOverlayRef: string | null;
  reloadToken: number;
  marketIdentity: string;
  marketLoadStatus: RuntimeLoadStatus;
  chartModelCache: ChartModelStabilizeCache;
};

export type TraceEventsOverlaysSnapshot = {
  displayRender: DisplayRenderViewportSnapshot;
  traceDisplay: TraceDisplayRuntimeBoundary;
  trace: TraceRuntimeBoundary;
  chartEvents: ChartEventsRuntimeBoundary;
  auxOverlay: AuxOverlayRuntimeBoundary;
  chartModel: ChartModelRuntimeBoundary;
  chartWindowKey: string | null;
  renderWindowBounds: { fromSec: number; toSec: number } | null;
};

export type TraceEventsOverlaysHarness = {
  context: TraceEventsOverlaysHarnessContext;
  initialize(selectedTradeEntryTimeMs: number | null): TraceEventsOverlaysSnapshot;
  runTraceLoad(input?: {
    chartHeavyIoEnabled?: boolean;
    loadDisplayTraceChunk?: Parameters<typeof runTraceLoadCycle>[0]["loadDisplayTraceChunk"];
    loadDenseLanesTrace?: Parameters<typeof runTraceLoadCycle>[0]["loadDenseLanesTrace"];
    signal?: AbortSignal;
  }): Promise<TraceLoadCycleResult>;
  loadBffAuxOverlays(input?: {
    chartHeavyIoEnabled?: boolean;
    fetchOverlayEma?: Parameters<typeof loadBffAuxOverlaysRuntime>[1]["fetchOverlayEma"];
    signal?: AbortSignal;
  }): Promise<ReturnType<typeof loadBffAuxOverlaysRuntime>>;
  resolveSnapshot(): TraceEventsOverlaysSnapshot;
};

export function createTraceEventsOverlaysHarness(input: {
  report: RunReport;
  variant: RunVariant;
  bundle: ChartMarketBundle;
  foundationKey: string;
  view: RunMarketView;
  focusWindow: MarketDisplayWindowMs;
  coverageWindow: MarketDisplayWindowMs;
  marketIdentity: string;
  chartTimeframe: string;
  effectiveContextOverlayRef?: string | null;
  reloadToken?: number;
  marketLoadStatus?: RuntimeLoadStatus;
}): TraceEventsOverlaysHarness {
  const effectiveContextOverlayRef = input.effectiveContextOverlayRef ?? null;
  const reloadToken = input.reloadToken ?? 0;
  const marketLoadStatus = input.marketLoadStatus ?? "ready";

  const displayHarness = createDisplayRenderViewportHarness({
    bundle: input.bundle,
    foundationKey: input.foundationKey,
    view: input.view,
    focusWindow: input.focusWindow,
    coverageWindow: input.coverageWindow,
    marketLoadStatus,
    chartTimeframe: input.chartTimeframe,
    marketIdentity: input.marketIdentity,
  });

  const traceDisplayController = createTraceDisplayRuntimeController();
  const traceController = createTraceRuntimeController();
  const auxOverlayController = createAuxOverlayRuntimeController();

  const auxSpecs = resolveAuxEmaSpecsRuntime({
    selectedVariant: input.variant,
    chartTimeframe: input.chartTimeframe,
    effectiveContextOverlayRef,
  });
  syncAuxOverlaySpecs(auxOverlayController, auxSpecs);

  const traceDisplayCacheKey = buildTraceDisplayCacheKeyForRuntime({
    selectedRunId: input.report.run_id,
    selectedVariantKey: input.variant.variant,
    effectiveContextOverlayRef,
  });
  resetTraceDisplayRuntimeCache(traceDisplayController, traceDisplayCacheKey);
  resetTraceCoordinator(traceController);

  const sessionIdentity = buildTraceSessionCacheIdentity({
    selectedRunId: input.report.run_id,
    selectedVariantKey: input.variant.variant,
    effectiveContextOverlayRef,
    reloadToken,
    marketIdentity: input.marketIdentity,
  });
  resetTraceSessionCache(traceController, sessionIdentity);

  const context: TraceEventsOverlaysHarnessContext = {
    displayHarness,
    traceDisplayController,
    traceController,
    auxOverlayController,
    report: input.report,
    variant: input.variant,
    selectedRunId: input.report.run_id,
    selectedVariantKey: input.variant.variant,
    chartTimeframe: input.chartTimeframe,
    effectiveContextOverlayRef,
    reloadToken,
    marketIdentity: input.marketIdentity,
    marketLoadStatus,
    chartModelCache: createChartModelStabilizeCache(),
  };

  function resolveSnapshot(): TraceEventsOverlaysSnapshot {
    const displayRender = context.displayHarness.resolveSnapshot();
    const candles = displayRender.chartWindow.parts.candles;
    const chartWindowKey = chartWindowKeyFromCandles(
      context.selectedRunId,
      context.selectedVariantKey,
      candles,
      context.effectiveContextOverlayRef,
    );
    const renderWindowBounds = candleTimeBounds(candles);

    applyTraceDisplayForWindow(
      context.traceDisplayController,
      candles,
      context.traceController.lanesStatus,
    );

    const traceDisplay = resolveTraceDisplayRuntimeSnapshot(
      context.traceDisplayController,
      candles,
      context.traceController.lanesStatus,
    );

    const appliedHtfSlice = context.traceDisplayController.traceDisplayState.htfSlice;
    if (appliedHtfSlice.times.length > 0 && appliedHtfSlice.htf_context) {
      applyHtfOverlaysFromDisplaySlice(context.auxOverlayController, appliedHtfSlice);
    } else if (context.traceController.lanesBundle !== null) {
      applyHtfOverlaysFromDenseTrace(
        context.auxOverlayController,
        context.traceController.lanesBundle,
      );
    }

    const trace = resolveTraceRuntimeSnapshot(context.traceController, chartWindowKey);

    const coverage =
      renderWindowBounds !== null
        ? {
            coversWindow: context.traceDisplayController.cache.coversRange(
              renderWindowBounds.fromSec,
              renderWindowBounds.toSec,
            ),
            hasWindowData:
              context.traceDisplayController.cache.sliceEventsForWindow(
                renderWindowBounds.fromSec,
                renderWindowBounds.toSec,
              ).length > 0 ||
              context.traceDisplayController.cache.sliceHtfContextForWindow(
                renderWindowBounds.fromSec,
                renderWindowBounds.toSec,
              ).times.length > 0,
          }
        : { coversWindow: false, hasWindowData: false };

    updateTraceDisplayHtfPointCount(context.auxOverlayController, context.traceDisplayController);

    const htfSlice = traceDisplay.implemented
      ? traceDisplay.traceDisplayState.htfSlice
      : undefined;

    const auxOverlay = resolveAuxOverlayRuntimeSnapshot({
      controller: context.auxOverlayController,
      slicedAuxOverlays:
        context.auxOverlayController.auxEmaOverlays.length > 0
          ? context.auxOverlayController.auxEmaOverlays
          : displayRender.chartWindow.parts.auxEmaOverlays,
      renderWindowCandles: candles,
      chartWindowKey,
      loadedSignalTraceWindowKey: context.traceController.loadedWindowKey,
      displayCacheCoversWindow: coverage.coversWindow,
      displayCacheHasWindowData: coverage.hasWindowData,
      signalTraceStatus: context.traceController.lanesStatus,
      htfSlice,
    });

    const chartModel = resolveChartModelRuntime({
      chartWindowParts: {
        candles: displayRender.chartWindow.parts.candles,
        emaOverlays: displayRender.chartWindow.parts.emaOverlays,
        auxEmaOverlays: displayRender.chartWindow.parts.auxEmaOverlays,
        componentEvents: traceDisplay.componentEvents,
      },
      displayAuxEmaOverlays: auxOverlay.displayAuxEmaOverlays,
      traceDisplay,
      auxOverlay,
      viewMode: displayRender.viewMode,
      centerTimeSec: displayRender.centerTimeSec,
      firstTimeSec: displayRender.chartWindow.firstTimeSec,
      lastTimeSec: displayRender.chartWindow.lastTimeSec,
      count: displayRender.chartWindow.count,
      stabilizeCache: context.chartModelCache,
    });

    const chartEvents = resolveChartEventsRuntimeSnapshot({
      componentEventCount: traceDisplay.componentEvents.length,
      displayResult: null,
      lanesOnlyFetch: false,
    });

    return {
      displayRender,
      traceDisplay,
      trace,
      chartEvents,
      auxOverlay,
      chartModel,
      chartWindowKey,
      renderWindowBounds,
    };
  }

  const harness: TraceEventsOverlaysHarness = {
    context,
    initialize(selectedTradeEntryTimeMs) {
      context.displayHarness.initialize(selectedTradeEntryTimeMs);
      return harness.resolveSnapshot();
    },
    async runTraceLoad(runInput = {}) {
      const snapshot = harness.resolveSnapshot();
      const candles = snapshot.displayRender.chartWindow.parts.candles;
      const interactionState =
        context.displayHarness.context.renderController.chartRuntime.renderWindow.getInteractionState();

      const result = await runTraceLoadCycle({
        chartHeavyIoEnabled: runInput.chartHeavyIoEnabled ?? true,
        reportLoadStatus: "ready",
        report: context.report,
        selectedRunId: context.selectedRunId,
        selectedVariantKey: context.selectedVariantKey,
        marketLoadStatus: context.marketLoadStatus,
        runMarketViewIdentity: context.marketIdentity,
        expectedRunMarketViewIdentity: context.marketIdentity,
        effectiveContextOverlayRef: context.effectiveContextOverlayRef,
        chartTimeframe: context.chartTimeframe,
        chartWindowKey: snapshot.chartWindowKey,
        candles,
        renderWindowBounds: snapshot.renderWindowBounds,
        interactionState,
        hasPendingShift:
          context.displayHarness.context.renderController.chartRuntime.renderWindow.getPendingShift() !==
          null,
        traceController: context.traceController,
        displayController: context.traceDisplayController,
        signal: runInput.signal,
        loadDisplayTraceChunk: runInput.loadDisplayTraceChunk,
        loadDenseLanesTrace: runInput.loadDenseLanesTrace,
      });

      return result;
    },
    async loadBffAuxOverlays(loadInput = {}) {
      return loadBffAuxOverlaysRuntime(context.auxOverlayController, {
        chartHeavyIoEnabled: loadInput.chartHeavyIoEnabled ?? true,
        marketLoadStatus: context.marketLoadStatus,
        report: context.report,
        chartTimeframe: context.chartTimeframe,
        signal: loadInput.signal,
        fetchOverlayEma: loadInput.fetchOverlayEma,
      });
    },
    resolveSnapshot() {
      return resolveSnapshot();
    },
  };

  return harness;
}

/** Shadow-only resolver for production-mounted debug without production cache writes. */
export function resolveTraceEventsOverlaysShadow(input: {
  report: RunReport | null;
  variant: RunVariant | null;
  bundle: ChartMarketBundle | null;
  foundationKey: string | null;
  view: RunMarketView | null;
  focusWindow: MarketDisplayWindowMs | null;
  coverageWindow: MarketDisplayWindowMs | null;
  marketIdentity: string | null;
  chartTimeframe: string;
  effectiveContextOverlayRef: string | null;
  reloadToken: number;
  marketLoadStatus: RuntimeLoadStatus;
  selectedTradeEntryTimeMs: number | null;
}): TraceEventsOverlaysSnapshot | null {
  if (
    input.report === null ||
    input.variant === null ||
    input.bundle === null ||
    input.foundationKey === null ||
    input.view === null ||
    input.focusWindow === null ||
    input.coverageWindow === null ||
    input.marketIdentity === null ||
    input.marketLoadStatus !== "ready"
  ) {
    return null;
  }

  const harness = createTraceEventsOverlaysHarness({
    report: input.report,
    variant: input.variant,
    bundle: input.bundle,
    foundationKey: input.foundationKey,
    view: input.view,
    focusWindow: input.focusWindow,
    coverageWindow: input.coverageWindow,
    marketIdentity: input.marketIdentity,
    chartTimeframe: input.chartTimeframe,
    effectiveContextOverlayRef: input.effectiveContextOverlayRef,
    reloadToken: input.reloadToken,
    marketLoadStatus: input.marketLoadStatus,
  });
  harness.initialize(input.selectedTradeEntryTimeMs);
  return harness.resolveSnapshot();
}
