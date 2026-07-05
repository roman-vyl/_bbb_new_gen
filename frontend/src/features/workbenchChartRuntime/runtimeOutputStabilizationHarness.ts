import { buildChartViewModel } from "@/features/chart/runtime/chartViewModel";
import type { ChartViewMode } from "@/features/chart/chartViewWindow";
import {
  buildMarketTargetWindowKey,
  resolveMarketTargetWindow,
} from "@/features/chart/workbenchMarketLoad";

import { createEmptyRuntimeDebugSnapshot, inactiveChartRuntimeOwnerFlags } from "./runtimeDebug";
import {
  resolveMarketBundleRuntime,
  type MarketBundleRuntimeBoundary,
} from "./marketBundleRuntime";
import {
  toRuntimeMarketFetchPlanDebug,
  resolveMarketFetchPlanRuntime,
} from "./marketFetchPlanRuntime";
import {
  createMarketLoadRuntimeController,
  runMarketLoadCycle,
  beginMarketLoadCycle,
  type MarketLoadRuntimeControllerState,
} from "./marketLoadRuntime";
import { resolveMarketViewRuntime } from "./marketViewRuntime";
import {
  resolveMarketWindowRuntime,
  toMarketWindowRuntimeState,
  type MarketWindowRuntimeState,
} from "./marketWindowRuntime";
import {
  createTraceEventsOverlaysHarness,
  type TraceEventsOverlaysHarness,
  type TraceEventsOverlaysSnapshot,
} from "./traceEventsOverlaysHarness";
import type {
  ChartRuntimeInput,
  ChartRuntimeInteractionOutput,
  ChartRuntimeOutput,
  ChartRuntimeViewportOutput,
} from "./runtimeTypes";

function noop(): void {
  // Isolated runtime stabilization harness: production wiring remains absent.
}

function createStableViewportOutput(): ChartRuntimeViewportOutput {
  return {
    command: null,
    commandSeq: 0,
    acknowledge: noop,
    isWindowSwapTransactionCancelled: () => false,
    settleWindowSwapCommit: noop,
  };
}

function createStableInteractionOutput(): ChartRuntimeInteractionOutput {
  return { dispatch: noop };
}

export type ChartRuntimeStabilizationController = {
  marketLoad: MarketLoadRuntimeControllerState;
  marketWindowState: MarketWindowRuntimeState | null;
  traceHarness: TraceEventsOverlaysHarness | null;
  traceHarnessSessionKey: string | null;
  lastTradeEntryTimeMs: number | null;
  lastFoundationKey: string | null;
  outputCacheKey: string | null;
  outputCache: ChartRuntimeOutput | null;
  stableViewport: ChartRuntimeViewportOutput;
  stableInteraction: ChartRuntimeInteractionOutput;
};

export function createChartRuntimeStabilizationController(): ChartRuntimeStabilizationController {
  return {
    marketLoad: createMarketLoadRuntimeController(),
    marketWindowState: null,
    traceHarness: null,
    traceHarnessSessionKey: null,
    lastTradeEntryTimeMs: null,
    lastFoundationKey: null,
    outputCacheKey: null,
    outputCache: null,
    stableViewport: createStableViewportOutput(),
    stableInteraction: createStableInteractionOutput(),
  };
}

function buildTraceHarnessSessionKey(input: {
  foundationKey: string;
  marketIdentity: string;
  reloadToken: number;
  effectiveContextOverlayRef: string | null;
  selectedRunId: string;
  selectedVariantKey: string;
}): string {
  return [
    input.foundationKey,
    input.marketIdentity,
    input.reloadToken,
    input.effectiveContextOverlayRef ?? "",
    input.selectedRunId,
    input.selectedVariantKey,
  ].join("|");
}

