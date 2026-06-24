import { ApiError } from "@/api/client";
import type { ChartBar, SignalTraceBundle } from "@/api/types";
import {
  buildTraceDisplayChunkKey,
  mergeDisplayChunkFromResponse,
} from "@/features/chart/signalTraceDisplayCache";
import {
  buildSessionCacheIdentity,
  createSignalTraceBundleSessionCache,
  type SignalTraceBundleSessionCache,
} from "@/features/chart/signalTraceBundleSessionCache";
import {
  buildDisplayTraceRequestKey,
  isChartEventsApiEnabled,
} from "@/features/chart/runtime/chartEventsLoad";
import {
  createSignalTraceRequestCoordinator,
  buildTraceRequestKey,
  type SignalTraceRequestCoordinator,
} from "@/features/chart/runtime/signalTraceRequestCoordinator";
import { planTraceDisplayLoad } from "@/features/chart/runtime/traceDisplayOrchestrator";
import {
  applyLanesFromSessionBundle,
  decideDenseLanesNetworkLoad,
  lanesReadyForWindow,
  loadDenseLanesTrace,
  loadDisplayTraceChunk,
  mapDisplayLoadOutcome,
  mergeDisplayFromDenseFallback,
  type DisplayLoadOutcome,
  type WorkbenchTraceNetworkLoadContext,
} from "@/features/chart/runtime/workbenchTraceNetworkLoad";
import { evaluateSignalTraceBootstrap } from "@/shared/context/signalTraceBootstrap";
import {
  decideSignalTraceLoad,
  lanesSignalTraceError,
  lanesSignalTraceStatus,
  signalTraceMatchesChartWindow,
  type SignalTraceLoadStatus,
} from "@/shared/context/signalTraceLoadPolicy";
import type { RenderWindowInteractionState } from "@/features/chart/runtime/types";

import {
  applyTraceDisplayForWindow,
  bumpTraceDisplayCacheVersion,
  planTraceDisplayChunkFetch,
  resolveDisplayCacheCoverage,
  type TraceDisplayRuntimeController,
} from "./traceDisplayRuntime";
import type { ChartRuntimeTraceOutput } from "./runtimeTypes";

export type TraceRuntimeSnapshot = {
  implemented: true;
  trace: ChartRuntimeTraceOutput;
  displayRequestKey: string | null;
  denseRequestKey: string | null;
  loadedWindowKey: string | null;
  lanesReady: boolean;
};

export type TraceRuntimeInactiveSnapshot = {
  implemented: false;
  trace: ChartRuntimeTraceOutput;
  displayRequestKey: string | null;
  denseRequestKey: string | null;
};

export type TraceRuntimeBoundary = TraceRuntimeInactiveSnapshot | TraceRuntimeSnapshot;

export type TraceRuntimeController = {
  coordinator: SignalTraceRequestCoordinator;
  sessionCache: SignalTraceBundleSessionCache;
  loadGeneration: number;
  lanesBundle: SignalTraceBundle | null;
  lanesStatus: SignalTraceLoadStatus;
  lanesError: string | null;
  loadedWindowKey: string | null;
  previousWindowKey: string | null;
  displayRequestKey: string | null;
  denseRequestKey: string | null;
};

export function createTraceRuntimeController(): TraceRuntimeController {
  return {
    coordinator: createSignalTraceRequestCoordinator(),
    sessionCache: createSignalTraceBundleSessionCache(),
    loadGeneration: 0,
    lanesBundle: null,
    lanesStatus: "idle",
    lanesError: null,
    loadedWindowKey: null,
    previousWindowKey: null,
    displayRequestKey: null,
    denseRequestKey: null,
  };
}

export function buildTraceSessionCacheIdentity(input: {
  selectedRunId: string;
  selectedVariantKey: string;
  effectiveContextOverlayRef: string | null;
  reloadToken: number;
  marketIdentity: string | null;
}): string {
  return buildSessionCacheIdentity(
    input.selectedRunId,
    input.selectedVariantKey,
    input.effectiveContextOverlayRef,
    input.reloadToken,
    input.marketIdentity,
  );
}

export function resetTraceSessionCache(
  controller: TraceRuntimeController,
  sessionCacheIdentity: string,
): void {
  controller.sessionCache.reset(sessionCacheIdentity);
}

