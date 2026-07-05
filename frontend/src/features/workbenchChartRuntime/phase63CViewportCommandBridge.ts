import type { ChartViewMode } from "@/features/chart/chartViewWindow";
import type {
  ChartInteractionEvent,
  ViewportCommand,
  ViewportControllerCommand,
  WindowCommitResult,
} from "@/features/chart/runtime/types";
import { canEmitTradeFocus } from "@/features/chart/runtime/viewportController";
import { PIPELINE_DEBUG_STEPS as DBG, dbgMark } from "@/shared/diagnostics/pipelineDebug";

import { dbgMarkCutover } from "./chartRuntimeCutoverTelemetry";
import type { Phase63BRenderWindowOwnerState } from "./phase63BRenderWindowBridge";
import {
  acknowledgeViewportCommandCandidate,
  cancelViewportCommandsOnPointerDown,
  createViewportRuntimeState,
  filterViewportCommandCandidate,
  isWindowSwapTransactionCancelledCandidate,
  recordViewportCommandCandidate,
  settleWindowSwapCommitCandidate,
  setViewportPlanCandidate,
  type ViewportRuntimeState,
} from "./viewportRuntime";

export const PHASE_63C_VIEWPORT_EMIT_STEP = "wb.viewport.command_emit";
export const PHASE_63C_VIEWPORT_ACK_STEP = "wb.viewport.command_ack";
export const PHASE_63C_VIEWPORT_CANCEL_STEP = "wb.viewport.command_cancel";
export const PHASE_63C_VIEWPORT_SETTLE_STEP = "wb.viewport.command_settle";
export const PHASE_63C_VIEWPORT_DUPLICATE_SKIP_STEP = "wb.viewport.duplicate_skipped";

export type Phase63CViewportOwnerState = {
  viewportState: ViewportRuntimeState;
};

export function createPhase63CViewportOwnerState(
  renderWindowOwner: Phase63BRenderWindowOwnerState,
): Phase63CViewportOwnerState {
  const viewportState = createViewportRuntimeState();
  viewportState.controller = renderWindowOwner.controller.chartRuntime.viewport;
  return { viewportState };
}

function v2ViewportController(renderWindowOwner: Phase63BRenderWindowOwnerState) {
  return renderWindowOwner.controller.chartRuntime.viewport;
}

export function runPhase63CSetViewportPlan(
  state: Phase63CViewportOwnerState,
  mode: ChartViewMode,
  centerTimeSec: number | null,
): void {
  setViewportPlanCandidate(state.viewportState, mode, centerTimeSec);
}

export function runPhase63CRecordViewportCommand(
  state: Phase63CViewportOwnerState,
  command: ViewportControllerCommand | null,
  options?: { emitSource?: string; selectedTradeId?: string | number | null },
): ViewportCommand | null {
  if (command === null) {
    return null;
  }

  const filtered = filterViewportCommandCandidate(state.viewportState, command);
  if (filtered === null) {
    if (
      command.type === "focusTrade" &&
      !canEmitTradeFocus(state.viewportState.controller.getState())
    ) {
      const viewportState = state.viewportState.controller.getState();
      dbgMarkCutover(DBG.chart.viewportApplySkippedNoFocusIntent, "viewport", {
        mode: viewportState.mode,
        viewportOwner: viewportState.viewportOwner,
        activeFocusIntent: viewportState.activeFocusIntent,
        emitSource: options?.emitSource ?? null,
        selectedTradeId: options?.selectedTradeId ?? null,
      });
    }
    return null;
  }

  const recorded = recordViewportCommandCandidate(state.viewportState, command);
  if (recorded === null) {
    dbgMarkCutover(PHASE_63C_VIEWPORT_DUPLICATE_SKIP_STEP, "viewport", {
      commandType: filtered.type,
      emitSource: options?.emitSource ?? null,
    });
    return null;
  }

  dbgMarkCutover(PHASE_63C_VIEWPORT_EMIT_STEP, "viewport", {
    commandType: recorded.type,
    commandSeq: state.viewportState.commandSeq,
    emitSource: options?.emitSource ?? null,
  });

  if (recorded.type === "focusTrade") {
    const viewportState = state.viewportState.controller.getState();
    dbgMarkCutover(DBG.chart.viewportApplyTradeFocus, "viewport", {
      entryTimeSec: recorded.entryTimeSec,
      commandSeq: state.viewportState.commandSeq,
      emitSource: options?.emitSource ?? null,
    });
    dbgMark(DBG.keyboard.focusTradeEmitDecision, {
      commandType: "focusTrade",
      entryTimeSec: recorded.entryTimeSec,
      viewportOwner: viewportState.viewportOwner,
      activeFocusIntent: viewportState.activeFocusIntent,
      userPanning: viewportState.userPanning,
      selectedTradeId: options?.selectedTradeId ?? null,
      emitSource: options?.emitSource ?? null,
      allowed: true,
    });
  }
  if (recorded.type === "restoreAfterWindowSwap") {
    dbgMarkCutover(DBG.chart.viewportRestoreAfterShift, "viewport", {
      shiftSeq: recorded.shiftSeq,
      swapTransactionId: recorded.swapTransactionId,
    });
  }

  return recorded;
}

export function runPhase63CAcknowledgeViewportCommand(state: Phase63CViewportOwnerState): void {
  acknowledgeViewportCommandCandidate(state.viewportState);
  dbgMarkCutover(PHASE_63C_VIEWPORT_ACK_STEP, "viewport", {
    commandSeq: state.viewportState.commandSeq,
  });
}

