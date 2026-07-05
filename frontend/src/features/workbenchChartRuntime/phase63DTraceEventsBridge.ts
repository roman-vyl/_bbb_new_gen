import type { ChartBar, ComponentEvent, RunReport, SignalTraceBundle, HtfContextTrace } from "@/api/types";
import { candleTimeBounds } from "@/features/chart/chartRenderWindowDisplay";
import type { RenderWindowInteractionState } from "@/features/chart/runtime/types";
import {
  loadDenseLanesTrace,
  loadDisplayTraceChunk,
  type DisplayLoadOutcome,
} from "@/features/chart/runtime/workbenchTraceNetworkLoad";
import { evaluateSignalTraceBootstrap } from "@/shared/context/signalTraceBootstrap";
import type { SignalTraceLoadStatus } from "@/shared/context/signalTraceLoadPolicy";
import { PIPELINE_DEBUG_STEPS as DBG } from "@/shared/diagnostics/pipelineDebug";

import { dbgMarkCutover, dbgTimedSyncCutover } from "./chartRuntimeCutoverTelemetry";
import {
  applyTraceDisplayForWindow,
  bumpTraceDisplayCacheVersion,
  buildTraceDisplayCacheKeyForRuntime,
  createTraceDisplayRuntimeController,
  resetTraceDisplayRuntimeCache,
  resolveDisplayCacheCoverage,
  type TraceDisplayApplyResult,
  type TraceDisplayRuntimeController,
} from "./traceDisplayRuntime";
import {
  buildTraceSessionCacheIdentity,
  createTraceRuntimeController,
  resetTraceCoordinator,
  resetTraceSessionCache,
  runTraceLoadCycle,
  type TraceLoadCycleInput,
  type TraceLoadCycleOutcome,
  type TraceLoadCycleResult,
  type TraceRuntimeController,
} from "./traceRuntime";

export type Phase63DTraceEventsOwnerState = {
  traceController: TraceRuntimeController;
  traceDisplayController: TraceDisplayRuntimeController;
};

export function createPhase63DTraceEventsOwnerState(): Phase63DTraceEventsOwnerState {
  return {
    traceController: createTraceRuntimeController(),
    traceDisplayController: createTraceDisplayRuntimeController(),
  };
}

export function resetPhase63DTraceDisplayCache(
  owner: Phase63DTraceEventsOwnerState,
  cacheKey: string,
): void {
  resetTraceDisplayRuntimeCache(owner.traceDisplayController, cacheKey);
  resetTraceCoordinator(owner.traceController);
}

export function resetPhase63DTraceSessionCache(
  owner: Phase63DTraceEventsOwnerState,
  sessionCacheIdentity: string,
): void {
  resetTraceSessionCache(owner.traceController, sessionCacheIdentity);
}

export function buildPhase63DTraceDisplayCacheKey(input: {
  selectedRunId: string;
  selectedVariantKey: string;
  effectiveContextOverlayRef: string | null;
}): string {
  return buildTraceDisplayCacheKeyForRuntime(input);
}

export function buildPhase63DSessionCacheIdentity(input: {
  selectedRunId: string;
  selectedVariantKey: string;
  effectiveContextOverlayRef: string | null;
  reloadToken: number;
  marketIdentity: string | null;
}): string {
  return buildTraceSessionCacheIdentity(input);
}

export function logPhase63DTraceCoverage(
  owner: Phase63DTraceEventsOwnerState,
  bounds: { fromSec: number; toSec: number },
): void {
  const coverage = resolveDisplayCacheCoverage(
    owner.traceDisplayController,
    bounds.fromSec,
    bounds.toSec,
  );
  dbgMarkCutover(DBG.traceDisplay.coverage, "trace", {
    fromSec: bounds.fromSec,
    toSec: bounds.toSec,
    coversWindow: coverage.coversWindow,
    missingRange: coverage.missingRange,
  });
}

export type Phase63DApplyTraceDisplayInput = {
  candles: readonly ChartBar[];
  traceLoadStatus: SignalTraceLoadStatus;
  selectedTradeId: number | string | null;
  selectedTradeEntryTimeSec: number | null;
  selectedTradeEntryMarkerInView: boolean;
};

export function runPhase63DApplyTraceDisplayForWindow(
  owner: Phase63DTraceEventsOwnerState,
  input: Phase63DApplyTraceDisplayInput,
): TraceDisplayApplyResult & {
  componentEvents: ComponentEvent[];
  componentEventsStale: boolean;
  displayApplyRevision: number;
  htfSlice: { times: number[]; htf_context?: HtfContextTrace };
} {
  const applyResult = applyTraceDisplayForWindow(
    owner.traceDisplayController,
    input.candles,
    input.traceLoadStatus,
  );
  const appliedState = applyResult.state;
  const bounds = candleTimeBounds(input.candles);

  dbgMarkCutover(DBG.traceDisplay.applyCurrentWindow, "trace", {
    fromSec: appliedState.fromSec,
    toSec: appliedState.toSec,
    status: appliedState.status,
    eventCount: owner.traceDisplayController.componentEvents.length,
    htfTimeCount: appliedState.htfSlice.times.length,
    coveredRanges: appliedState.coveredRanges,
    missingRange: appliedState.missingRange,
    retainedPreviousDisplay: !applyResult.changed,
    selectedTradeId: input.selectedTradeId,
    selectedTradeEntryTimeSec: input.selectedTradeEntryTimeSec,
    renderWindowFromSec: bounds?.fromSec,
    renderWindowToSec: bounds?.toSec,
    selectedTradeEntryMarkerInView: input.selectedTradeEntryMarkerInView,
  });

  return {
    ...applyResult,
    componentEvents: owner.traceDisplayController.componentEvents,
    componentEventsStale: owner.traceDisplayController.componentEventsStale,
    displayApplyRevision: owner.traceDisplayController.displayApplyRevision,
    htfSlice: appliedState.htfSlice,
  };
}

