import { ApiError, fetchChartEvents, fetchSignalTrace } from "@/api/client";
import type { SignalTraceBundle } from "@/api/types";
import {
  chartEventsFallbackReasonFromError,
  isChartEventsApiEnabled,
  noteChartEventsFlagDisabledOnce,
  type ChartEventsMergeSource,
} from "@/features/chart/runtime/chartEventsLoad";
import type { SignalTraceRequestCoordinator } from "@/features/chart/runtime/signalTraceRequestCoordinator";
import {
  computeChunkBoundsFromChartEvents,
  computeChunkBoundsFromResponse,
  isTraceResponseTruncated,
  mergeDisplayChunkFromChartEvents,
  mergeDisplayChunkFromResponse,
  type SignalTraceDisplayCache,
  type TimeBounds,
} from "@/features/chart/signalTraceDisplayCache";
import {
  signalTraceMatchesChartWindow,
  type SignalTraceLoadStatus,
} from "@/shared/context/signalTraceLoadPolicy";
import { dbgFlush, dbgMark, dbgTimedSync, PIPELINE_DEBUG_STEPS as DBG } from "@/shared/diagnostics/pipelineDebug";

export type DisplayLoadOutcome =
  | "committed"
  | "fallback_needed"
  | "skipped_flag_off"
  | "skipped_lanes_only";

export type DenseLanesFetchReason =
  | "flag_off_combined"
  | "lanes_pending"
  | "display_fallback_needed";

export type DenseLanesUseLoadedReason = "flag_off_combined" | "display_fallback_needed";

export type DenseLanesNetworkDecision =
  | { action: "skip"; reason: "lanes_ready" | "chart_heavy_io_off" }
  | { action: "use_loaded_bundle"; reason: DenseLanesUseLoadedReason }
  | { action: "restore_session"; windowKey: string }
  | {
      action: "fetch";
      lanesRequestKey: string;
      fromMs: number;
      toOpenTimeMs: number;
      reason: DenseLanesFetchReason;
    };

export type DecideDenseLanesNetworkLoadInput = {
  chartEventsEnabled: boolean;
  committedWindowKey: string;
  loadedSignalTraceWindowKey: string | null;
  signalTraceStatus: SignalTraceLoadStatus;
  loadedSignalTrace: SignalTraceBundle | null;
  sessionCacheHasWindow: boolean;
  displayCacheCoversWindow: boolean;
  displayLoadOutcome: DisplayLoadOutcome;
  lanesRequestKey: string;
  fromMs: number;
  toOpenTimeMs: number;
};

export function lanesReadyForWindow(input: {
  committedWindowKey: string;
  loadedSignalTraceWindowKey: string | null;
  signalTraceStatus: SignalTraceLoadStatus;
}): boolean {
  return (
    signalTraceMatchesChartWindow(input.committedWindowKey, input.loadedSignalTraceWindowKey) &&
    (input.signalTraceStatus === "ready" || input.signalTraceStatus === "error")
  );
}

export function canUseLoadedBundleForDisplay(input: {
  committedWindowKey: string;
  loadedSignalTraceWindowKey: string | null;
  signalTraceStatus: SignalTraceLoadStatus;
  loadedSignalTrace: SignalTraceBundle | null;
}): boolean {
  return (
    lanesReadyForWindow(input) &&
    input.signalTraceStatus === "ready" &&
    input.loadedSignalTrace !== null
  );
}

export function mapDisplayLoadOutcome(
  lanesOnlyFetch: boolean,
  chartEventsEnabled: boolean,
  displayResult: DisplayTraceChunkLoadResult | null,
): DisplayLoadOutcome | null {
  if (lanesOnlyFetch) {
    return "skipped_lanes_only";
  }
  if (displayResult === null) {
    return null;
  }
  if (displayResult.outcome === "aborted" || displayResult.outcome === "stale") {
    return null;
  }
  if (!chartEventsEnabled) {
    return "skipped_flag_off";
  }
  if (displayResult.outcome === "committed") {
    return "committed";
  }
  return "fallback_needed";
}

function sessionRestoreEligible(input: DecideDenseLanesNetworkLoadInput): boolean {
  return (
    input.chartEventsEnabled &&
    input.displayCacheCoversWindow &&
    input.sessionCacheHasWindow
  );
}

