import {
  createChartDataWindowManager,
  type ChartDataWindowManager,
} from "@/features/chart/chartDataWindowManager";
import { CHART_RENDER_SAFE_ZONE } from "@/features/chart/chartViewWindow";
import type { ChartLogicalRange } from "@/features/chart/chartViewport";
import type {
  ChartInteractionEvent,
  CommittedRenderWindow,
  PendingShiftIntent,
  RenderWindowInteractionState,
  WindowCommitResult,
} from "@/features/chart/runtime/types";

export const RENDER_WINDOW_IDLE_DEBOUNCE_MS = 400;

export type RenderWindowControllerConfig = {
  idleDebounceMs?: number;
  manager?: ChartDataWindowManager;
  onCommit?: (result: WindowCommitResult) => void;
};

export type RenderWindowController = {
  reset(fullLength: number): void;
  setFullLength(fullLength: number): void;
  getInteractionState(): RenderWindowInteractionState;
  getPendingShift(): PendingShiftIntent | null;
  getCommittedRevision(): number;
  getManager(): ChartDataWindowManager;
  dispatch(event: ChartInteractionEvent): void;
  /** Evaluate safe-zone boundary; records pending intent during user pan only. */
  recordBoundaryIntent(visible: ChartLogicalRange, anchorTimeSec: number): boolean;
  /** Commit pending shift if allowed; returns commit payload or null. */
  tryCommitPendingShift(): WindowCommitResult | null;
  getApplyingShiftSeq(): number | null;
  settleWindowSwap(shiftSeq: number): void;
  abortApplyingShift(): number | null;
  flushIdleCommitTimer(): void;
  buildCommittedWindow(
    firstTimeSec: number | null,
    lastTimeSec: number | null,
  ): CommittedRenderWindow;
};

function shiftDirectionFromVisible(
  visible: ChartLogicalRange,
  manager: ChartDataWindowManager,
): PendingShiftIntent["direction"] | null {
  if (!manager.isNearWindowBoundary(visible)) {
    return null;
  }
  const windowLen = manager.getWindowLength();
  if (visible.from < CHART_RENDER_SAFE_ZONE) {
    return "left";
  }
  if (visible.to > windowLen - CHART_RENDER_SAFE_ZONE) {
    return "right";
  }
  return null;
}

