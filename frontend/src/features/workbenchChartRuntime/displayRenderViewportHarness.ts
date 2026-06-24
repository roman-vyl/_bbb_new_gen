import type { ChartAuxEmaOverlay, ChartMarketBundle } from "@/api/types";
import { resolveChartTimeframeMs } from "@/features/chart/chartTimeframeMs";
import type { RunMarketView } from "@/features/chart/runMarketView";
import type { MarketDisplayWindowMs } from "@/features/chart/workbenchMarketLoad";
import type { ViewportCommand } from "@/features/chart/runtime/types";
import { emptyChartViewWindow, type ChartViewMode } from "@/features/chart/chartViewWindow";

import {
  createChartWindowStabilizeCaches,
  resolveChartWindowFromRenderController,
  type ChartWindowRuntimeBoundary,
} from "./chartWindowRuntime";
import {
  applyRenderWindowForTradeRuntime,
  createRenderWindowRuntimeController,
  initializeRenderWindowRuntime,
  resolveRenderWindowRuntimeSnapshot,
  type RenderWindowRuntimeBoundary,
  type RenderWindowRuntimeController,
} from "./renderWindowRuntime";
import {
  createInteractionRuntimeHarness,
  dispatchInteractionCandidate,
  applyWindowSwapCommitCandidate,
  type InteractionDispatchCandidate,
} from "./interactionRuntime";
import {
  createViewportRuntimeState,
  recordViewportCommandCandidate,
  resolveViewportRuntimeCandidate,
  setViewportPlanCandidate,
  type ViewportRuntimeCandidate,
} from "./viewportRuntime";
import type { RuntimeLoadStatus } from "./runtimeTypes";

export type DisplayRenderViewportHarnessContext = {
  renderController: RenderWindowRuntimeController;
  viewportState: ReturnType<typeof createViewportRuntimeState>;
  interactionHarness: ReturnType<typeof createInteractionRuntimeHarness>;
  bundle: ChartMarketBundle;
  foundationKey: string;
  view: RunMarketView;
  focusWindow: MarketDisplayWindowMs;
  coverageWindow: MarketDisplayWindowMs;
  marketLoadStatus: RuntimeLoadStatus;
  chartTimeframe: string;
  marketIdentity: string;
  auxEmaOverlays: ChartAuxEmaOverlay[];
  stabilizeCaches: ReturnType<typeof createChartWindowStabilizeCaches>;
  previousBundleFirstTimeSec: number | null;
};

export type DisplayRenderViewportSnapshot = {
  renderWindow: RenderWindowRuntimeBoundary;
  chartWindow: ChartWindowRuntimeBoundary;
  viewport: ViewportRuntimeCandidate;
  viewMode: ChartViewMode;
  centerTimeSec: number | null;
};

export type DisplayRenderViewportHarness = {
  context: DisplayRenderViewportHarnessContext;
  initialize(selectedTradeEntryTimeMs: number | null): DisplayRenderViewportSnapshot;
  applyTradeFocus(selectedTradeEntryTimeMs: number | null, forceRebuild?: boolean): void;
  dispatchInteraction(
    event: Parameters<typeof dispatchInteractionCandidate>[1],
  ): InteractionDispatchCandidate;
  emitTradeFocusCommand(entryTimeSec: number): ViewportCommand | null;
  resolveSnapshot(): DisplayRenderViewportSnapshot;
};

