import type { ChartBar, RunReport, RunVariant, SignalTraceBundle } from "@/api/types";
import type { HtfContextTraceSlice } from "@/features/chart/signalTraceDisplayCache";
import type { SignalTraceLoadStatus } from "@/shared/context/signalTraceLoadPolicy";
import { PIPELINE_DEBUG_STEPS as DBG } from "@/shared/diagnostics/pipelineDebug";

import {
  applyHtfOverlaysFromDisplaySlice,
  applyHtfOverlaysFromDenseTrace,
  createAuxOverlayRuntimeController,
  loadBffAuxOverlaysRuntime,
  resetAuxOverlayRuntime,
  resolveAuxEmaSpecsRuntime,
  resolveAuxOverlayRuntimeSnapshot,
  syncAuxOverlaySpecs,
  type AuxOverlayRuntimeBoundary,
  type AuxOverlayRuntimeController,
  type BffAuxOverlayLoadResult,
} from "./auxOverlayRuntime";
import { dbgMarkCutover, dbgTimedSyncCutover } from "./chartRuntimeCutoverTelemetry";
import {
  buildChartModelStabilityKey,
  resolveChartModelRuntime,
  type ChartModelStabilizeCache,
} from "./chartModelRuntime";
import {
  buildChartModelRuntimeInputFromOldPipeline,
  PHASE_63A_MODEL_ADAPTER_APPLY_STEP,
  resolvePhase63AModelRuntimeSlice,
  type OldPipelineModelBridgeInput,
  type Phase63AModelRuntimeSlice,
} from "./phase63AModelAdapterBridge";
import type { TraceDisplayRuntimeController } from "./traceDisplayRuntime";

export type Phase63EAuxOverlayOwnerState = {
  controller: AuxOverlayRuntimeController;
  lastSnapshotKey: string | null;
};

export function createPhase63EAuxOverlayOwnerState(): Phase63EAuxOverlayOwnerState {
  return {
    controller: createAuxOverlayRuntimeController(),
    lastSnapshotKey: null,
  };
}

export function resetPhase63EAuxOverlayOwner(owner: Phase63EAuxOverlayOwnerState): void {
  resetAuxOverlayRuntime(owner.controller);
  owner.lastSnapshotKey = null;
}

export function syncPhase63EAuxOverlaySpecs(
  owner: Phase63EAuxOverlayOwnerState,
  input: {
    selectedVariant: RunVariant | null;
    chartTimeframe: string;
    effectiveContextOverlayRef: string | null;
  },
): void {
  syncAuxOverlaySpecs(
    owner.controller,
    resolveAuxEmaSpecsRuntime({
      selectedVariant: input.selectedVariant,
      chartTimeframe: input.chartTimeframe,
      effectiveContextOverlayRef: input.effectiveContextOverlayRef,
    }),
  );
}

export function runPhase63EApplyHtfFromDisplaySlice(
  owner: Phase63EAuxOverlayOwnerState,
  htfSlice: { times: number[]; htf_context?: HtfContextTraceSlice["htf_context"] },
): boolean {
  const htfSpecCount = owner.controller.auxEmaSpecs.filter((spec) => spec.source === "htf_trace").length;
  if (htfSpecCount === 0 || htfSlice.times.length === 0 || !htfSlice.htf_context) {
    return false;
  }
  applyHtfOverlaysFromDisplaySlice(owner.controller, htfSlice);
  dbgTimedSyncCutover(
    DBG.traceDisplay.sliceHtf,
    "aux_overlay",
    () => htfSlice.times.length,
    () => ({ source: "display_slice" }),
  );
  dbgMarkCutover(DBG.auxOverlay.slice, "aux_overlay", {
    htfTimeCount: htfSlice.times.length,
    source: "display_slice",
  });
  return true;
}

export function runPhase63ESyncHtfOverlaysFromTraceFallback(
  owner: Phase63EAuxOverlayOwnerState,
  input: {
    renderWindowCandles: readonly ChartBar[];
    traceDisplayCache: TraceDisplayRuntimeController["cache"];
    signalTraceStatus: SignalTraceLoadStatus;
    signalTrace: SignalTraceBundle | null;
  },
): boolean {
  const htfSpecCount = owner.controller.auxEmaSpecs.filter((spec) => spec.source === "htf_trace").length;
  if (htfSpecCount === 0) {
    return false;
  }
  if (input.renderWindowCandles.length === 0) {
    return false;
  }
  const fromSec = input.renderWindowCandles[0]!.time;
  const toSec = input.renderWindowCandles[input.renderWindowCandles.length - 1]!.time;
  const htfSlice = input.traceDisplayCache.sliceHtfContextForWindow(fromSec, toSec);
  if (htfSlice.times.length > 0 && htfSlice.htf_context) {
    return false;
  }
  if (input.signalTraceStatus === "ready" && input.signalTrace !== null) {
    applyHtfOverlaysFromDenseTrace(owner.controller, input.signalTrace);
    dbgMarkCutover(DBG.auxOverlay.merge, "aux_overlay", {
      source: "dense_trace",
    });
    return true;
  }
  if (input.signalTraceStatus === "loading" || input.signalTraceStatus === "error") {
    return false;
  }
  if (input.signalTraceStatus === "idle" && htfSpecCount > 0) {
    owner.controller.auxEmaOverlays = owner.controller.auxEmaOverlays.filter(
      (overlay) => !overlay.id.startsWith("htf_"),
    );
    owner.controller.frozenHtfOverlays = [];
    return true;
  }
  return false;
}

