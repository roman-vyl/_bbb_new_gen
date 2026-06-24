import { canEmitTradeFocus, createViewportController } from "@/features/chart/runtime/viewportController";
import type { ViewportCommand, ViewportControllerCommand } from "@/features/chart/runtime/types";
import type { ChartViewMode } from "@/features/chart/chartViewWindow";

import type { ChartRuntimeViewportOutput } from "./runtimeTypes";

export type ViewportRuntimeState = {
  controller: ReturnType<typeof createViewportController>;
  commandSeq: number;
  lastCommand: ViewportCommand | null;
  windowSwapTransactionId: number;
  windowSwapCancelledThroughId: number;
};

export type ViewportRuntimeCandidate = {
  implemented: true;
  command: ViewportCommand | null;
  commandSeq: number;
};

export type ViewportRuntimeInactiveBoundary = {
  implemented: false;
  viewport: ChartRuntimeViewportOutput;
};

export type ViewportRuntimeBoundary = ViewportRuntimeInactiveBoundary | ViewportRuntimeCandidate;

function noop(): void {
  // Candidate-only viewport runtime: production ChartPanel wiring is intentionally absent.
}

export function createViewportRuntimeState(): ViewportRuntimeState {
  return {
    controller: createViewportController(),
    commandSeq: 0,
    lastCommand: null,
    windowSwapTransactionId: 0,
    windowSwapCancelledThroughId: 0,
  };
}

/** Mirrors WorkbenchContext emitChartViewportCommand filtering — candidate only, not production emit. */
export function filterViewportCommandCandidate(
  state: ViewportRuntimeState,
  command: ViewportControllerCommand,
): ViewportCommand | null {
  if (command.type === "noViewportChange" || command.type === "preserveUserRange") {
    return null;
  }
  if (
    command.type === "focusTrade" &&
    !canEmitTradeFocus(state.controller.getState())
  ) {
    return null;
  }
  return command as ViewportCommand;
}

export function recordViewportCommandCandidate(
  state: ViewportRuntimeState,
  command: ViewportControllerCommand,
): ViewportCommand | null {
  const filtered = filterViewportCommandCandidate(state, command);
  if (filtered === null) {
    return null;
  }
  state.commandSeq += 1;
  state.lastCommand = filtered;
  return filtered;
}

export function acknowledgeViewportCommandCandidate(state: ViewportRuntimeState): void {
  state.lastCommand = null;
}

export function isWindowSwapTransactionCancelledCandidate(
  state: ViewportRuntimeState,
  swapTransactionId: number,
): boolean {
  return swapTransactionId <= state.windowSwapCancelledThroughId;
}

export function settleWindowSwapCommitCandidate(
  state: ViewportRuntimeState,
  shiftSeq: number,
  swapTransactionId: number,
  settleRenderWindowSwap: (shiftSeq: number) => void,
): void {
  if (swapTransactionId <= state.windowSwapCancelledThroughId) {
    return;
  }
  settleRenderWindowSwap(shiftSeq);
}

export function cancelViewportCommandsOnPointerDown(state: ViewportRuntimeState): void {
  state.windowSwapCancelledThroughId = state.windowSwapTransactionId;
  state.lastCommand = null;
}

export function setViewportPlanCandidate(
  state: ViewportRuntimeState,
  mode: ChartViewMode,
  centerTimeSec: number | null,
): void {
  state.controller.setPlan(mode, centerTimeSec);
}

export function resolveViewportRuntimeCandidate(state: ViewportRuntimeState): ViewportRuntimeCandidate {
  return {
    implemented: true,
    command: state.lastCommand,
    commandSeq: state.commandSeq,
  };
}

export function createViewportRuntimeBoundary(): ViewportRuntimeInactiveBoundary {
  return {
    implemented: false,
    viewport: {
      command: null,
      commandSeq: 0,
      acknowledge: noop,
      isWindowSwapTransactionCancelled: () => false,
      settleWindowSwapCommit: noop,
    },
  };
}

/** Read-only viewport output for shadow/debug — callbacks are inert before cutover. */
export function toChartRuntimeViewportOutput(
  candidate: ViewportRuntimeCandidate | ViewportRuntimeInactiveBoundary,
): ChartRuntimeViewportOutput {
  if (!candidate.implemented) {
    return candidate.viewport;
  }
  return {
    command: candidate.command,
    commandSeq: candidate.commandSeq,
    acknowledge: noop,
    isWindowSwapTransactionCancelled: () => false,
    settleWindowSwapCommit: noop,
  };
}