function buildChartRuntimeOutputCacheKey(input: {
  runtimeInput: ChartRuntimeInput;
  marketIdentity: string | null;
  marketWindowResetKey: string | null;
  marketLoad: MarketLoadRuntimeControllerState;
  foundationKey: string | null;
  snapshot: TraceEventsOverlaysSnapshot | null;
}): string {
  const snapshot = input.snapshot;
  return [
    input.runtimeInput.selectedRunId,
    input.runtimeInput.selectedVariantKey,
    input.runtimeInput.reloadToken,
    input.runtimeInput.selectedTradeEntryTimeMs,
    input.runtimeInput.effectiveContextOverlayRef,
    input.marketIdentity,
    input.marketWindowResetKey,
    input.marketLoad.status,
    input.marketLoad.readyTargetKey,
    input.marketLoad.candlesRevision,
    input.marketLoad.overlayRevision,
    input.foundationKey,
    snapshot?.displayRender.renderWindow.revision ?? "",
    snapshot?.displayRender.renderWindow.shiftSeq ?? "",
    snapshot?.displayRender.viewport.commandSeq ?? "",
    snapshot?.traceDisplay.displayApplyRevision ?? "",
    snapshot?.chartModel.implemented ? snapshot.chartModel.chartViewModel.seriesKey : "",
    snapshot?.trace.trace.lanesSignalTraceStatus ?? "",
  ].join("|");
}

function syncTraceHarness(
  controller: ChartRuntimeStabilizationController,
  input: {
    runtimeInput: ChartRuntimeInput;
    marketBundle: MarketBundleRuntimeBoundary;
    marketIdentity: string;
    marketLoadStatus: ChartRuntimeOutput["market"]["status"];
  },
): TraceEventsOverlaysSnapshot | null {
  if (
    !input.marketBundle.implemented ||
    input.marketBundle.bundle === null ||
    input.marketBundle.foundationKey === null ||
    input.runtimeInput.report === null ||
    input.runtimeInput.selectedVariant === null
  ) {
    controller.traceHarness = null;
    controller.traceHarnessSessionKey = null;
    controller.lastTradeEntryTimeMs = null;
    controller.lastFoundationKey = null;
    return null;
  }

  const view = resolveMarketViewRuntime(input.runtimeInput).view;
  if (view === null) {
    return null;
  }

  const focusWindow = resolveMarketTargetWindow(view, input.runtimeInput.selectedTradeEntryTimeMs);
  const coverageWindow = focusWindow;
  const sessionKey = buildTraceHarnessSessionKey({
    foundationKey: input.marketBundle.foundationKey,
    marketIdentity: input.marketIdentity,
    reloadToken: input.runtimeInput.reloadToken,
    effectiveContextOverlayRef: input.runtimeInput.effectiveContextOverlayRef,
    selectedRunId: input.runtimeInput.selectedRunId ?? input.runtimeInput.report.run_id,
    selectedVariantKey: input.runtimeInput.selectedVariantKey,
  });

  const foundationChanged = controller.lastFoundationKey !== input.marketBundle.foundationKey;
  const tradeEntryChanged =
    controller.lastTradeEntryTimeMs !== input.runtimeInput.selectedTradeEntryTimeMs;

  if (controller.traceHarness === null || controller.traceHarnessSessionKey !== sessionKey) {
    controller.traceHarness = createTraceEventsOverlaysHarness({
      report: input.runtimeInput.report,
      variant: input.runtimeInput.selectedVariant,
      bundle: input.marketBundle.bundle,
      foundationKey: input.marketBundle.foundationKey,
      view,
      focusWindow,
      coverageWindow,
      marketIdentity: input.marketIdentity,
      chartTimeframe: input.runtimeInput.chartTimeframe,
      effectiveContextOverlayRef: input.runtimeInput.effectiveContextOverlayRef,
      reloadToken: input.runtimeInput.reloadToken,
      marketLoadStatus: input.marketLoadStatus,
    });
    controller.traceHarnessSessionKey = sessionKey;
    controller.traceHarness.initialize(input.runtimeInput.selectedTradeEntryTimeMs);
    controller.lastFoundationKey = input.marketBundle.foundationKey;
    controller.lastTradeEntryTimeMs = input.runtimeInput.selectedTradeEntryTimeMs;
    return controller.traceHarness.resolveSnapshot();
  }

  if (foundationChanged) {
    controller.traceHarness.context.displayHarness.context.foundationKey =
      input.marketBundle.foundationKey;
    controller.traceHarness.context.displayHarness.context.bundle = input.marketBundle.bundle;
    controller.traceHarness.context.displayHarness.initialize(
      input.runtimeInput.selectedTradeEntryTimeMs,
    );
    controller.lastFoundationKey = input.marketBundle.foundationKey;
    controller.lastTradeEntryTimeMs = input.runtimeInput.selectedTradeEntryTimeMs;
    return controller.traceHarness.resolveSnapshot();
  }

  if (tradeEntryChanged) {
    controller.traceHarness.context.displayHarness.applyTradeFocus(
      input.runtimeInput.selectedTradeEntryTimeMs,
      false,
    );
    controller.lastTradeEntryTimeMs = input.runtimeInput.selectedTradeEntryTimeMs;
  }

  return controller.traceHarness.resolveSnapshot();
}

