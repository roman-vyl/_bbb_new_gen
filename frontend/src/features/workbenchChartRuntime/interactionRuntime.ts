import type { ChartBar } from "@/api/types";
import type { RunMarketView } from "@/features/chart/runMarketView";
import type { ChartInteractionEvent, ViewportCommand, WindowCommitResult } from "@/features/chart/runtime/types";

import { evaluatePanPrefetchCandidate } from "./panRuntime";
import type { RenderWindowRuntimeController } from "./renderWindowRuntime";
import { applyRenderWindowShiftCommit } from "./renderWindowRuntime";
import type { RuntimeMarketWindow } from "./marketWindowRuntime";
import type { ChartRuntimeInteractionOutput } from "./runtimeTypes";
import {
  cancelViewportCommandsOnPointerDown,
  createViewportRuntimeState,
  filterViewportCommandCandidate,
  recordViewportCommandCandidate,
  type ViewportRuntimeState,
} from "./viewportRuntime";

export type InteractionDispatchCandidate = {
  viewportCommand: ViewportCommand | null;
  panExpansion: RuntimeMarketWindow | null;
  panReason: string | null;
  renderWindowCommit: WindowCommitResult | null;
  suppressedProgrammatic: boolean;
};

export type InteractionRuntimeHarness = {
  renderController: RenderWindowRuntimeController;
  viewportState: ViewportRuntimeState;
  bundleCandles: ChartBar[];
  lastPanExpansionKey: string | null;
  lastVisiblePrefetchSample: string | null;
};

export type InteractionRuntimeBoundary = {
  implemented: false;
  interaction: ChartRuntimeInteractionOutput;
};

export function createInteractionRuntimeHarness(input: {
  renderController: RenderWindowRuntimeController;
  bundleCandles: ChartBar[];
}): InteractionRuntimeHarness {
  return {
    renderController: input.renderController,
    viewportState: createViewportRuntimeState(),
    bundleCandles: input.bundleCandles,
    lastPanExpansionKey: null,
    lastVisiblePrefetchSample: null,
  };
}

function renderWindowManager(harness: InteractionRuntimeHarness) {
  return harness.renderController.chartRuntime.renderWindow;
}

/** Mirrors WorkbenchContext dispatchChartInteraction — candidate only, not production owner. */
export function dispatchInteractionCandidate(
  harness: InteractionRuntimeHarness,
  event: ChartInteractionEvent,
  panContext: {
    view: RunMarketView | null;
    coverageWindow: RuntimeMarketWindow | null;
    timeframeMs: number;
    chartHeavyIoEnabled: boolean;
  },
): InteractionDispatchCandidate {
  if (event.type === "pointerdown" || event.type === "keyboard_pan_start") {
    cancelViewportCommandsOnPointerDown(harness.viewportState);
  }

  const chartRuntime = harness.renderController.chartRuntime;
  const command = chartRuntime.dispatchInteraction(event);

  let panExpansion: RuntimeMarketWindow | null = null;
  let panReason: string | null = null;
  let suppressedProgrammatic = false;

  if (event.type === "visible_range_changed" && event.anchorTimeSec !== null) {
    const interactionState = renderWindowManager(harness).getInteractionState();
    if (
      interactionState === "user_panning" ||
      interactionState === "pending_shift" ||
      interactionState === "applying_shift"
    ) {
      const candles = harness.bundleCandles;
      if (candles.length > 0) {
        const fromIdx = Math.max(
          0,
          Math.min(candles.length - 1, Math.floor(event.visible.from)),
        );
        const toIdx = Math.max(0, Math.min(candles.length - 1, Math.floor(event.visible.to)));
        const sampleKey = `${fromIdx}:${toIdx}:${candles[fromIdx]!.time}:${candles[toIdx]!.time}`;
        if (sampleKey !== harness.lastVisiblePrefetchSample) {
          harness.lastVisiblePrefetchSample = sampleKey;
          const panDecision = evaluatePanPrefetchCandidate({
            view: panContext.view,
            coverageWindow: panContext.coverageWindow,
            visibleFromSec: candles[fromIdx]!.time,
            visibleToSec: candles[toIdx]!.time,
            timeframeMs: panContext.timeframeMs,
            chartHeavyIoEnabled: panContext.chartHeavyIoEnabled,
            interactionState,
          });
          panReason = panDecision.reason;
          suppressedProgrammatic = panDecision.suppressedProgrammatic;
          if (panDecision.expansion !== null) {
            const expansionKey = `${panDecision.expansion.fromMs}:${panDecision.expansion.toMs}:${panDecision.expansion.toOpenTimeMs}`;
            if (expansionKey !== harness.lastPanExpansionKey) {
              harness.lastPanExpansionKey = expansionKey;
              panExpansion = panDecision.expansion;
            }
          }
        }
      }
    }
  }

  let viewportCommand: ViewportCommand | null = null;
  if (command !== null && command.type !== "restoreAfterWindowSwap") {
    viewportCommand = recordViewportCommandCandidate(harness.viewportState, command);
  }

  return {
    viewportCommand,
    panExpansion,
    panReason,
    renderWindowCommit: null,
    suppressedProgrammatic,
  };
}

/** Mirrors applyWindowCommit viewport restore path for harness shift commits. */
export function applyWindowSwapCommitCandidate(
  harness: InteractionRuntimeHarness,
  commit: WindowCommitResult,
  bundleCandleCount: number,
): ViewportCommand | null {
  applyRenderWindowShiftCommit(harness.renderController, commit);
  harness.viewportState.windowSwapTransactionId += 1;
  const swapTransactionId = harness.viewportState.windowSwapTransactionId;

  const viewportCmd = harness.renderController.chartRuntime.viewport.onWindowSwapCommitted({
    anchorTimeSec: commit.anchorTimeSec,
    previousVisible: commit.previousVisible,
    shiftSeq: commit.shiftSeq,
    windowStartIndex: commit.boundsBefore.windowStartIndex,
    fullLength: bundleCandleCount,
  });

  const filtered = filterViewportCommandCandidate(harness.viewportState, viewportCmd);
  if (filtered === null) {
    return null;
  }

  const withSwapId =
    filtered.type === "restoreAfterWindowSwap"
      ? { ...filtered, swapTransactionId }
      : filtered;

  harness.viewportState.commandSeq += 1;
  harness.viewportState.lastCommand = withSwapId;
  return withSwapId;
}

export function createInteractionRuntimeBoundary(): InteractionRuntimeBoundary {
  return {
    implemented: false,
    interaction: {
      dispatch() {
        // Candidate-only interaction runtime: live ChartPanel dispatch is intentionally not connected.
      },
    },
  };
}

export function toChartRuntimeInteractionOutput(
  boundary: InteractionRuntimeBoundary,
): ChartRuntimeInteractionOutput {
  return boundary.interaction;
}
