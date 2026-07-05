import type { ChartAuxEmaOverlay } from "@/api/types";
import {
  buildChartViewModel,
  type ChartViewModel,
} from "@/features/chart/runtime/chartViewModel";
import type { ChartViewMode } from "@/features/chart/chartViewWindow";
import type { TraceDisplayStatus } from "@/features/chart/traceDisplayApply";

import type { AuxOverlayRuntimeBoundary } from "./auxOverlayRuntime";
import type { ChartRuntimeModelParts } from "./runtimeTypes";
import type { TraceDisplayRuntimeBoundary } from "./traceDisplayRuntime";

export type ChartModelRuntimeSnapshot = {
  implemented: true;
  chartViewModel: ChartViewModel;
};

export type ChartModelRuntimeInactiveSnapshot = {
  implemented: false;
  chartViewModel: ChartViewModel;
};

export type ChartModelRuntimeBoundary =
  | ChartModelRuntimeInactiveSnapshot
  | ChartModelRuntimeSnapshot;

export function createEmptyChartViewModel(): ChartViewModel {
  return buildChartViewModel({
    candles: [],
    emaOverlays: [],
    auxEmaOverlays: [],
    displayAuxEmaOverlays: [],
    componentEvents: [],
    htfOverlayStale: false,
    componentEventsStale: false,
    traceDisplayStatus: "empty",
    traceDisplayMissingRange: null,
    viewMode: "empty",
    centerTimeSec: null,
    firstTimeSec: null,
    lastTimeSec: null,
    count: 0,
  });
}

export type ChartModelStabilizeCache = {
  key: string | null;
  boundary: ChartModelRuntimeBoundary;
};

export function createChartModelStabilizeCache(): ChartModelStabilizeCache {
  return {
    key: null,
    boundary: { implemented: false, chartViewModel: createEmptyChartViewModel() },
  };
}

export function buildChartModelStabilityKey(input: {
  chartWindowParts: ChartRuntimeModelParts;
  displayAuxEmaOverlays: ChartAuxEmaOverlay[];
  traceDisplay: TraceDisplayRuntimeBoundary;
  auxOverlay: AuxOverlayRuntimeBoundary;
  viewMode: ChartViewMode;
  centerTimeSec: number | null;
  firstTimeSec: number | null;
  lastTimeSec: number | null;
  count: number;
}): string {
  const traceRevision = input.traceDisplay.displayApplyRevision;
  const traceStatus = input.traceDisplay.implemented
    ? input.traceDisplay.traceDisplayState.status
    : "empty";
  const windowKey =
    input.count === 0 ? "empty" : `${input.firstTimeSec}:${input.lastTimeSec}:${input.count}`;
  return [
    windowKey,
    input.viewMode,
    input.centerTimeSec ?? "",
    traceRevision,
    traceStatus,
    input.traceDisplay.componentEvents.length,
    input.displayAuxEmaOverlays.length,
    input.auxOverlay.htfAuxEmaOverlayStale ? "1" : "0",
    input.traceDisplay.componentEventsStale ? "1" : "0",
  ].join(":");
}

export function resolveChartModelRuntime(input: {
  chartWindowParts: ChartRuntimeModelParts;
  displayAuxEmaOverlays: ChartAuxEmaOverlay[];
  traceDisplay: TraceDisplayRuntimeBoundary;
  auxOverlay: AuxOverlayRuntimeBoundary;
  viewMode: ChartViewMode;
  centerTimeSec: number | null;
  firstTimeSec: number | null;
  lastTimeSec: number | null;
  count: number;
  stabilizeCache?: ChartModelStabilizeCache;
}): ChartModelRuntimeBoundary {
  const stabilityKey = buildChartModelStabilityKey(input);
  if (input.stabilizeCache !== undefined && input.stabilizeCache.key === stabilityKey) {
    return input.stabilizeCache.boundary;
  }

  const traceDisplayStatus: TraceDisplayStatus =
    input.traceDisplay.implemented
      ? input.traceDisplay.traceDisplayState.status
      : "empty";
  const traceDisplayMissingRange = input.traceDisplay.implemented
    ? input.traceDisplay.traceDisplayState.missingRange
    : null;

  const chartViewModel = buildChartViewModel({
    candles: input.chartWindowParts.candles,
    emaOverlays: input.chartWindowParts.emaOverlays,
    auxEmaOverlays: input.chartWindowParts.auxEmaOverlays,
    displayAuxEmaOverlays: input.displayAuxEmaOverlays,
    componentEvents: input.traceDisplay.componentEvents,
    htfOverlayStale: input.auxOverlay.htfAuxEmaOverlayStale,
    componentEventsStale: input.traceDisplay.componentEventsStale,
    traceDisplayStatus,
    traceDisplayMissingRange,
    viewMode: input.viewMode,
    centerTimeSec: input.centerTimeSec,
    firstTimeSec: input.firstTimeSec,
    lastTimeSec: input.lastTimeSec,
    count: input.count,
  });

  if (input.count === 0) {
    const boundary = { implemented: false as const, chartViewModel };
    if (input.stabilizeCache !== undefined) {
      input.stabilizeCache.key = stabilityKey;
      input.stabilizeCache.boundary = boundary;
    }
    return boundary;
  }

  const boundary = { implemented: true as const, chartViewModel };
  if (input.stabilizeCache !== undefined) {
    input.stabilizeCache.key = stabilityKey;
    input.stabilizeCache.boundary = boundary;
  }
  return boundary;
}

export function chartWindowKeyFromCandles(
  selectedRunId: string,
  selectedVariantKey: string,
  candles: readonly { time: number }[],
  effectiveContextOverlayRef: string | null,
): string | null {
  if (candles.length === 0) {
    return null;
  }
  const first = candles[0]!.time;
  const last = candles[candles.length - 1]!.time;
  const overlay = effectiveContextOverlayRef ?? "";
  return `${selectedRunId}:${selectedVariantKey}:${first}:${last}:${overlay}`;
}