function buildIdleChartRuntimeOutput(
  input: ChartRuntimeInput,
  partial: {
    marketView: ReturnType<typeof resolveMarketViewRuntime>;
    marketWindow: ReturnType<typeof resolveMarketWindowRuntime>;
    marketFetchPlan: ReturnType<typeof resolveMarketFetchPlanRuntime> | null;
    marketBundle: MarketBundleRuntimeBoundary;
  },
): ChartRuntimeOutput {
  const chartViewModel = buildChartViewModel({
    candles: [],
    emaOverlays: [],
    auxEmaOverlays: [],
    displayAuxEmaOverlays: [],
    componentEvents: [],
    htfOverlayStale: false,
    componentEventsStale: false,
    traceDisplayStatus: "empty",
    traceDisplayMissingRange: null,
    viewMode: input.selectedTradeEntryTimeMs !== null ? "around-trade" : "empty",
    centerTimeSec:
      input.selectedTradeEntryTimeMs !== null
        ? Math.floor(input.selectedTradeEntryTimeMs / 1000)
        : null,
    firstTimeSec: null,
    lastTimeSec: null,
    count: 0,
  });

  const traceOutput = {
    lanesSignalTrace: null,
    lanesSignalTraceStatus: "idle" as const,
    lanesSignalTraceError: null,
  };

  return {
    chartViewModel,
    market: partial.marketBundle.implemented
      ? partial.marketBundle.market
      : {
          status: "idle",
          error: null,
          candlesSource: "unavailable",
          candlesCount: 0,
          fullCandleRange: null,
        },
    trace: traceOutput,
    overlays: { htfAuxEmaOverlayStale: false },
    display: {
      componentEventsStale: false,
      displayApplyRevision: 0,
      renderWindowShiftSeq: 0,
    },
    viewport: createStableViewportOutput(),
    interaction: createStableInteractionOutput(),
    debug: {
      ...createEmptyRuntimeDebugSnapshot({
        runId: input.selectedRunId,
        variantKey: input.selectedVariantKey,
        selectedTradeId: input.selectedTradeId,
        selectedTradeEntryTimeMs: input.selectedTradeEntryTimeMs,
        chartHeavyIoEnabled: input.chartHeavyIoEnabled,
        traceStatus: traceOutput.lanesSignalTraceStatus,
      }),
      marketIdentity: partial.marketView.marketIdentity,
      expectedMarketIdentity: partial.marketView.expectedMarketIdentity,
      focusWindow: partial.marketWindow.focusWindow,
      coverageWindow: partial.marketWindow.coverageWindow,
      marketWindowKeys: {
        focus: partial.marketWindow.focusWindowKey,
        coverage: partial.marketWindow.coverageWindowKey,
      },
      marketWindowResetKey: partial.marketWindow.resetKey,
      marketWindowFocusMode: partial.marketWindow.focusMode,
      marketWindowResetReasons: partial.marketWindow.resetReasons,
      marketFetchPlan: toRuntimeMarketFetchPlanDebug(partial.marketFetchPlan),
      fetchedCandles: partial.marketBundle.implemented
        ? partial.marketBundle.debug.fetchedCandles
        : { range: null, count: 0 },
      cachedCandles: partial.marketBundle.implemented
        ? partial.marketBundle.debug.cachedCandles
        : { range: null, count: 0 },
      displayBundle: partial.marketBundle.implemented
        ? partial.marketBundle.debug.displayBundle
        : { range: null, count: 0, source: null },
      renderWindow: { startIndex: null, endIndex: null, firstTimeSec: null, lastTimeSec: null },
      chartModel: { firstTimeSec: null, lastTimeSec: null, count: 0, seriesKey: null },
      traceRequests: { displayKey: null, denseKey: null, status: traceOutput.lanesSignalTraceStatus },
      counts: { componentEvents: 0, auxOverlays: 0, htfOverlays: 0, markers: null },
      ownerFlags: inactiveChartRuntimeOwnerFlags,
    },
  };
}