export function resolvePhase63EDisplayCacheHasWindowData(input: {
  traceDisplayCache: TraceDisplayRuntimeController["cache"];
  renderWindowBounds: { fromSec: number; toSec: number } | null;
}): boolean {
  if (input.renderWindowBounds === null) {
    return false;
  }
  const { fromSec, toSec } = input.renderWindowBounds;
  const eventCount = input.traceDisplayCache.sliceEventsForWindow(fromSec, toSec).length;
  const htfTimes = dbgTimedSyncCutover(
    DBG.traceDisplay.sliceHtf,
    "aux_overlay",
    () => input.traceDisplayCache.sliceHtfContextForWindow(fromSec, toSec).times.length,
    () => ({ fromSec, toSec }),
  );
  return eventCount > 0 || htfTimes > 0;
}

export type Phase63EAuxOverlaySnapshotInput = {
  slicedAuxOverlays: readonly import("@/api/types").ChartAuxEmaOverlay[];
  renderWindowCandles: readonly ChartBar[];
  chartWindowKey: string | null;
  loadedSignalTraceWindowKey: string | null;
  displayCacheCoversWindow: boolean;
  displayCacheHasWindowData: boolean;
  signalTraceStatus: SignalTraceLoadStatus;
  htfSlice?: HtfContextTraceSlice;
};

export function resolvePhase63EAuxOverlaySnapshot(
  owner: Phase63EAuxOverlayOwnerState,
  input: Phase63EAuxOverlaySnapshotInput,
): AuxOverlayRuntimeBoundary {
  const snapshotKey = [
    input.chartWindowKey ?? "",
    input.loadedSignalTraceWindowKey ?? "",
    input.displayCacheCoversWindow ? "1" : "0",
    input.displayCacheHasWindowData ? "1" : "0",
    input.signalTraceStatus,
    input.renderWindowCandles.length,
    input.htfSlice?.times.length ?? 0,
  ].join(":");

  const snapshot = resolveAuxOverlayRuntimeSnapshot({
    controller: owner.controller,
    slicedAuxOverlays: input.slicedAuxOverlays,
    renderWindowCandles: input.renderWindowCandles,
    chartWindowKey: input.chartWindowKey,
    loadedSignalTraceWindowKey: input.loadedSignalTraceWindowKey,
    displayCacheCoversWindow: input.displayCacheCoversWindow,
    displayCacheHasWindowData: input.displayCacheHasWindowData,
    signalTraceStatus: input.signalTraceStatus,
    htfSlice: input.htfSlice,
  });

  const changed = owner.lastSnapshotKey !== snapshotKey;
  owner.lastSnapshotKey = snapshotKey;

  if (changed && snapshot.implemented) {
    dbgMarkCutover(DBG.auxOverlay.applyCurrentWindow, "aux_overlay", {
      overlayCount: snapshot.auxOverlayCount,
      htfOverlayCount: snapshot.htfOverlayCount,
      stale: snapshot.htfAuxEmaOverlayStale,
    });
  }
  if (snapshot.htfAuxEmaOverlayStale) {
    dbgMarkCutover(DBG.auxOverlay.stale, "aux_overlay", {
      displayCacheCoversWindow: input.displayCacheCoversWindow,
      displayCacheHasWindowData: input.displayCacheHasWindowData,
      signalTraceStatus: input.signalTraceStatus,
    });
  }

  return snapshot;
}

export async function runPhase63ELoadBffAuxOverlays(
  owner: Phase63EAuxOverlayOwnerState,
  input: {
    chartHeavyIoEnabled: boolean;
    marketLoadStatus: "idle" | "loading" | "ready" | "error";
    report: RunReport | null;
    chartTimeframe: string;
    signal?: AbortSignal;
  },
): Promise<BffAuxOverlayLoadResult> {
  return loadBffAuxOverlaysRuntime(owner.controller, input);
}

export function resolvePhase63EModelRuntimeSlice(
  input: OldPipelineModelBridgeInput,
  auxOverlaySnapshot: AuxOverlayRuntimeBoundary,
  stabilizeCache?: ChartModelStabilizeCache,
): Phase63AModelRuntimeSlice {
  const modelRuntimeInput = buildChartModelRuntimeInputFromOldPipeline(input, auxOverlaySnapshot);
  const stabilityKey = buildChartModelStabilityKey(modelRuntimeInput);
  if (stabilizeCache !== undefined && stabilizeCache.key === stabilityKey) {
    return { chartViewModel: stabilizeCache.boundary.chartViewModel };
  }

  const boundary = resolveChartModelRuntime({
    ...modelRuntimeInput,
    ...(stabilizeCache !== undefined ? { stabilizeCache } : {}),
  });

  dbgMarkCutover(PHASE_63A_MODEL_ADAPTER_APPLY_STEP, "model", {
    seriesKey: boundary.chartViewModel.seriesKey,
    barCount: boundary.chartViewModel.count,
    viewMode: boundary.chartViewModel.viewMode,
  });

  if (boundary.chartViewModel.count === 0) {
    dbgMarkCutover(DBG.keyboard.modelApplyEmpty, "model", {
      seriesKey: boundary.chartViewModel.seriesKey,
      barCount: 0,
      viewMode: boundary.chartViewModel.viewMode,
      inputFirstTimeSec: input.chartView.firstTimeSec,
      inputLastTimeSec: input.chartView.lastTimeSec,
      inputCount: input.chartView.count,
      inputMode: input.chartView.mode,
      inputCenterTimeSec: input.chartView.centerTimeSec,
      inputCandlesLength: input.chartView.candles.length,
    });
  }

  return { chartViewModel: boundary.chartViewModel };
}

/** @deprecated Use resolvePhase63EModelRuntimeSlice when aux overlay is v2-owned. */
export { resolvePhase63AModelRuntimeSlice };