export function createRenderWindowController(
  config: RenderWindowControllerConfig = {},
): RenderWindowController {
  const manager = config.manager ?? createChartDataWindowManager();
  const idleDebounceMs = config.idleDebounceMs ?? RENDER_WINDOW_IDLE_DEBOUNCE_MS;
  const onCommit = config.onCommit;

  let interactionState: RenderWindowInteractionState = "idle_user_view";
  let pendingShift: PendingShiftIntent | null = null;
  let committedRevision = 0;
  let shiftSeq = 0;
  let pointerActive = false;
  let wheelActive = false;
  let programmaticViewportActive = false;
  let applyingShiftSeq: number | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  function clearIdleTimer(): void {
    if (idleTimer !== null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  function scheduleIdleCommit(): void {
    clearIdleTimer();
    if (pendingShift === null) {
      return;
    }
    idleTimer = setTimeout(() => {
      idleTimer = null;
      if (!pointerActive) {
        tryCommitPendingShift();
      }
    }, idleDebounceMs);
  }

  function setInteractionState(next: RenderWindowInteractionState): void {
    interactionState = next;
  }

  function settleInteractionAfterSwap(): void {
    applyingShiftSeq = null;
    if (pointerActive || wheelActive) {
      setInteractionState(pendingShift ? "pending_shift" : "user_panning");
      return;
    }
    setInteractionState("idle_user_view");
  }

  function recordBoundaryIntent(visible: ChartLogicalRange, anchorTimeSec: number): boolean {
    if (programmaticViewportActive || interactionState === "applying_shift") {
      return false;
    }
    const direction = shiftDirectionFromVisible(visible, manager);
    if (direction === null) {
      return false;
    }
    if (interactionState !== "user_panning" && interactionState !== "pending_shift") {
      return false;
    }
    pendingShift = {
      direction,
      anchorTimeSec,
      visible,
      recordedAtMs: Date.now(),
    };
    setInteractionState("pending_shift");
    scheduleIdleCommit();
    return true;
  }

  function tryCommitPendingShift(): WindowCommitResult | null {
    if (pendingShift === null) {
      return null;
    }
    const intent = pendingShift;
    const boundsBefore = manager.getWindowIndices();
    const next = manager.maybeShiftWindowForVisibleRange(intent.visible);
    pendingShift = null;
    clearIdleTimer();

    if (next === null) {
      setInteractionState(pointerActive || wheelActive ? "user_panning" : "idle_user_view");
      return null;
    }

    committedRevision += 1;
    shiftSeq += 1;
    applyingShiftSeq = shiftSeq;
    setInteractionState("applying_shift");

    const result: WindowCommitResult = {
      bounds: next,
      anchorTimeSec: intent.anchorTimeSec,
      previousVisible: intent.visible,
      boundsBefore,
      shiftSeq,
    };

    onCommit?.(result);
    return result;
  }

  function abortApplyingShift(): number | null {
    const aborted = applyingShiftSeq;
    if (interactionState !== "applying_shift") {
      return aborted;
    }
    settleInteractionAfterSwap();
    return aborted;
  }

  function settleWindowSwap(shiftSeq: number): void {
    if (applyingShiftSeq !== shiftSeq) {
      return;
    }
    settleInteractionAfterSwap();
  }

  function dispatch(event: ChartInteractionEvent): void {
    switch (event.type) {
      case "pointerdown":
        abortApplyingShift();
        pointerActive = true;
        setInteractionState("user_panning");
        break;
      case "pointermove":
        if (pointerActive) {
          setInteractionState(pendingShift ? "pending_shift" : "user_panning");
        }
        break;
      case "pointerup":
        pointerActive = false;
        clearIdleTimer();
        {
          const committed = tryCommitPendingShift();
          if (
            committed === null &&
            !wheelActive &&
            pendingShift === null &&
            interactionState !== "applying_shift"
          ) {
            setInteractionState("idle_user_view");
          }
        }
        break;
      case "wheel":
        wheelActive = true;
        setInteractionState(pendingShift ? "pending_shift" : "user_panning");
        scheduleIdleCommit();
        globalThis.setTimeout(() => {
          wheelActive = false;
          if (!pointerActive && pendingShift === null) {
            setInteractionState("idle_user_view");
          } else if (!pointerActive && pendingShift !== null) {
            scheduleIdleCommit();
          }
        }, 50);
        break;
      case "programmatic_viewport_start":
        programmaticViewportActive = true;
        break;
      case "programmatic_viewport_end":
        programmaticViewportActive = false;
        break;
      case "trade_selected":
        setInteractionState("trade_focused");
        pendingShift = null;
        clearIdleTimer();
        break;
      case "visible_range_changed":
        break;
      case "resize":
        break;
      default:
        break;
    }
  }

  return {
    reset(fullLength: number) {
      manager.reset(fullLength);
      pendingShift = null;
      committedRevision = 0;
      shiftSeq = 0;
      applyingShiftSeq = null;
      clearIdleTimer();
      setInteractionState("idle_user_view");
    },
    setFullLength(fullLength: number) {
      manager.setFullLength(fullLength);
    },
    getInteractionState: () => interactionState,
    getPendingShift: () => pendingShift,
    getCommittedRevision: () => committedRevision,
    getManager: () => manager,
    dispatch,
    recordBoundaryIntent,
    tryCommitPendingShift,
    getApplyingShiftSeq: () => applyingShiftSeq,
    settleWindowSwap,
    abortApplyingShift,
    flushIdleCommitTimer: clearIdleTimer,
    buildCommittedWindow(firstTimeSec, lastTimeSec) {
      return {
        bounds: manager.getWindowIndices(),
        firstTimeSec,
        lastTimeSec,
        revision: committedRevision,
      };
    },
  };
}
