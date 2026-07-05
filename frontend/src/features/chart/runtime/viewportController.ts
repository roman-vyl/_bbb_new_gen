import type { ChartViewMode } from "@/features/chart/chartViewWindow";
import type { ChartLogicalRange } from "@/features/chart/chartViewport";
import type {
  ChartInteractionEvent,
  ViewportControllerCommand,
  ViewportControllerState,
} from "@/features/chart/runtime/types";
import { dbgMark, PIPELINE_DEBUG_STEPS as DBG } from "@/shared/diagnostics/pipelineDebug";

export type ViewportController = {
  getState(): ViewportControllerState;
  setPlan(mode: ChartViewMode, centerTimeSec: number | null): void;
  dispatch(event: ChartInteractionEvent): ViewportControllerCommand | null;
  onTraceReady(): ViewportControllerCommand;
  onWindowSwapCommitted(params: {
    anchorTimeSec: number;
    previousVisible: ChartLogicalRange;
    shiftSeq: number;
    windowStartIndex?: number;
    fullLength?: number;
  }): ViewportControllerCommand;
};

function userPanSessionStart(state: ViewportControllerState): ViewportControllerState {
  return {
    ...state,
    userPanning: true,
    activeFocusIntent: null,
    viewportOwner: "user",
  };
}

export function canEmitTradeFocus(state: ViewportControllerState): boolean {
  return state.activeFocusIntent === "trade" && state.viewportOwner === "trade";
}

export function createViewportController(initial?: Partial<ViewportControllerState>): ViewportController {
  let state: ViewportControllerState = {
    mode: initial?.mode ?? "tail",
    centerTimeSec: initial?.centerTimeSec ?? null,
    userPanning: false,
    activeFocusIntent: initial?.activeFocusIntent ?? null,
    viewportOwner: initial?.viewportOwner ?? "user",
  };

  return {
    getState: () => state,

    setPlan(mode: ChartViewMode, centerTimeSec: number | null) {
      state = { ...state, mode, centerTimeSec };
    },

    dispatch(event: ChartInteractionEvent): ViewportControllerCommand | null {
      switch (event.type) {
        case "pointerdown":
        case "pointermove":
          state = userPanSessionStart(state);
          return { type: "noViewportChange" };
        case "pointerup":
          state = { ...state, userPanning: false };
          return { type: "noViewportChange" };
        case "wheel":
          state = { ...state, userPanning: false, activeFocusIntent: null, viewportOwner: "user" };
          return { type: "noViewportChange" };
        case "keyboard_pan_start": {
          const previousViewportOwner = state.viewportOwner;
          const previousActiveFocusIntent = state.activeFocusIntent;
          state = userPanSessionStart(state);
          dbgMark(DBG.keyboard.viewportPanStart, {
            previousViewportOwner,
            previousActiveFocusIntent,
            nextViewportOwner: state.viewportOwner,
            nextActiveFocusIntent: state.activeFocusIntent,
          });
          return { type: "noViewportChange" };
        }
        case "trade_selected": {
          if (state.userPanning) {
            return { type: "noViewportChange" };
          }
          const entryTimeSec = event.entryTimeSec ?? state.centerTimeSec;
          if (entryTimeSec === null) {
            state = {
              ...state,
              activeFocusIntent: null,
              viewportOwner: "user",
            };
            return { type: "noViewportChange" };
          }
          state = {
            ...state,
            mode: "around-trade",
            centerTimeSec: entryTimeSec,
            userPanning: false,
            activeFocusIntent: "trade",
            viewportOwner: "trade",
          };
          return { type: "focusTrade", entryTimeSec };
        }
        case "resize":
          return { type: "preserveUserRange" };
        case "programmatic_viewport_start":
          return { type: "noViewportChange" };
        case "programmatic_viewport_end":
          return { type: "noViewportChange" };
        default:
          return null;
      }
    },

    onTraceReady(): ViewportControllerCommand {
      if (canEmitTradeFocus(state) && state.centerTimeSec !== null) {
        return { type: "focusTrade", entryTimeSec: state.centerTimeSec };
      }
      return { type: "noViewportChange" };
    },

    onWindowSwapCommitted({
      anchorTimeSec,
      previousVisible,
      shiftSeq,
      windowStartIndex,
      fullLength,
    }): ViewportControllerCommand {
      return {
        type: "restoreAfterWindowSwap",
        anchorTimeSec,
        previousVisible,
        shiftSeq,
        windowStartIndex,
        fullLength,
      };
    },
  };
}

export function shouldApplyTradeFocus(params: {
  userPanning: boolean;
  tradeFocusIntentChanged: boolean;
}): boolean {
  if (params.userPanning) {
    return false;
  }
  return params.tradeFocusIntentChanged;
}

export function setViewportPlanMode(
  state: ViewportControllerState,
  mode: ChartViewMode,
  centerTimeSec: number | null,
): ViewportControllerState {
  return { ...state, mode, centerTimeSec };
}