export function createDisplayRenderViewportHarness(input: {
  bundle: ChartMarketBundle;
  foundationKey: string;
  view: RunMarketView;
  focusWindow: MarketDisplayWindowMs;
  coverageWindow: MarketDisplayWindowMs;
  marketLoadStatus?: RuntimeLoadStatus;
  chartTimeframe: string;
  marketIdentity: string;
  auxEmaOverlays?: ChartAuxEmaOverlay[];
}): DisplayRenderViewportHarness {
  const marketLoadStatus = input.marketLoadStatus ?? "ready";
  let interactionHarnessRef: ReturnType<typeof createInteractionRuntimeHarness> | null = null;
  const renderController = createRenderWindowRuntimeController((commit) => {
    if (interactionHarnessRef !== null) {
      applyWindowSwapCommitCandidate(
        interactionHarnessRef,
        commit,
        input.bundle.candles.length,
      );
    }
  });
  const interactionHarness = createInteractionRuntimeHarness({
    renderController,
    bundleCandles: input.bundle.candles,
  });
  interactionHarnessRef = interactionHarness;

  const context: DisplayRenderViewportHarnessContext = {
    renderController,
    viewportState: interactionHarness.viewportState,
    interactionHarness,
    bundle: input.bundle,
    foundationKey: input.foundationKey,
    view: input.view,
    focusWindow: input.focusWindow,
    coverageWindow: input.coverageWindow,
    marketLoadStatus,
    chartTimeframe: input.chartTimeframe,
    marketIdentity: input.marketIdentity,
    auxEmaOverlays: input.auxEmaOverlays ?? [],
    stabilizeCaches: createChartWindowStabilizeCaches(),
    previousBundleFirstTimeSec: null,
  };

  const harness: DisplayRenderViewportHarness = {
    context,
    initialize(selectedTradeEntryTimeMs) {
      initializeRenderWindowRuntime(context.renderController, {
        foundationKey: context.foundationKey,
        marketLoadStatus: context.marketLoadStatus,
        bundleCandles: context.bundle.candles,
        selectedTradeEntryTimeMs,
      });
      return harness.resolveSnapshot();
    },
    applyTradeFocus(selectedTradeEntryTimeMs, forceRebuild = false) {
      applyRenderWindowForTradeRuntime(context.renderController, {
        bundleCandles: context.bundle.candles,
        selectedTradeEntryTimeMs,
        forceRebuild,
      });
    },
    dispatchInteraction(event) {
      return dispatchInteractionCandidate(context.interactionHarness, event, {
        view: context.view,
        coverageWindow: context.coverageWindow,
        timeframeMs: resolveChartTimeframeMs(context.chartTimeframe),
        chartHeavyIoEnabled: true,
      });
    },
    emitTradeFocusCommand(entryTimeSec) {
      const cmd = context.renderController.chartRuntime.dispatchInteraction({
        type: "trade_selected",
        entryTimeSec,
      });
      if (cmd === null) {
        return null;
      }
      return recordViewportCommandCandidate(context.viewportState, cmd);
    },
    resolveSnapshot() {
      const renderWindow = resolveRenderWindowRuntimeSnapshot(
        context.renderController,
        context.bundle.candles,
      );
      const chartWindow = resolveChartWindowFromRenderController({
        bundle: context.bundle,
        marketLoadStatus: context.marketLoadStatus,
        renderController: context.renderController,
        auxEmaOverlays: context.auxEmaOverlays,
        marketIdentity: context.marketIdentity,
        stabilizeCaches: context.stabilizeCaches,
      });

      const viewWindow =
        chartWindow.count === 0
          ? emptyChartViewWindow()
          : {
              mode: (context.renderController.chartRuntime.viewport.getState().mode ??
                "tail") as ChartViewMode,
              candles: chartWindow.parts.candles,
              emaOverlays: chartWindow.parts.emaOverlays,
              auxEmaOverlays: chartWindow.parts.auxEmaOverlays,
              centerTimeSec: context.renderController.chartRuntime.viewport.getState().centerTimeSec,
              firstTimeSec: chartWindow.firstTimeSec,
              lastTimeSec: chartWindow.lastTimeSec,
              count: chartWindow.count,
            };

      if (chartWindow.count > 0) {
        setViewportPlanCandidate(
          context.viewportState,
          viewWindow.mode,
          viewWindow.centerTimeSec,
        );
      }

      return {
        renderWindow,
        chartWindow,
        viewport: resolveViewportRuntimeCandidate(context.viewportState),
        viewMode: viewWindow.mode,
        centerTimeSec: viewWindow.centerTimeSec,
      };
    },
  };

  return harness;
}

/** Shadow-only resolver for debug snapshot fields from market bundle output. */
export function resolveDisplayRenderViewportShadow(input: {
  bundle: ChartMarketBundle | null;
  foundationKey: string | null;
  marketLoadStatus: RuntimeLoadStatus;
  selectedTradeEntryTimeMs: number | null;
  marketIdentity: string | null;
  auxEmaOverlays?: ChartAuxEmaOverlay[];
}): {
  renderWindow: RenderWindowRuntimeBoundary;
  chartWindow: ChartWindowRuntimeBoundary;
} {
  if (
    input.bundle === null ||
    input.foundationKey === null ||
    input.marketLoadStatus !== "ready"
  ) {
    return {
      renderWindow: {
        implemented: false,
        revision: 0,
        shiftSeq: 0,
        bounds: null,
        firstTimeSec: null,
        lastTimeSec: null,
      },
      chartWindow: {
        implemented: false,
        parts: { candles: [], emaOverlays: [], auxEmaOverlays: [], componentEvents: [] },
        firstTimeSec: null,
        lastTimeSec: null,
        count: 0,
        seriesKey: null,
      },
    };
  }

  const renderController = createRenderWindowRuntimeController();
  initializeRenderWindowRuntime(renderController, {
    foundationKey: input.foundationKey,
    marketLoadStatus: input.marketLoadStatus,
    bundleCandles: input.bundle.candles,
    selectedTradeEntryTimeMs: input.selectedTradeEntryTimeMs,
  });

  return {
    renderWindow: resolveRenderWindowRuntimeSnapshot(renderController, input.bundle.candles),
    chartWindow: resolveChartWindowFromRenderController({
      bundle: input.bundle,
      marketLoadStatus: input.marketLoadStatus,
      renderController,
      auxEmaOverlays: input.auxEmaOverlays ?? [],
      marketIdentity: input.marketIdentity,
    }),
  };
}
