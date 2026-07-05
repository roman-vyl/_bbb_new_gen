import type { ChartBar, ComponentEvent } from "@/api/types";
import {
  buildTraceDisplayCacheKey,
  createSignalTraceDisplayCache,
  type SignalTraceDisplayCache,
} from "@/features/chart/signalTraceDisplayCache";
import {
  deriveTraceDisplayStateForCandles,
  shouldRetainPreviousTraceDisplay,
  type TraceDisplayState,
} from "@/features/chart/traceDisplayApply";
import {
  planMissingTraceDisplayChunkFetch,
  type PlannedTraceDisplayChunk,
} from "@/features/chart/runtime/traceDisplayChunkScheduling";
import type { SignalTraceLoadStatus } from "@/shared/context/signalTraceLoadPolicy";

import type { RuntimeTraceStatus } from "./runtimeTypes";

export const EMPTY_TRACE_DISPLAY_STATE: TraceDisplayState = {
  status: "empty",
  fromSec: 0,
  toSec: 0,
  events: [],
  htfSlice: { times: [], htf_context: undefined },
  coveredRanges: [],
  missingRange: null,
};

export type TraceDisplayRuntimeSnapshot = {
  implemented: true;
  status: RuntimeTraceStatus;
  componentEvents: ComponentEvent[];
  componentEventsStale: boolean;
  displayApplyRevision: number;
  missingRange: { fromSec: number; toSec: number } | null;
  traceDisplayState: TraceDisplayState;
  displayCacheCoversWindow: boolean;
  displayCacheHasWindowData: boolean;
};

export type TraceDisplayRuntimeInactiveSnapshot = {
  implemented: false;
  status: RuntimeTraceStatus;
  componentEvents: ComponentEvent[];
  componentEventsStale: boolean;
  displayApplyRevision: number;
  missingRange: { fromSec: number; toSec: number } | null;
};

export type TraceDisplayRuntimeBoundary =
  | TraceDisplayRuntimeInactiveSnapshot
  | TraceDisplayRuntimeSnapshot;

export type TraceDisplayRuntimeController = {
  cache: SignalTraceDisplayCache;
  cacheKey: string | null;
  displayApplyRevision: number;
  traceDisplayState: TraceDisplayState;
  componentEvents: ComponentEvent[];
  componentEventsStale: boolean;
  lastSlicedHtfOverlayPointCount: number;
  displayCacheVersion: number;
  lastApplyInputKey: string | null;
};

export type TraceDisplayApplyResult = {
  state: TraceDisplayState;
  changed: boolean;
};

export function createTraceDisplayRuntimeController(): TraceDisplayRuntimeController {
  return {
    cache: createSignalTraceDisplayCache(),
    cacheKey: null,
    displayApplyRevision: 0,
    traceDisplayState: EMPTY_TRACE_DISPLAY_STATE,
    componentEvents: [],
    componentEventsStale: false,
    lastSlicedHtfOverlayPointCount: 0,
    displayCacheVersion: 0,
    lastApplyInputKey: null,
  };
}

export function buildTraceDisplayApplyInputKey(
  controller: TraceDisplayRuntimeController,
  candles: readonly ChartBar[],
  traceLoadStatus: SignalTraceLoadStatus,
): string {
  if (candles.length === 0) {
    return `${controller.cacheKey ?? "none"}:${controller.displayCacheVersion}:empty:${traceLoadStatus}`;
  }
  const first = candles[0]!.time;
  const last = candles[candles.length - 1]!.time;
  return `${controller.cacheKey ?? "none"}:${controller.displayCacheVersion}:${traceLoadStatus}:${first}:${last}`;
}

export function buildTraceDisplayCacheKeyForRuntime(input: {
  selectedRunId: string;
  selectedVariantKey: string;
  effectiveContextOverlayRef: string | null;
}): string {
  return buildTraceDisplayCacheKey(
    input.selectedRunId,
    input.selectedVariantKey,
    input.effectiveContextOverlayRef,
  );
}

export function resetTraceDisplayRuntimeCache(
  controller: TraceDisplayRuntimeController,
  cacheKey: string,
): void {
  controller.cacheKey = cacheKey;
  controller.cache.reset(cacheKey);
  controller.displayApplyRevision = 0;
  controller.traceDisplayState = EMPTY_TRACE_DISPLAY_STATE;
  controller.componentEvents = [];
  controller.componentEventsStale = false;
  controller.lastSlicedHtfOverlayPointCount = 0;
  controller.displayCacheVersion += 1;
  controller.lastApplyInputKey = null;
}

export function bumpTraceDisplayCacheVersion(controller: TraceDisplayRuntimeController): void {
  controller.displayCacheVersion += 1;
}

