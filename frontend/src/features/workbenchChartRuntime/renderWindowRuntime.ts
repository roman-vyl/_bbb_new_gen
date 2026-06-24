import type { ChartBar } from "@/api/types";
import { createChartRuntime, type ChartRuntime } from "@/features/chart/runtime/chartRuntime";
import type { WindowBounds } from "@/features/chart/chartDataWindowManager";
import { findBarIndexAtOrBefore } from "@/features/chart/chartViewWindow";
import type { WindowCommitResult } from "@/features/chart/runtime/types";

import type { RuntimeLoadStatus } from "./runtimeTypes";

export type RenderWindowRuntimeSnapshot = {
  implemented: true;
  revision: number;
  shiftSeq: number;
  bounds: WindowBounds;
  firstTimeSec: number | null;
  lastTimeSec: number | null;
};

export type RenderWindowRuntimeInactiveSnapshot = {
  implemented: false;
  revision: number;
  shiftSeq: number;
  bounds: null;
  firstTimeSec: null;
  lastTimeSec: null;
};

export type RenderWindowRuntimeBoundary =
  | RenderWindowRuntimeInactiveSnapshot
  | RenderWindowRuntimeSnapshot;

export type RenderWindowRuntimeController = {
  chartRuntime: ChartRuntime;
  revision: number;
  shiftSeq: number;
  foundationKey: string | null;
  onCommit?: (commit: WindowCommitResult) => void;
};

export function createRenderWindowRuntimeController(
  onCommit?: (commit: WindowCommitResult) => void,
): RenderWindowRuntimeController {
  const controller: RenderWindowRuntimeController = {
    chartRuntime: createChartRuntime({
      renderWindow: {
        onCommit: (commit) => controller.onCommit?.(commit),
      },
    }),
    revision: 0,
    shiftSeq: 0,
    foundationKey: null,
    onCommit,
  };
  controller.onCommit = onCommit;
  return controller;
}

function renderWindowManager(controller: RenderWindowRuntimeController) {
  return controller.chartRuntime.renderWindow.getManager();
}

function bumpRenderWindow(controller: RenderWindowRuntimeController): void {
  controller.revision += 1;
}

/** Mirrors WorkbenchContext render-window init effect. */
export function initializeRenderWindowRuntime(
  controller: RenderWindowRuntimeController,
  input: {
    foundationKey: string | null;
    marketLoadStatus: RuntimeLoadStatus;
    bundleCandles: readonly ChartBar[];
    selectedTradeEntryTimeMs: number | null;
  },
): void {
  if (input.marketLoadStatus === "error" || input.foundationKey === null) {
    if (input.marketLoadStatus === "error") {
      controller.chartRuntime.reset();
      renderWindowManager(controller).reset(0);
      bumpRenderWindow(controller);
    }
    controller.foundationKey = null;
    return;
  }

  if (input.bundleCandles.length === 0) {
    return;
  }

  controller.foundationKey = input.foundationKey;
  const manager = renderWindowManager(controller);
  manager.reset(input.bundleCandles.length);
  if (input.selectedTradeEntryTimeMs !== null) {
    applyRenderWindowForTradeRuntime(controller, {
      bundleCandles: input.bundleCandles,
      selectedTradeEntryTimeMs: input.selectedTradeEntryTimeMs,
      forceRebuild: true,
    });
  } else {
    manager.buildTailWindow();
    bumpRenderWindow(controller);
  }
}

/** Mirrors WorkbenchContext applyRenderWindowForTrade. */
export function applyRenderWindowForTradeRuntime(
  controller: RenderWindowRuntimeController,
  input: {
    bundleCandles: readonly ChartBar[];
    selectedTradeEntryTimeMs: number | null;
    forceRebuild: boolean;
  },
): boolean {
  if (input.bundleCandles.length === 0) {
    return false;
  }

  const manager = renderWindowManager(controller);
  if (input.selectedTradeEntryTimeMs === null) {
    const changed = manager.buildTailWindow();
    if (changed !== null) {
      bumpRenderWindow(controller);
    }
    return changed !== null;
  }

  const entryIndex = findBarIndexAtOrBefore(
    input.bundleCandles,
    Math.floor(input.selectedTradeEntryTimeMs / 1000),
  );
  if (!input.forceRebuild && !manager.shouldRebuildForTrade(entryIndex)) {
    return false;
  }
  const changed = manager.buildWindowAroundIndex(entryIndex);
  if (changed !== null) {
    bumpRenderWindow(controller);
  }
  return changed !== null;
}

/** Mirrors bundle prepend offset effect when coverage expands left. */
export function offsetRenderWindowForBundlePrepend(
  controller: RenderWindowRuntimeController,
  input: {
    bundleCandles: readonly ChartBar[];
    previousFirstTimeSec: number | null;
  },
): boolean {
  if (input.bundleCandles.length === 0 || input.previousFirstTimeSec === null) {
    return false;
  }
  const firstTimeSec = input.bundleCandles[0]!.time;
  if (firstTimeSec >= input.previousFirstTimeSec) {
    return false;
  }
  const delta = findBarIndexAtOrBefore(input.bundleCandles, input.previousFirstTimeSec);
  if (delta <= 0) {
    return false;
  }
  const changed = renderWindowManager(controller).offsetWindowStart(delta);
  if (changed !== null) {
    bumpRenderWindow(controller);
  }
  return changed !== null;
}

export function applyRenderWindowShiftCommit(
  controller: RenderWindowRuntimeController,
  commit: WindowCommitResult,
): void {
  controller.shiftSeq = commit.shiftSeq;
}

export function resolveRenderWindowRuntimeSnapshot(
  controller: RenderWindowRuntimeController,
  bundleCandles: readonly ChartBar[],
): RenderWindowRuntimeBoundary {
  if (controller.foundationKey === null || bundleCandles.length === 0) {
    return {
      implemented: false,
      revision: controller.revision,
      shiftSeq: controller.shiftSeq,
      bounds: null,
      firstTimeSec: null,
      lastTimeSec: null,
    };
  }

  const manager = renderWindowManager(controller);
  manager.setFullLength(bundleCandles.length);
  const bounds = manager.getWindowIndices();
  const slice = manager.sliceCandles(bundleCandles);
  const firstTimeSec = slice.length > 0 ? slice[0]!.time : null;
  const lastTimeSec = slice.length > 0 ? slice[slice.length - 1]!.time : null;

  return {
    implemented: true,
    revision: controller.revision,
    shiftSeq: controller.shiftSeq,
    bounds,
    firstTimeSec,
    lastTimeSec,
  };
}

export function createRenderWindowRuntimeBoundary(): RenderWindowRuntimeInactiveSnapshot {
  return {
    implemented: false,
    revision: 0,
    shiftSeq: 0,
    bounds: null,
    firstTimeSec: null,
    lastTimeSec: null,
  };
}