export function decideDenseLanesNetworkLoad(
  input: DecideDenseLanesNetworkLoadInput,
): DenseLanesNetworkDecision {
  const lanesReady = lanesReadyForWindow(input);
  const canUseLoaded = canUseLoadedBundleForDisplay(input);

  if (input.displayLoadOutcome === "fallback_needed") {
    if (canUseLoaded) {
      return { action: "use_loaded_bundle", reason: "display_fallback_needed" };
    }
    return {
      action: "fetch",
      lanesRequestKey: input.lanesRequestKey,
      fromMs: input.fromMs,
      toOpenTimeMs: input.toOpenTimeMs,
      reason: "display_fallback_needed",
    };
  }

  if (input.displayLoadOutcome === "skipped_flag_off") {
    if (canUseLoaded) {
      return { action: "use_loaded_bundle", reason: "flag_off_combined" };
    }
    return {
      action: "fetch",
      lanesRequestKey: input.lanesRequestKey,
      fromMs: input.fromMs,
      toOpenTimeMs: input.toOpenTimeMs,
      reason: "flag_off_combined",
    };
  }

  if (
    input.displayLoadOutcome === "committed" ||
    input.displayLoadOutcome === "skipped_lanes_only"
  ) {
    if (lanesReady) {
      return { action: "skip", reason: "lanes_ready" };
    }
    if (sessionRestoreEligible(input)) {
      return { action: "restore_session", windowKey: input.committedWindowKey };
    }
    return {
      action: "fetch",
      lanesRequestKey: input.lanesRequestKey,
      fromMs: input.fromMs,
      toOpenTimeMs: input.toOpenTimeMs,
      reason: "lanes_pending",
    };
  }

  return { action: "skip", reason: "lanes_ready" };
}

export type ApplyLanesFromSessionBundleContext = {
  sessionBundle: SignalTraceBundle;
  windowKey: string;
  lanesRequestKey: string;
  coordinator: SignalTraceRequestCoordinator;
  applyLanesState: (bundle: SignalTraceBundle) => void;
};

/** Lanes-only session restore — no display cache merge (display already satisfied). */
export function applyLanesFromSessionBundle(ctx: ApplyLanesFromSessionBundleContext): void {
  ctx.coordinator.markMerged(ctx.lanesRequestKey, "session_restore");
  dbgMark(DBG.lanesTrace.sessionRestore, {
    windowKey: ctx.windowKey,
    traceRequestKey: ctx.lanesRequestKey,
  });
  ctx.applyLanesState(ctx.sessionBundle);
}

export type TraceChunkNetworkParams = {
  runId: string;
  variant: string;
  fromMs: number;
  toOpenTimeMs: number;
  contextOverlayRef: string | null | undefined;
  windowKey: string;
  displayRequestKey: string;
  networkCoordinatorKey: string;
  fetchGeneration: number;
  signal: AbortSignal;
  lanesOnlyFetch: boolean;
};

export type DisplayTraceChunkLoadResult =
  | { outcome: "committed"; displayMerged: true; mergeSource: "chart-events" }
  | { outcome: "continue"; displayMerged: boolean; mergeSource: ChartEventsMergeSource }
  | { outcome: "aborted" }
  | { outcome: "stale"; phase: "chart_events_response" };

export type DenseLanesLoadResult =
  | { outcome: "ok"; bundle: SignalTraceBundle }
  | { outcome: "aborted" }
  | { outcome: "stale"; phase: "response" | "error" }
  | { outcome: "error"; error: unknown };

export type WorkbenchTraceNetworkLoadContext = {
  params: TraceChunkNetworkParams;
  cache: SignalTraceDisplayCache;
  coordinator: SignalTraceRequestCoordinator;
  requestedBounds: TimeBounds;
  onCommitDisplay: () => void;
};

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

function denseResponseCurrent(
  coordinator: SignalTraceRequestCoordinator,
  networkCoordinatorKey: string,
  fetchGeneration: number,
): boolean {
  return coordinator.isResponseCurrent(networkCoordinatorKey, fetchGeneration);
}

/** Display path: chart-events fetch + cache merge (+ commit when successful). */
export async function loadDisplayTraceChunk(
  ctx: WorkbenchTraceNetworkLoadContext,
): Promise<DisplayTraceChunkLoadResult> {
  const { params, cache, coordinator, requestedBounds, onCommitDisplay } = ctx;
  const {
    runId,
    variant,
    fromMs,
    toOpenTimeMs,
    contextOverlayRef,
    windowKey,
    displayRequestKey,
    fetchGeneration,
    signal,
    lanesOnlyFetch,
  } = params;

  let displayMerged = lanesOnlyFetch;
  let mergeSource: ChartEventsMergeSource = lanesOnlyFetch ? "chart-events" : "signal-trace-fallback";
  const chartEventsEnabled = isChartEventsApiEnabled();

  if (!chartEventsEnabled) {
    noteChartEventsFlagDisabledOnce();
  }

  if (!chartEventsEnabled || lanesOnlyFetch) {
    return { outcome: "continue", displayMerged, mergeSource };
  }

  try {
    const chartBundle = await fetchChartEvents({
      runId,
      variant,
      fromMs,
      toOpenTimeMs,
      contextOverlayRef,
      signal,
    });
    if (!coordinator.isResponseCurrent(displayRequestKey, fetchGeneration)) {
      dbgMark(DBG.signalTrace.fetchStaleResponse, {
        windowKey,
        traceRequestKey: displayRequestKey,
        phase: "chart_events_response",
      });
      return { outcome: "stale", phase: "chart_events_response" };
    }
    const actualBounds = computeChunkBoundsFromChartEvents(chartBundle);
    const truncated =
      chartBundle.coverage.truncated || isTraceResponseTruncated(requestedBounds, actualBounds);
    dbgTimedSync(
      DBG.traceDisplay.mergeChunk,
      () => {
        mergeDisplayChunkFromChartEvents(cache, chartBundle);
      },
      () => ({
        eventCount: chartBundle.component_events?.length ?? 0,
        timeCount: chartBundle.times.length,
        source: "chart-events",
      }),
    );
    mergeSource = "chart-events";
    dbgMark(DBG.chartEvents.merge, {
      windowKey,
      traceRequestKey: displayRequestKey,
      source: mergeSource,
      truncated,
      requested: requestedBounds,
      actual: actualBounds,
    });
    onCommitDisplay();
    return { outcome: "committed", displayMerged: true, mergeSource: "chart-events" };
  } catch (chartErr) {
    if (isAbortError(chartErr)) {
      dbgMark(DBG.signalTrace.fetchAbort, {
        windowKey,
        traceRequestKey: displayRequestKey,
        note: "chart-events fetch aborted",
      });
      return { outcome: "aborted" };
    }
    dbgMark(DBG.chartEvents.fetchFail, {
      windowKey,
      traceRequestKey: displayRequestKey,
      status: chartErr instanceof ApiError ? chartErr.status : undefined,
      detail:
        chartErr instanceof ApiError
          ? chartErr.detail
          : chartErr instanceof Error
            ? chartErr.message
            : String(chartErr),
    });
    dbgMark(DBG.chartEvents.fallback, {
      reason: chartEventsFallbackReasonFromError(chartErr),
    });
    return { outcome: "continue", displayMerged, mergeSource };
  }
}