export function runPhase63CCancelViewportOnPointerDown(
  state: Phase63CViewportOwnerState,
  options?: { trigger?: string },
): void {
  cancelViewportCommandsOnPointerDown(state.viewportState);
  dbgMarkCutover(PHASE_63C_VIEWPORT_CANCEL_STEP, "viewport", {
    cancelledThroughId: state.viewportState.windowSwapCancelledThroughId,
    trigger: options?.trigger ?? "pointerdown",
  });
}

export function runPhase63CDispatchViewportInteraction(
  state: Phase63CViewportOwnerState,
  renderWindowOwner: Phase63BRenderWindowOwnerState,
  event: ChartInteractionEvent,
): ViewportCommand | null {
  const command = v2ViewportController(renderWindowOwner).dispatch(event);
  if (command === null || command.type === "restoreAfterWindowSwap") {
    return null;
  }
  return runPhase63CRecordViewportCommand(state, command);
}

export function runPhase63COnWindowSwapCommitted(
  state: Phase63CViewportOwnerState,
  renderWindowOwner: Phase63BRenderWindowOwnerState,
  input: {
    commit: WindowCommitResult;
    bundleCandleCount: number;
  },
): ViewportCommand | null {
  state.viewportState.windowSwapTransactionId += 1;
  const swapTransactionId = state.viewportState.windowSwapTransactionId;

  const viewportCmd = v2ViewportController(renderWindowOwner).onWindowSwapCommitted({
    anchorTimeSec: input.commit.anchorTimeSec,
    previousVisible: input.commit.previousVisible,
    shiftSeq: input.commit.shiftSeq,
    windowStartIndex: input.commit.boundsBefore.windowStartIndex,
    fullLength: input.bundleCandleCount,
  });

  const filtered = filterViewportCommandCandidate(state.viewportState, viewportCmd);
  if (filtered === null) {
    return null;
  }

  const withSwapId =
    filtered.type === "restoreAfterWindowSwap"
      ? { ...filtered, swapTransactionId }
      : filtered;

  const recorded = recordViewportCommandCandidate(state.viewportState, withSwapId);
  if (recorded === null) {
    dbgMarkCutover(PHASE_63C_VIEWPORT_DUPLICATE_SKIP_STEP, "viewport", {
      commandType: withSwapId.type,
      shiftSeq: input.commit.shiftSeq,
    });
    return null;
  }

  dbgMarkCutover(PHASE_63C_VIEWPORT_EMIT_STEP, "viewport", {
    commandType: recorded.type,
    commandSeq: state.viewportState.commandSeq,
    shiftSeq: input.commit.shiftSeq,
  });
  if (recorded.type === "restoreAfterWindowSwap") {
    dbgMarkCutover(DBG.chart.viewportRestoreAfterShift, "viewport", {
      shiftSeq: recorded.shiftSeq,
      swapTransactionId: recorded.swapTransactionId,
    });
  }
  return recorded;
}

export function runPhase63COnTraceReady(
  state: Phase63CViewportOwnerState,
  renderWindowOwner: Phase63BRenderWindowOwnerState,
  options?: { selectedTradeId?: string | number | null },
): ViewportCommand | null {
  const traceViewportCmd = v2ViewportController(renderWindowOwner).onTraceReady();
  if (
    traceViewportCmd.type === "noViewportChange" ||
    traceViewportCmd.type === "restoreAfterWindowSwap"
  ) {
    return null;
  }
  return runPhase63CRecordViewportCommand(state, traceViewportCmd, {
    emitSource: "onTraceReady",
    selectedTradeId: options?.selectedTradeId ?? null,
  });
}

export function runPhase63CSelectTradeFocusCommand(
  state: Phase63CViewportOwnerState,
  renderWindowOwner: Phase63BRenderWindowOwnerState,
  entryTimeSec: number,
  options?: { selectedTradeId?: string | number | null },
): ViewportCommand | null {
  runPhase63CSetViewportPlan(state, "around-trade", entryTimeSec);
  const command = v2ViewportController(renderWindowOwner).dispatch({
    type: "trade_selected",
    entryTimeSec,
  });
  return runPhase63CRecordViewportCommand(state, command, {
    emitSource: "selectTrade",
    selectedTradeId: options?.selectedTradeId ?? null,
  });
}

export function runPhase63CIsWindowSwapTransactionCancelled(
  state: Phase63CViewportOwnerState,
  swapTransactionId: number,
): boolean {
  return isWindowSwapTransactionCancelledCandidate(state.viewportState, swapTransactionId);
}

export function runPhase63CSettleWindowSwapCommit(
  state: Phase63CViewportOwnerState,
  renderWindowOwner: Phase63BRenderWindowOwnerState,
  shiftSeq: number,
  swapTransactionId: number,
): void {
  if (isWindowSwapTransactionCancelledCandidate(state.viewportState, swapTransactionId)) {
    dbgMarkCutover(PHASE_63C_VIEWPORT_CANCEL_STEP, "viewport", { shiftSeq, swapTransactionId });
    return;
  }
  settleWindowSwapCommitCandidate(
    state.viewportState,
    shiftSeq,
    swapTransactionId,
    (seq) => renderWindowOwner.controller.chartRuntime.renderWindow.settleWindowSwap(seq),
  );
  dbgMarkCutover(PHASE_63C_VIEWPORT_SETTLE_STEP, "viewport", { shiftSeq, swapTransactionId });
}

export function resolvePhase63CViewportCommandSeq(state: Phase63CViewportOwnerState): number {
  return state.viewportState.commandSeq;
}