export function resetTraceCoordinator(controller: TraceRuntimeController): void {
  controller.coordinator.reset();
  controller.loadGeneration += 1;
  controller.lanesBundle = null;
  controller.lanesStatus = "idle";
  controller.lanesError = null;
  controller.loadedWindowKey = null;
  controller.previousWindowKey = null;
  controller.displayRequestKey = null;
  controller.denseRequestKey = null;
}

function lanesTraceOutput(controller: TraceRuntimeController): ChartRuntimeTraceOutput {
  return {
    lanesSignalTrace: controller.lanesBundle,
    lanesSignalTraceStatus: controller.lanesStatus,
    lanesSignalTraceError: controller.lanesError,
  };
}

export function resolveTraceRuntimeSnapshot(
  controller: TraceRuntimeController,
  chartWindowKey: string | null,
): TraceRuntimeBoundary {
  const lanesStatus = lanesSignalTraceStatus(
    chartWindowKey,
    controller.loadedWindowKey,
    controller.lanesStatus,
  );
  const lanesError = lanesSignalTraceError(
    chartWindowKey,
    controller.loadedWindowKey,
    controller.lanesError,
  );
  const lanesBundle =
    signalTraceMatchesChartWindow(chartWindowKey, controller.loadedWindowKey)
      ? controller.lanesBundle
      : null;

  const trace: ChartRuntimeTraceOutput = {
    lanesSignalTrace: lanesBundle,
    lanesSignalTraceStatus: lanesStatus,
    lanesSignalTraceError: lanesError,
  };

  if (chartWindowKey === null) {
    return {
      implemented: false,
      trace,
      displayRequestKey: controller.displayRequestKey,
      denseRequestKey: controller.denseRequestKey,
    };
  }

  return {
    implemented: true,
    trace,
    displayRequestKey: controller.displayRequestKey,
    denseRequestKey: controller.denseRequestKey,
    loadedWindowKey: controller.loadedWindowKey,
    lanesReady: lanesReadyForWindow({
      committedWindowKey: chartWindowKey,
      loadedSignalTraceWindowKey: controller.loadedWindowKey,
      signalTraceStatus: controller.lanesStatus,
    }),
  };
}

export type TraceLoadCycleOutcome =
  | "bootstrap_blocked"
  | "fetch_superseded"
  | "pan_block"
  | "session_restored"
  | "deferred"
  | "cache_hit"
  | "display_committed"
  | "lanes_ready"
  | "aborted"
  | "stale"
  | "error"
  | "completed";

export type TraceLoadCycleResult = {
  outcome: TraceLoadCycleOutcome;
  displayLoadOutcome: DisplayLoadOutcome | null;
  controller: TraceRuntimeController;
};

function traceErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return err.detail;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return "Failed to load signal trace.";
}

export type TraceLoadCycleInput = {
  chartHeavyIoEnabled: boolean;
  reportLoadStatus: "idle" | "loading" | "ready" | "error";
  report: { run_id: string } | null;
  selectedRunId: string;
  selectedVariantKey: string;
  marketLoadStatus: "idle" | "loading" | "ready" | "error";
  runMarketViewIdentity: string | null;
  expectedRunMarketViewIdentity: string | null;
  effectiveContextOverlayRef: string | null;
  chartTimeframe: string;
  chartWindowKey: string | null;
  candles: readonly ChartBar[];
  renderWindowBounds: { fromSec: number; toSec: number } | null;
  interactionState: RenderWindowInteractionState;
  hasPendingShift: boolean;
  coalescedWindowKey?: string | null;
  traceController: TraceRuntimeController;
  displayController: TraceDisplayRuntimeController;
  signal?: AbortSignal;
  loadDisplayTraceChunk?: typeof loadDisplayTraceChunk;
  loadDenseLanesTrace?: typeof loadDenseLanesTrace;
};

