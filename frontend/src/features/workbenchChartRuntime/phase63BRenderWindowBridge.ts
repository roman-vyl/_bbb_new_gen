import type { ChartAuxEmaOverlay, ChartBar, ChartMarketBundle } from "@/api/types";
import type { ChartViewMode, ChartViewWindow } from "@/features/chart/chartViewWindow";
import type { WindowCommitResult } from "@/features/chart/runtime/types";
import { PIPELINE_DEBUG_STEPS as DBG } from "@/shared/diagnostics/pipelineDebug";

import { dbgMarkCutover, dbgTimedSyncCutover } from "./chartRuntimeCutoverTelemetry";
import {
  createChartWindowRuntimeBoundary,
  createChartWindowStabilizeCaches,
  resolveChartWindowFromRenderController,
  type ChartWindowRuntimeBoundary,
  type ChartWindowStabilizeCaches,
} from "./chartWindowRuntime";
import {
  applyRenderWindowForTradeRuntime,
  createRenderWindowRuntimeController,
  initializeRenderWindowRuntime,
  offsetRenderWindowForBundlePrepend,
  type RenderWindowRuntimeController,
} from "./renderWindowRuntime";
import type { RuntimeLoadStatus } from "./runtimeTypes";
import { emitRenderWindowInputOverlayDiagnostic } from "./phase63FEmaOverlayDiagnostics";

export type Phase63BRenderWindowOwnerState = {
  controller: RenderWindowRuntimeController;
  stabilizeCaches: ChartWindowStabilizeCaches;
};

export function createPhase63BRenderWindowOwnerState(
  onCommit: (commit: WindowCommitResult) => void,
): Phase63BRenderWindowOwnerState {
  return {
    controller: createRenderWindowRuntimeController(onCommit),
    stabilizeCaches: createChartWindowStabilizeCaches(),
  };
}

export function runPhase63BRenderWindowInit(
  state: Phase63BRenderWindowOwnerState,
  input: {
    foundationKey: string | null;
    marketLoadStatus: RuntimeLoadStatus;
    bundleCandles: readonly ChartBar[];
    selectedTradeEntryTimeMs: number | null;
    variantKey: string;
  },
): boolean {
  const initialized = initializeRenderWindowRuntime(state.controller, {
    foundationKey: input.foundationKey,
    marketLoadStatus: input.marketLoadStatus,
    bundleCandles: input.bundleCandles,
    selectedTradeEntryTimeMs: input.selectedTradeEntryTimeMs,
  });
  if (initialized && input.marketLoadStatus !== "error") {
    dbgMarkCutover(DBG.load.renderWindowInit, "render_window", {
      fullLength: input.bundleCandles.length,
      variant: input.variantKey,
    });
  }
  return initialized;
}

export function runPhase63BApplyTrade(
  state: Phase63BRenderWindowOwnerState,
  input: {
    bundleCandles: readonly ChartBar[];
    selectedTradeEntryTimeMs: number | null;
    forceRebuild: boolean;
  },
): boolean {
  let rebuilt = false;
  let skipped = false;
  const didRebuild = dbgTimedSyncCutover(
    DBG.renderWindow.tradeSelect,
    "render_window",
    () => {
      const changed = applyRenderWindowForTradeRuntime(state.controller, {
        bundleCandles: input.bundleCandles,
        selectedTradeEntryTimeMs: input.selectedTradeEntryTimeMs,
        forceRebuild: input.forceRebuild,
      });
      rebuilt = changed;
      if (!input.forceRebuild && !changed && input.selectedTradeEntryTimeMs !== null) {
        skipped = true;
      }
      return changed;
    },
    () => ({ rebuilt, skipped }),
  );
  return didRebuild;
}

export function runPhase63BOffsetPrepend(
  state: Phase63BRenderWindowOwnerState,
  input: {
    bundleCandles: readonly ChartBar[];
    previousFirstTimeSec: number | null;
  },
): boolean {
  return offsetRenderWindowForBundlePrepend(state.controller, input);
}

export function resolvePhase63BChartWindowSlice(
  state: Phase63BRenderWindowOwnerState,
  input: {
    bundle: ChartMarketBundle | null;
    marketLoadStatus: RuntimeLoadStatus;
    auxEmaOverlays: readonly ChartAuxEmaOverlay[];
    marketIdentity: string | null;
  },
): ChartWindowRuntimeBoundary {
  if (input.bundle === null || input.marketLoadStatus === "error") {
    return createChartWindowRuntimeBoundary();
  }

  emitRenderWindowInputOverlayDiagnostic({
    bundleAnchorEmaCount: input.bundle.ema_overlays.length,
    bundleAuxEmaCount: input.auxEmaOverlays.length,
  });

  let barCount = 0;
  let overlayCount = 0;
  return dbgTimedSyncCutover(
    DBG.chartWindow.slice,
    "render_window",
    () => {
      const boundary = resolveChartWindowFromRenderController({
        bundle: input.bundle,
        marketLoadStatus: input.marketLoadStatus,
        renderController: state.controller,
        auxEmaOverlays: input.auxEmaOverlays,
        marketIdentity: input.marketIdentity,
        stabilizeCaches: state.stabilizeCaches,
      });
      barCount = boundary.count;
      overlayCount = boundary.parts.emaOverlays.length + boundary.parts.auxEmaOverlays.length;
      return boundary;
    },
    () => ({ barCount, overlayCount }),
  );
}

export function buildChartViewWindowFromPhase63BSlice(input: {
  chartWindow: ChartWindowRuntimeBoundary;
  selectedTradeEntryTimeMs: number | null;
}): ChartViewWindow {
  if (!input.chartWindow.implemented || input.chartWindow.count === 0) {
    return {
      mode: "empty",
      candles: [],
      emaOverlays: [],
      auxEmaOverlays: [],
      centerTimeSec: null,
      firstTimeSec: null,
      lastTimeSec: null,
      count: 0,
    };
  }

  const mode: ChartViewMode =
    input.selectedTradeEntryTimeMs !== null ? "around-trade" : "tail";
  const centerTimeSec =
    input.selectedTradeEntryTimeMs !== null
      ? Math.floor(input.selectedTradeEntryTimeMs / 1000)
      : null;

  return {
    mode,
    candles: input.chartWindow.parts.candles,
    emaOverlays: input.chartWindow.parts.emaOverlays,
    auxEmaOverlays: input.chartWindow.parts.auxEmaOverlays,
    centerTimeSec,
    firstTimeSec: input.chartWindow.firstTimeSec,
    lastTimeSec: input.chartWindow.lastTimeSec,
    count: input.chartWindow.count,
  };
}