function toRuntimeTraceStatus(status: SignalTraceLoadStatus): RuntimeTraceStatus {
  return status;
}

export function resolveDisplayCacheCoverage(
  controller: TraceDisplayRuntimeController,
  fromSec: number,
  toSec: number,
): {
  coversWindow: boolean;
  missingRange: { fromSec: number; toSec: number } | null;
  hasWindowData: boolean;
} {
  const coversWindow = controller.cache.coversRange(fromSec, toSec);
  const missingRange = controller.cache.missingRange(fromSec, toSec);
  const eventCount = controller.cache.sliceEventsForWindow(fromSec, toSec).length;
  const htfTimes = controller.cache.sliceHtfContextForWindow(fromSec, toSec).times.length;
  return {
    coversWindow,
    missingRange,
    hasWindowData: eventCount > 0 || htfTimes > 0,
  };
}

export function applyTraceDisplayForWindow(
  controller: TraceDisplayRuntimeController,
  candles: readonly ChartBar[],
  traceLoadStatus: SignalTraceLoadStatus,
): TraceDisplayApplyResult {
  const applyInputKey = buildTraceDisplayApplyInputKey(controller, candles, traceLoadStatus);
  if (controller.lastApplyInputKey === applyInputKey) {
    return { state: controller.traceDisplayState, changed: false };
  }

  const nextDisplayState = deriveTraceDisplayStateForCandles(
    controller.cache,
    candles,
    traceLoadStatus,
  );
  const shouldRetainPreviousDisplay = shouldRetainPreviousTraceDisplay(nextDisplayState, {
    eventCount: controller.componentEvents.length,
    htfOverlayPointCount: controller.lastSlicedHtfOverlayPointCount,
  });
  const retainedDisplayStatus =
    traceLoadStatus === "loading" ? "loading_missing" : nextDisplayState.status;

  const appliedState = shouldRetainPreviousDisplay
    ? {
        ...nextDisplayState,
        status: retainedDisplayStatus,
        events: controller.componentEvents,
      }
    : nextDisplayState;

  controller.traceDisplayState = appliedState;

  if (nextDisplayState.status === "empty") {
    controller.componentEvents = [];
    controller.displayApplyRevision += 1;
    controller.componentEventsStale = false;
    controller.lastApplyInputKey = applyInputKey;
    return { state: appliedState, changed: true };
  }

  if (!shouldRetainPreviousDisplay) {
    controller.componentEvents = nextDisplayState.events;
  }
  controller.displayApplyRevision += 1;

  controller.componentEventsStale =
    appliedState.status !== "current" &&
    appliedState.status !== "empty" &&
    controller.componentEvents.length > 0;

  controller.lastApplyInputKey = applyInputKey;
  return { state: appliedState, changed: true };
}

export function planTraceDisplayChunkFetch(
  controller: TraceDisplayRuntimeController,
  input: {
    candles: readonly ChartBar[];
    runId: string;
    variant: string;
    contextOverlayRef: string | null;
    chartTimeframe: string;
  },
): PlannedTraceDisplayChunk | null {
  return planMissingTraceDisplayChunkFetch({
    cache: controller.cache,
    candles: input.candles,
    runId: input.runId,
    variant: input.variant,
    contextOverlayRef: input.contextOverlayRef,
    chartTimeframe: input.chartTimeframe,
  });
}

export function resolveTraceDisplayRuntimeSnapshot(
  controller: TraceDisplayRuntimeController,
  candles: readonly ChartBar[],
  traceLoadStatus: SignalTraceLoadStatus,
): TraceDisplayRuntimeBoundary {
  if (candles.length === 0) {
    return {
      implemented: false,
      status: toRuntimeTraceStatus(traceLoadStatus),
      componentEvents: controller.componentEvents,
      componentEventsStale: controller.componentEventsStale,
      displayApplyRevision: controller.displayApplyRevision,
      missingRange: controller.traceDisplayState.missingRange,
    };
  }

  const bounds = controller.traceDisplayState;
  const fromSec = bounds.fromSec;
  const toSec = bounds.toSec;
  const coverage = resolveDisplayCacheCoverage(controller, fromSec, toSec);

  return {
    implemented: true,
    status: toRuntimeTraceStatus(traceLoadStatus),
    componentEvents: controller.componentEvents,
    componentEventsStale: controller.componentEventsStale,
    displayApplyRevision: controller.displayApplyRevision,
    missingRange: controller.traceDisplayState.missingRange,
    traceDisplayState: controller.traceDisplayState,
    displayCacheCoversWindow: coverage.coversWindow,
    displayCacheHasWindowData: coverage.hasWindowData,
  };
}