export async function runTraceLoadCycle(input: TraceLoadCycleInput): Promise<TraceLoadCycleResult> {
  const controller = input.traceController;
  const displayController = input.displayController;
  const displayLoader = input.loadDisplayTraceChunk ?? loadDisplayTraceChunk;
  const denseLoader = input.loadDenseLanesTrace ?? loadDenseLanesTrace;

  if (!input.chartHeavyIoEnabled) {
    controller.lanesBundle = null;
    controller.lanesStatus = "idle";
    controller.lanesError = null;
    controller.loadedWindowKey = null;
    controller.previousWindowKey = null;
    return { outcome: "bootstrap_blocked", displayLoadOutcome: null, controller };
  }

  const bootstrap = evaluateSignalTraceBootstrap({
    report: input.report as Parameters<typeof evaluateSignalTraceBootstrap>[0]["report"],
    reportLoadStatus: input.reportLoadStatus,
    selectedRunId: input.selectedRunId,
    selectedVariantKey: input.selectedVariantKey,
    marketLoadStatus: input.marketLoadStatus,
    runMarketViewIdentity: input.runMarketViewIdentity,
    expectedRunMarketViewIdentity: input.expectedRunMarketViewIdentity,
    chartWindowKey: input.chartWindowKey,
    candles: input.candles,
    renderWindowBounds: input.renderWindowBounds,
    previousWindowKey: controller.previousWindowKey,
  });

  if (!bootstrap.ready) {
    controller.lanesBundle = null;
    controller.lanesStatus = "idle";
    controller.lanesError = null;
    controller.loadedWindowKey = null;
    controller.previousWindowKey = null;
    return { outcome: "bootstrap_blocked", displayLoadOutcome: null, controller };
  }

  const { windowKey, request } = bootstrap;
  const committedWindowKey = windowKey;
  const displayCacheCoversWindow =
    input.renderWindowBounds !== null &&
    displayController.cache.coversRange(
      input.renderWindowBounds.fromSec,
      input.renderWindowBounds.toSec,
    );

  const sessionCacheHasWindow = controller.sessionCache.has(committedWindowKey);
  const loadDecision = decideSignalTraceLoad({
    chartWindowKey: committedWindowKey,
    sessionCacheHasWindow,
    loadedSignalTraceWindowKey: controller.loadedWindowKey,
    request,
  });

  const plan = planTraceDisplayLoad({
    bootstrap,
    coalescedWindowKey: input.coalescedWindowKey ?? null,
    committedWindowKey,
    panScheduling: {
      interactionState: input.interactionState,
      hasPendingShift: input.hasPendingShift,
      displayCacheCoversWindow,
      committedWindowKey,
      loadedWindowKey: controller.loadedWindowKey,
      status: controller.lanesStatus,
    },
    loadDecision,
  });

  if (plan.action === "bootstrap_blocked") {
    return { outcome: "bootstrap_blocked", displayLoadOutcome: null, controller };
  }

  if (plan.action === "fetch_superseded") {
    return { outcome: "fetch_superseded", displayLoadOutcome: null, controller };
  }

  if (plan.action === "pan_block") {
    if (plan.applyDisplayFromCache) {
      applyTraceDisplayForWindow(displayController, input.candles, controller.lanesStatus);
    }
    return { outcome: "pan_block", displayLoadOutcome: null, controller };
  }

  controller.previousWindowKey = committedWindowKey;

  if (plan.action === "restore_session") {
    const sessionBundle = controller.sessionCache.get(committedWindowKey);
    if (sessionBundle === null) {
      return { outcome: "deferred", displayLoadOutcome: null, controller };
    }

    const lanesRequestKey = buildTraceRequestKey({
      runId: request.runId,
      variant: request.variant,
      fromMs: request.fromMs,
      toOpenTimeMs: request.toOpenTimeMs,
      contextOverlayRef: input.effectiveContextOverlayRef,
    });
    const chartEventsEnabled = isChartEventsApiEnabled();
    const lanesOnlySessionRestore = chartEventsEnabled && displayCacheCoversWindow;

    if (lanesOnlySessionRestore) {
      applyLanesFromSessionBundle({
        sessionBundle,
        windowKey: committedWindowKey,
        lanesRequestKey,
        coordinator: controller.coordinator,
        applyLanesState: (bundle) => {
          controller.lanesBundle = bundle;
          controller.loadedWindowKey = committedWindowKey;
          controller.lanesStatus = "ready";
          controller.lanesError = null;
        },
      });
      applyTraceDisplayForWindow(displayController, input.candles, controller.lanesStatus);
      return { outcome: "session_restored", displayLoadOutcome: "skipped_lanes_only", controller };
    }

    controller.coordinator.markMerged(
      buildDisplayTraceRequestKey({
        runId: request.runId,
        variant: request.variant,
        fromMs: request.fromMs,
        toOpenTimeMs: request.toOpenTimeMs,
        contextOverlayRef: input.effectiveContextOverlayRef,
      }),
      "session_restore",
    );
    mergeDisplayChunkFromResponse(displayController.cache, sessionBundle);
    bumpTraceDisplayCacheVersion(displayController);
    controller.lanesBundle = sessionBundle;
    controller.loadedWindowKey = committedWindowKey;
    controller.lanesStatus = "ready";
    controller.lanesError = null;
    applyTraceDisplayForWindow(displayController, input.candles, controller.lanesStatus);
    return { outcome: "session_restored", displayLoadOutcome: "committed", controller };
  }

  if (plan.action === "defer") {
    return { outcome: "deferred", displayLoadOutcome: null, controller };
  }

  if (plan.action !== "evaluate_network") {
    return { outcome: "deferred", displayLoadOutcome: null, controller };
  }

  const lanesReadyForWindowNow = lanesReadyForWindow({
    committedWindowKey,
    loadedSignalTraceWindowKey: controller.loadedWindowKey,
    signalTraceStatus: controller.lanesStatus,
  });
  const chartEventsEnabled = isChartEventsApiEnabled();
  const lanesOnlyFetch = chartEventsEnabled && displayCacheCoversWindow && !lanesReadyForWindowNow;

  if (displayCacheCoversWindow && !lanesOnlyFetch) {
    applyTraceDisplayForWindow(displayController, input.candles, controller.lanesStatus);
    return { outcome: "cache_hit", displayLoadOutcome: null, controller };
  }

  if (displayCacheCoversWindow && lanesOnlyFetch) {
    applyTraceDisplayForWindow(displayController, input.candles, controller.lanesStatus);
  }

  let chunkPlan = planTraceDisplayChunkFetch(displayController, {
    candles: input.candles,
    runId: request.runId,
    variant: request.variant,
    contextOverlayRef: input.effectiveContextOverlayRef,
    chartTimeframe: input.chartTimeframe,
  });

  if (chunkPlan === null && lanesOnlyFetch && input.renderWindowBounds !== null) {
    chunkPlan = {
      traceDisplayChunkKey: buildTraceDisplayChunkKey({
        runId: request.runId,
        variant: request.variant,
        contextOverlayRef: input.effectiveContextOverlayRef,
        chartTimeframe: input.chartTimeframe,
        fromSec: input.renderWindowBounds.fromSec,
        toSec: input.renderWindowBounds.toSec,
      }),
      fromSec: input.renderWindowBounds.fromSec,
      toSec: input.renderWindowBounds.toSec,
      fromMs: request.fromMs,
      toOpenTimeMs: request.toOpenTimeMs,
      missingRange: {
        fromSec: input.renderWindowBounds.fromSec,
        toSec: input.renderWindowBounds.toSec,
      },
    };
  }

  if (chunkPlan === null) {
    applyTraceDisplayForWindow(displayController, input.candles, controller.lanesStatus);
    return { outcome: "lanes_ready", displayLoadOutcome: null, controller };
  }

  const fetchParams = {
    runId: request.runId,
    variant: request.variant,
    fromMs: chunkPlan.fromMs,
    toOpenTimeMs: chunkPlan.toOpenTimeMs,
    contextOverlayRef: input.effectiveContextOverlayRef,
  };
  const displayRequestKey = buildDisplayTraceRequestKey(fetchParams);
  const lanesRequestKey = buildTraceRequestKey(fetchParams);
  const networkCoordinatorKey = lanesOnlyFetch ? lanesRequestKey : displayRequestKey;
  controller.displayRequestKey = displayRequestKey;
  controller.denseRequestKey = lanesRequestKey;

  const fetchGeneration = controller.loadGeneration + 1;
  controller.loadGeneration = fetchGeneration;

  const coordDecision = controller.coordinator.evaluate({
    key: networkCoordinatorKey,
    generation: fetchGeneration,
    displayCacheCoversWindow: lanesOnlyFetch,
  });

  if (coordDecision.action !== "fetch") {
    if (coordDecision.reason === "already_merged" || coordDecision.reason === "cache_hit") {
      applyTraceDisplayForWindow(displayController, input.candles, controller.lanesStatus);
      return { outcome: "cache_hit", displayLoadOutcome: null, controller };
    }
    return { outcome: "deferred", displayLoadOutcome: null, controller };
  }

  const lanesPolicySnapshot = {
    committedWindowKey: windowKey,
    loadedSignalTraceWindowKey: controller.loadedWindowKey,
    signalTraceStatus: controller.lanesStatus,
    signalTraceError: controller.lanesError,
    loadedSignalTrace: controller.lanesBundle,
    lanesReadyAtFetchStart: lanesReadyForWindowNow,
  };

  controller.coordinator.markInFlight(networkCoordinatorKey, fetchGeneration);
  if (chartEventsEnabled && !lanesOnlyFetch) {
    controller.coordinator.markInFlight(displayRequestKey, fetchGeneration);
  }

  const requestedBounds = {
    fromSec: Math.floor(chunkPlan.fromMs / 1000),
    toSec: Math.floor(chunkPlan.toOpenTimeMs / 1000),
  };

  const onCommitDisplay = () => {
    controller.coordinator.markMerged(displayRequestKey, "network");
    bumpTraceDisplayCacheVersion(displayController);
    applyTraceDisplayForWindow(displayController, input.candles, controller.lanesStatus);
  };

  const networkCtx: WorkbenchTraceNetworkLoadContext = {
    params: {
      runId: request.runId,
      variant: request.variant,
      fromMs: chunkPlan.fromMs,
      toOpenTimeMs: chunkPlan.toOpenTimeMs,
      contextOverlayRef: input.effectiveContextOverlayRef,
      windowKey,
      displayRequestKey,
      networkCoordinatorKey,
      fetchGeneration,
      signal: input.signal ?? new AbortController().signal,
      lanesOnlyFetch,
    },
    cache: displayController.cache,
    coordinator: controller.coordinator,
    requestedBounds,
    onCommitDisplay,
  };

  const displayResult = lanesOnlyFetch ? null : await displayLoader(networkCtx);
  if (
    displayResult !== null &&
    (displayResult.outcome === "aborted" || displayResult.outcome === "stale")
  ) {
    controller.coordinator.clearInFlight(networkCoordinatorKey, fetchGeneration);
    if (chartEventsEnabled && !lanesOnlyFetch) {
      controller.coordinator.clearInFlight(displayRequestKey, fetchGeneration);
    }
    return {
      outcome: displayResult.outcome === "aborted" ? "aborted" : "stale",
      displayLoadOutcome: null,
      controller,
    };
  }

  const displayLoadOutcome = mapDisplayLoadOutcome(
    lanesOnlyFetch,
    chartEventsEnabled,
    displayResult,
  );
  if (displayLoadOutcome === null) {
    controller.coordinator.clearInFlight(networkCoordinatorKey, fetchGeneration);
    if (chartEventsEnabled && !lanesOnlyFetch) {
      controller.coordinator.clearInFlight(displayRequestKey, fetchGeneration);
    }
    return { outcome: "stale", displayLoadOutcome: null, controller };
  }

  let displayMerged =
    displayResult !== null && displayResult.outcome === "committed"
      ? true
      : (displayResult?.displayMerged ?? lanesOnlyFetch);
  const mergeSource =
    displayResult !== null && displayResult.outcome === "committed"
      ? displayResult.mergeSource
      : (displayResult?.mergeSource ?? "signal-trace-fallback");

  const denseCoordinatorKey = chartEventsEnabled ? lanesRequestKey : networkCoordinatorKey;

  const lanesDecision = decideDenseLanesNetworkLoad({
    chartEventsEnabled,
    committedWindowKey: windowKey,
    loadedSignalTraceWindowKey: lanesPolicySnapshot.loadedSignalTraceWindowKey,
    signalTraceStatus: lanesPolicySnapshot.signalTraceStatus,
    loadedSignalTrace: lanesPolicySnapshot.loadedSignalTrace,
    sessionCacheHasWindow,
    displayCacheCoversWindow,
    displayLoadOutcome,
    lanesRequestKey,
    fromMs: chunkPlan.fromMs,
    toOpenTimeMs: chunkPlan.toOpenTimeMs,
  });

  try {
    if (lanesDecision.action === "skip") {
      controller.coordinator.markMerged(denseCoordinatorKey, "network");
      return { outcome: "lanes_ready", displayLoadOutcome, controller };
    }

    if (lanesDecision.action === "use_loaded_bundle") {
      const bundle = lanesPolicySnapshot.loadedSignalTrace;
      if (bundle !== null) {
        mergeDisplayFromDenseFallback({
          ...networkCtx,
          bundle,
          mergeSource: "signal-trace-fallback",
        });
        displayMerged = true;
      }
      controller.coordinator.markMerged(denseCoordinatorKey, "network");
      return { outcome: "display_committed", displayLoadOutcome, controller };
    }

    if (lanesDecision.action === "restore_session") {
      const sessionBundle = controller.sessionCache.get(lanesDecision.windowKey);
      if (sessionBundle !== null) {
        applyLanesFromSessionBundle({
          sessionBundle,
          windowKey: lanesDecision.windowKey,
          lanesRequestKey,
          coordinator: controller.coordinator,
          applyLanesState: (bundle) => {
            controller.lanesBundle = bundle;
            controller.loadedWindowKey = windowKey;
            controller.lanesStatus = "ready";
            controller.lanesError = null;
          },
        });
        return { outcome: "session_restored", displayLoadOutcome, controller };
      }
    }

    controller.lanesStatus = "loading";
    controller.coordinator.markInFlight(denseCoordinatorKey, fetchGeneration);

    const lanesResult = await denseLoader(networkCtx);
    if (lanesResult.outcome === "aborted" || lanesResult.outcome === "stale") {
      controller.lanesStatus = lanesPolicySnapshot.signalTraceStatus;
      return {
        outcome: lanesResult.outcome === "aborted" ? "aborted" : "stale",
        displayLoadOutcome,
        controller,
      };
    }

    if (lanesResult.outcome === "error") {
      const err = lanesResult.error;
      if (displayMerged) {
        controller.lanesBundle = null;
        controller.loadedWindowKey = windowKey;
        controller.lanesStatus = "error";
        controller.lanesError = traceErrorMessage(err);
        applyTraceDisplayForWindow(displayController, input.candles, controller.lanesStatus);
        return { outcome: "error", displayLoadOutcome, controller };
      }
      controller.coordinator.markFailed(denseCoordinatorKey);
      controller.lanesBundle = null;
      controller.loadedWindowKey = windowKey;
      controller.lanesStatus = "error";
      controller.lanesError = traceErrorMessage(err);
      return { outcome: "error", displayLoadOutcome, controller };
    }

    const bundle = lanesResult.bundle;
    const needsDisplayMergeFromDense =
      lanesDecision.action === "fetch" &&
      (lanesDecision.reason === "flag_off_combined" ||
        lanesDecision.reason === "display_fallback_needed");
    if (!displayMerged && needsDisplayMergeFromDense) {
      mergeDisplayFromDenseFallback({
        ...networkCtx,
        bundle,
        mergeSource,
      });
      displayMerged = true;
    }

    controller.coordinator.markMerged(denseCoordinatorKey, "network");
    controller.lanesBundle = bundle;
    controller.loadedWindowKey = windowKey;
    controller.lanesStatus = "ready";
    controller.lanesError = null;
    controller.sessionCache.set(windowKey, bundle);
    applyTraceDisplayForWindow(displayController, input.candles, controller.lanesStatus);
    return { outcome: "completed", displayLoadOutcome, controller };
  } finally {
    controller.coordinator.clearInFlight(networkCoordinatorKey, fetchGeneration);
    if (chartEventsEnabled) {
      controller.coordinator.clearInFlight(lanesRequestKey, fetchGeneration);
    }
    if (chartEventsEnabled && !lanesOnlyFetch) {
      controller.coordinator.clearInFlight(displayRequestKey, fetchGeneration);
    }
  }
}

export function idleLanesTraceOutput(): ChartRuntimeTraceOutput {
  return {
    lanesSignalTrace: null,
    lanesSignalTraceStatus: "idle",
    lanesSignalTraceError: null,
  };
}