function buildReadyChartRuntimeOutput(input: {
  runtimeInput: ChartRuntimeInput;
  marketView: ReturnType<typeof resolveMarketViewRuntime>;
  marketWindow: ReturnType<typeof resolveMarketWindowRuntime>;
  marketFetchPlan: ReturnType<typeof resolveMarketFetchPlanRuntime> | null;
  marketBundle: MarketBundleRuntimeBoundary & { implemented: true };
  snapshot: TraceEventsOverlaysSnapshot;
  previousOutput: ChartRuntimeOutput | null;
}): ChartRuntimeOutput {
  const { snapshot, runtimeInput, marketBundle } = input;
  const chartModel = snapshot.chartModel.implemented
    ? snapshot.chartModel.chartViewModel
    : buildChartViewModel({
        candles: snapshot.displayRender.chartWindow.parts.candles,
        emaOverlays: snapshot.displayRender.chartWindow.parts.emaOverlays,
        auxEmaOverlays: snapshot.displayRender.chartWindow.parts.auxEmaOverlays,
        displayAuxEmaOverlays: snapshot.auxOverlay.displayAuxEmaOverlays,
        componentEvents: snapshot.traceDisplay.componentEvents,
        htfOverlayStale: snapshot.auxOverlay.htfAuxEmaOverlayStale,
        componentEventsStale: snapshot.traceDisplay.componentEventsStale,
        traceDisplayStatus: snapshot.traceDisplay.implemented
          ? snapshot.traceDisplay.traceDisplayState.status
          : "empty",
        traceDisplayMissingRange: snapshot.traceDisplay.implemented
          ? snapshot.traceDisplay.traceDisplayState.missingRange
          : null,
        viewMode: snapshot.displayRender.viewMode,
        centerTimeSec: snapshot.displayRender.centerTimeSec,
        firstTimeSec: snapshot.displayRender.chartWindow.firstTimeSec,
        lastTimeSec: snapshot.displayRender.chartWindow.lastTimeSec,
        count: snapshot.displayRender.chartWindow.count,
      });

  const traceOutput = snapshot.trace.implemented
    ? snapshot.trace.trace
    : {
        lanesSignalTrace: null,
        lanesSignalTraceStatus: "idle" as const,
        lanesSignalTraceError: null,
      };

  const previousChartViewModel = input.previousOutput?.chartViewModel ?? null;
  const stableChartViewModel =
    previousChartViewModel !== null && previousChartViewModel.seriesKey === chartModel.seriesKey
      ? previousChartViewModel
      : chartModel;

  return {
    chartViewModel: stableChartViewModel,
    market: marketBundle.market,
    trace: traceOutput,
    overlays: { htfAuxEmaOverlayStale: snapshot.auxOverlay.htfAuxEmaOverlayStale },
    display: {
      componentEventsStale: snapshot.traceDisplay.componentEventsStale,
      displayApplyRevision: snapshot.traceDisplay.displayApplyRevision,
      renderWindowShiftSeq: snapshot.displayRender.renderWindow.shiftSeq,
    },
    viewport: createStableViewportOutput(),
    interaction: createStableInteractionOutput(),
    debug: {
      ...createEmptyRuntimeDebugSnapshot({
        runId: runtimeInput.selectedRunId,
        variantKey: runtimeInput.selectedVariantKey,
        selectedTradeId: runtimeInput.selectedTradeId,
        selectedTradeEntryTimeMs: runtimeInput.selectedTradeEntryTimeMs,
        chartHeavyIoEnabled: runtimeInput.chartHeavyIoEnabled,
        traceStatus: traceOutput.lanesSignalTraceStatus,
      }),
      marketIdentity: input.marketView.marketIdentity,
      expectedMarketIdentity: input.marketView.expectedMarketIdentity,
      focusWindow: input.marketWindow.focusWindow,
      coverageWindow: input.marketWindow.coverageWindow,
      marketWindowKeys: {
        focus: input.marketWindow.focusWindowKey,
        coverage: input.marketWindow.coverageWindowKey,
      },
      marketWindowResetKey: input.marketWindow.resetKey,
      marketWindowFocusMode: input.marketWindow.focusMode,
      marketWindowResetReasons: input.marketWindow.resetReasons,
      marketFetchPlan: toRuntimeMarketFetchPlanDebug(input.marketFetchPlan),
      fetchedCandles: marketBundle.debug.fetchedCandles,
      cachedCandles: marketBundle.debug.cachedCandles,
      displayBundle: marketBundle.debug.displayBundle,
      renderWindow: {
        startIndex: snapshot.displayRender.renderWindow.bounds?.windowStartIndex ?? null,
        endIndex: snapshot.displayRender.renderWindow.bounds?.windowEndIndex ?? null,
        firstTimeSec: snapshot.displayRender.renderWindow.firstTimeSec,
        lastTimeSec: snapshot.displayRender.renderWindow.lastTimeSec,
      },
      chartModel: {
        firstTimeSec: stableChartViewModel.firstTimeSec,
        lastTimeSec: stableChartViewModel.lastTimeSec,
        count: stableChartViewModel.count,
        seriesKey: stableChartViewModel.seriesKey,
      },
      traceRequests: {
        displayKey: snapshot.trace.implemented ? snapshot.trace.displayRequestKey : null,
        denseKey: snapshot.trace.implemented ? snapshot.trace.denseRequestKey : null,
        status: traceOutput.lanesSignalTraceStatus,
      },
      counts: {
        componentEvents: snapshot.traceDisplay.componentEvents.length,
        auxOverlays: snapshot.auxOverlay.implemented
          ? snapshot.auxOverlay.auxOverlayCount
          : snapshot.auxOverlay.auxEmaOverlays.length,
        htfOverlays: snapshot.auxOverlay.implemented ? snapshot.auxOverlay.htfOverlayCount : 0,
        markers: null,
      },
      ownerFlags: inactiveChartRuntimeOwnerFlags,
    },
  };
}

