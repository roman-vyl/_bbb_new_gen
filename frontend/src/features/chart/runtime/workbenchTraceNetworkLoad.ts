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
import { dbgFlush, dbgMark, dbgTimedSync, PIPELINE_DEBUG_STEPS as DBG } from "@/shared/diagnostics/pipelineDebug";

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
        traceRequestKey: params.displayRequestKey,
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
