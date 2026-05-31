import type { ChartViewMode } from "@/features/chart/chartViewWindow";
import type { ChartLogicalRange } from "@/features/chart/chartViewport";
import type {
  ChartInteractionEvent,
  ViewportCommand,
  ViewportControllerState,
} from "@/features/chart/runtime/types";

export type ViewportController = {
  getState(): ViewportControllerState;
  setPlan(mode: ChartViewMode, centerTimeSec: number | null): void;
  dispatch(event: ChartInteractionEvent): ViewportCommand | null;
  onTraceReady(): ViewportCommand;
  onWindowSwapCommitted(params: {
    anchorTimeSec: number;
    previousVisible: ChartLogicalRange;
    tradeFocusPending: boolean;
    entryTimeSec: number | null;
    shiftSeq: number;
    windowStartIndex?: number;
    fullLength?: number;
  }): ViewportCommand;
};

export function createViewportController(initial?: Partial<ViewportControllerState>): ViewportController {
  let state: ViewportControllerState = {
    mode: initial?.mode ?? "tail",
    centerTimeSec: initial?.centerTimeSec ?? null,
    userPanning: false,
    suppressTradeFocus: false,
  };

  return {
    getState: () => state,

    setPlan(mode: ChartViewMode, centerTimeSec: number | null) {
      state = { ...state, mode, centerTimeSec };
    },

    dispatch(event: ChartInteractionEvent): ViewportCommand | null {
      switch (event.type) {
        case "pointerdown":
        case "pointermove":
          state = { ...state, userPanning: true, suppressTradeFocus: true };
          return { type: "noViewportChange" };
        case "pointerup":
        case "wheel":
          state = { ...state, userPanning: false };
          return { type: "noViewportChange" };
        case "trade_selected": {
          if (state.userPanning || state.suppressTradeFocus) {
            return { type: "noViewportChange" };
          }
          const entryTimeSec = event.entryTimeSec ?? state.centerTimeSec;
          state = {
            ...state,
            mode: "around-trade",
            centerTimeSec: entryTimeSec,
            userPanning: false,
            suppressTradeFocus: false,
          };
          return entryTimeSec !== null
            ? { type: "focusTrade", entryTimeSec }
            : { type: "noViewportChange" };
        }
        case "resize":
          if (state.mode === "around-trade" && state.centerTimeSec !== null) {
            return { type: "focusTrade", entryTimeSec: state.centerTimeSec };
          }
          return { type: "preserveUserRange" };
        case "programmatic_viewport_start":
          return { type: "noViewportChange" };
        case "programmatic_viewport_end":
          return { type: "noViewportChange" };
        default:
          return null;
      }
    },

    onTraceReady(): ViewportCommand {
      return { type: "noViewportChange" };
    },

    onWindowSwapCommitted({
      anchorTimeSec,
      previousVisible,
      tradeFocusPending,
      entryTimeSec,
      shiftSeq,
      windowStartIndex,
      fullLength,
    }): ViewportCommand {
      const restoreCmd: ViewportCommand = {
        type: "restoreAfterWindowSwap",
        anchorTimeSec,
        previousVisible,
        shiftSeq,
        windowStartIndex,
        fullLength,
      };
      if (state.userPanning || state.suppressTradeFocus) {
        return restoreCmd;
      }
      if (tradeFocusPending && entryTimeSec !== null) {
        return { type: "focusTrade", entryTimeSec };
      }
      return restoreCmd;
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