/** Display fallback: merge dense bundle into display cache when chart-events did not commit. */
export function mergeDisplayFromDenseFallback(ctx: WorkbenchTraceNetworkLoadContext & {
  bundle: SignalTraceBundle;
  mergeSource: ChartEventsMergeSource;
}): void {
  const { params, cache, requestedBounds, onCommitDisplay, bundle, mergeSource } = ctx;
  const { windowKey, displayRequestKey } = params;
  const chartEventsEnabled = isChartEventsApiEnabled();

  const actualBounds = computeChunkBoundsFromResponse(bundle);
  const truncated = isTraceResponseTruncated(requestedBounds, actualBounds);
  dbgTimedSync(
    DBG.traceDisplay.mergeChunk,
    () => {
      mergeDisplayChunkFromResponse(cache, bundle);
    },
    () => ({
      eventCount: bundle.component_events?.length ?? 0,
      timeCount: bundle.times.length,
      source: mergeSource,
    }),
  );
  if (chartEventsEnabled) {
    dbgMark(DBG.chartEvents.merge, {
      windowKey,
      traceRequestKey: displayRequestKey,
      source: mergeSource,
      truncated,
      requested: requestedBounds,
      actual: actualBounds,
    });
  } else {
    dbgMark("wb.signal_trace_merge", {
      windowKey,
      traceRequestKey: displayRequestKey,
      truncated,
      requested: requestedBounds,
      actual: actualBounds,
    });
  }
  onCommitDisplay();
}

/** Lanes path: dense signal-trace fetch only (no display cache merge). */
export async function loadDenseLanesTrace(ctx: WorkbenchTraceNetworkLoadContext): Promise<DenseLanesLoadResult> {
  const { params, coordinator } = ctx;
  const {
    runId,
    variant,
    fromMs,
    toOpenTimeMs,
    contextOverlayRef,
    windowKey,
    networkCoordinatorKey,
    fetchGeneration,
    signal,
  } = params;
  const chartEventsEnabled = isChartEventsApiEnabled();

  try {
    const bundle = await fetchSignalTrace({
      runId,
      variant,
      fromMs,
      toOpenTimeMs,
      contextOverlayRef,
      signal,
    });
    if (!denseResponseCurrent(coordinator, networkCoordinatorKey, fetchGeneration)) {
      dbgMark(DBG.signalTrace.fetchStaleResponse, {
        windowKey,
        traceRequestKey: networkCoordinatorKey,
        phase: "response",
      });
      return { outcome: "stale", phase: "response" };
    }
    dbgMark(DBG.signalTrace.fetchEnd, {
      windowKey,
      traceRequestKey: networkCoordinatorKey,
      timeCount: bundle.times.length,
      eventCount: bundle.component_events?.length ?? 0,
      lanesFetch: chartEventsEnabled,
    });
    return { outcome: "ok", bundle };
  } catch (err) {
    if (isAbortError(err)) {
      dbgMark(DBG.signalTrace.fetchAbort, {
        windowKey,
        traceRequestKey: networkCoordinatorKey,
        note: "frontend abort/stale-response protection; backend CPU work may continue",
      });
      return { outcome: "aborted" };
    }
    if (!denseResponseCurrent(coordinator, networkCoordinatorKey, fetchGeneration)) {
      dbgMark(DBG.signalTrace.fetchStaleResponse, {
        windowKey,
        traceRequestKey: networkCoordinatorKey,
        phase: "error",
      });
      return { outcome: "stale", phase: "error" };
    }
    return { outcome: "error", error: err };
  }
}

/** Debug flush after successful lanes apply (same label as WorkbenchContext). */
export function flushLanesLoadDebug(): void {
  dbgFlush("workbench-after-signal-trace");
}