export type StableMarketLoadOptions = {
  executeLoad?: Parameters<typeof runMarketLoadCycle>[1]["executeLoad"];
  signal?: AbortSignal;
};

export async function runStableMarketLoadCycle(
  controller: ChartRuntimeStabilizationController,
  input: ChartRuntimeInput,
  options: StableMarketLoadOptions = {},
): Promise<ChartRuntimeOutput> {
  const marketView = resolveMarketViewRuntime(input);
  if (marketView.view === null || marketView.marketIdentity === null) {
    return resolveStableChartRuntimeOutput(controller, input);
  }

  const marketWindow = resolveMarketWindowRuntime({
    view: marketView.view,
    marketIdentity: marketView.marketIdentity,
    expectedMarketIdentity: marketView.expectedMarketIdentity,
    selectedTradeEntryTimeMs: input.selectedTradeEntryTimeMs,
    previous: controller.marketWindowState,
  });
  controller.marketWindowState = toMarketWindowRuntimeState(marketWindow);

  if (marketWindow.focusWindow === null || marketWindow.coverageWindow === null) {
    return resolveStableChartRuntimeOutput(controller, input);
  }

  const focusKey = buildMarketTargetWindowKey(marketView.marketIdentity, marketWindow.focusWindow);
  const coverageKey = buildMarketTargetWindowKey(
    marketView.marketIdentity,
    marketWindow.coverageWindow,
  );
  const loadGeneration = beginMarketLoadCycle(controller.marketLoad, marketView.marketIdentity);
  await runMarketLoadCycle(controller.marketLoad, {
    view: marketView.view,
    viewIdentity: marketView.marketIdentity,
    focusWindow: marketWindow.focusWindow,
    coverageWindow: marketWindow.coverageWindow,
    focusKey,
    coverageKey,
    symbol: marketView.view.symbol,
    timeframe: input.chartTimeframe,
    signal: options.signal ?? new AbortController().signal,
    loadGeneration,
    executeLoad: options.executeLoad,
  });

  return resolveStableChartRuntimeOutput(controller, input);
}