export function bumpPhase63DDisplayCacheVersion(owner: Phase63DTraceEventsOwnerState): void {
  bumpTraceDisplayCacheVersion(owner.traceDisplayController);
}

export type Phase63DTraceLoadTelemetryMeta = {
  renderWindowRevision: number;
  boundsKey: string;
  fetchSource?: string;
};

function wrapDisplayTraceLoader(
  meta: Phase63DTraceLoadTelemetryMeta,
): typeof loadDisplayTraceChunk {
  return async (ctx) => {
    dbgMarkCutover(DBG.signalTrace.fetchStart, "trace", {
      source: meta.fetchSource ?? "network",
      windowKey: ctx.params.windowKey,
      traceRequestKey: ctx.params.displayRequestKey,
      displayFetch: true,
    });
    const result = await loadDisplayTraceChunk(ctx);
    if (result.outcome === "committed") {
      dbgTimedSyncCutover(
        DBG.chartEvents.merge,
        "trace",
        () => result,
        () => ({
          mergeSource: result.mergeSource,
        }),
      );
    }
    if (result.outcome !== "aborted" && result.outcome !== "stale") {
      dbgMarkCutover(DBG.signalTrace.fetchEnd, "trace", {
        windowKey: ctx.params.windowKey,
        traceRequestKey: ctx.params.displayRequestKey,
        outcome: result.outcome,
      });
    }
    return result;
  };
}

function wrapDenseLanesLoader(meta: Phase63DTraceLoadTelemetryMeta): typeof loadDenseLanesTrace {
  return async (ctx) => {
    dbgMarkCutover(DBG.signalTrace.fetchStart, "trace", {
      source: meta.fetchSource ?? "network",
      windowKey: ctx.params.windowKey,
      traceRequestKey: ctx.params.networkCoordinatorKey,
      denseFetch: true,
    });
    const result = await loadDenseLanesTrace(ctx);
    if (result.outcome !== "aborted" && result.outcome !== "stale") {
      dbgMarkCutover(DBG.signalTrace.fetchEnd, "trace", {
        windowKey: ctx.params.windowKey,
        traceRequestKey: ctx.params.networkCoordinatorKey,
        outcome: result.outcome,
      });
    }
    return result;
  };
}

export function shouldPhase63DFinalizeTraceDisplay(outcome: TraceLoadCycleOutcome): boolean {
  return (
    outcome === "session_restored" ||
    outcome === "cache_hit" ||
    outcome === "pan_block" ||
    outcome === "completed" ||
    outcome === "display_committed" ||
    outcome === "lanes_ready" ||
    outcome === "error"
  );
}

export async function runPhase63DTraceLoadCycle(
  owner: Phase63DTraceEventsOwnerState,
  input: Omit<TraceLoadCycleInput, "traceController" | "displayController"> & {
    coalescedWindowKey?: string | null;
    report: RunReport | null;
    reportLoadStatus: "idle" | "loading" | "ready" | "error";
    telemetryMeta: Phase63DTraceLoadTelemetryMeta;
  },
): Promise<TraceLoadCycleResult> {
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
    previousWindowKey: owner.traceController.previousWindowKey,
  });

  if (!bootstrap.ready) {
    dbgMarkCutover(DBG.signalTrace.bootstrapBlocked, "trace", { reason: bootstrap.reason });
  } else {
    dbgMarkCutover(DBG.signalTrace.bootstrapReady, "trace", {
      windowKey: bootstrap.windowKey,
      traceRequestKey: bootstrap.request
        ? `${bootstrap.request.runId}:${bootstrap.request.variant}`
        : undefined,
      renderWindowRevision: input.telemetryMeta.renderWindowRevision,
      boundsKey: input.telemetryMeta.boundsKey,
      fetchSource: input.telemetryMeta.fetchSource,
    });
  }

  const result = await runTraceLoadCycle({
    ...input,
    coalescedWindowKey: input.coalescedWindowKey ?? null,
    traceController: owner.traceController,
    displayController: owner.traceDisplayController,
    loadDisplayTraceChunk: wrapDisplayTraceLoader(input.telemetryMeta),
    loadDenseLanesTrace: wrapDenseLanesLoader(input.telemetryMeta),
  });

  if (result.outcome === "deferred" && input.renderWindowBounds !== null) {
    const covers = owner.traceDisplayController.cache.coversRange(
      input.renderWindowBounds.fromSec,
      input.renderWindowBounds.toSec,
    );
    if (!covers) {
      dbgMarkCutover(DBG.traceDisplay.cacheMiss, "trace", {
        windowKey: input.chartWindowKey,
      });
    }
  }

  return result;
}

export function resolvePhase63DLanesSnapshot(owner: Phase63DTraceEventsOwnerState): {
  signalTrace: SignalTraceBundle | null;
  signalTraceStatus: SignalTraceLoadStatus;
  signalTraceError: string | null;
  loadedSignalTraceWindowKey: string | null;
} {
  const controller = owner.traceController;
  return {
    signalTrace: controller.lanesBundle,
    signalTraceStatus: controller.lanesStatus,
    signalTraceError: controller.lanesError,
    loadedSignalTraceWindowKey: controller.loadedWindowKey,
  };
}

export function resolvePhase63DInteractionState(input: {
  interactionState: RenderWindowInteractionState;
  hasPendingShift: boolean;
}): { interactionState: RenderWindowInteractionState; hasPendingShift: boolean } {
  return input;
}

export function mapPhase63DDisplayLoadOutcome(
  displayLoadOutcome: DisplayLoadOutcome | null,
): string | null {
  return displayLoadOutcome;
}