export function resolveStableChartRuntimeOutput(
  controller: ChartRuntimeStabilizationController,
  input: ChartRuntimeInput,
): ChartRuntimeOutput {
  const marketView = resolveMarketViewRuntime(input);
  const marketWindow = resolveMarketWindowRuntime({
    view: marketView.view,
    marketIdentity: marketView.marketIdentity,
    expectedMarketIdentity: marketView.expectedMarketIdentity,
    selectedTradeEntryTimeMs: input.selectedTradeEntryTimeMs,
    previous: controller.marketWindowState,
  });
  controller.marketWindowState = toMarketWindowRuntimeState(marketWindow);

  const marketFetchPlan =
    marketView.view !== null &&
    marketWindow.focusWindow !== null &&
    marketWindow.coverageWindow !== null
      ? resolveMarketFetchPlanRuntime({
          view: marketView.view,
          focusWindow: marketWindow.focusWindow,
          coverageWindow: marketWindow.coverageWindow,
        })
      : null;

  const marketLoadStatus = controller.marketLoad.status;
  const marketBundle = resolveMarketBundleRuntime({
    view: marketView.view,
    focusWindow: marketWindow.focusWindow,
    coverageWindow: marketWindow.coverageWindow,
    focusWindowKey: marketWindow.focusWindowKey,
    marketLoadStatus,
    marketLoadError: controller.marketLoad.error,
  });

  const snapshot =
    marketLoadStatus === "ready" && marketView.marketIdentity !== null
      ? syncTraceHarness(controller, {
          runtimeInput: input,
          marketBundle,
          marketIdentity: marketView.marketIdentity,
          marketLoadStatus,
        })
      : null;

  const outputCacheKey = buildChartRuntimeOutputCacheKey({
    runtimeInput: input,
    marketIdentity: marketView.marketIdentity,
    marketWindowResetKey: marketWindow.resetKey,
    marketLoad: controller.marketLoad,
    foundationKey: marketBundle.implemented ? marketBundle.foundationKey : null,
    snapshot,
  });

  if (controller.outputCacheKey === outputCacheKey && controller.outputCache !== null) {
    return controller.outputCache;
  }

  const output =
    snapshot !== null && marketBundle.implemented
      ? buildReadyChartRuntimeOutput({
          runtimeInput: input,
          marketView,
          marketWindow,
          marketFetchPlan,
          marketBundle,
          snapshot,
          previousOutput: controller.outputCache,
        })
      : buildIdleChartRuntimeOutput(input, {
          marketView,
          marketWindow,
          marketFetchPlan,
          marketBundle,
        });

  controller.outputCacheKey = outputCacheKey;
  controller.outputCache = output;
  controller.stableViewport = output.viewport;
  controller.stableInteraction = output.interaction;
  return output;
}

/** Convenience helper for tests: resolve twice and compare reference stability. */
export function resolveStableChartRuntimeOutputTwice(
  controller: ChartRuntimeStabilizationController,
  input: ChartRuntimeInput,
): { first: ChartRuntimeOutput; second: ChartRuntimeOutput } {
  const first = resolveStableChartRuntimeOutput(controller, input);
  const second = resolveStableChartRuntimeOutput(controller, input);
  return { first, second };
}

export function resolveStableDisplayViewMode(input: ChartRuntimeInput): {
  mode: ChartViewMode;
  centerTimeSec: number | null;
} {
  return {
    mode: input.selectedTradeEntryTimeMs !== null ? "around-trade" : "tail",
    centerTimeSec:
      input.selectedTradeEntryTimeMs !== null
        ? Math.floor(input.selectedTradeEntryTimeMs / 1000)
        : null,
  };
}
