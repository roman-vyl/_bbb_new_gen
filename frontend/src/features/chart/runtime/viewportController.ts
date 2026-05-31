import type { ChartViewMode } from "@/features/chart/chartViewWindow";
import type { ChartLogicalRange } from "@/features/chart/chartViewport";
import type {
  ChartInteractionEvent,
  ViewportCommand,
  ViewportControllerState,
} from "@/features/chart/runtime/types";

export type ViewportController = {
  getState(): ViewportControllerState;
  dispatch(event: ChartInteractionEvent): ViewportCommand | null;
  onTraceReady(): ViewportCommand;
  onWindowSwapCommitted(params: {
    anchorTimeSec: number;
    previousVisible: ChartLogicalRange;
    tradeFocusPending: boolean;
    entryTimeSec: number | null;
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
        case "trade_selected":
          if (state.userPanning || state.suppressTradeFocus) {
            return { type: "noViewportChange" };
          }
          state = {
            ...state,
            mode: "around-trade",
            userPanning: false,
            suppressTradeFocus: false,
          };
          return state.centerTimeSec !== null
            ? { type: "focusTrade", entryTimeSec: state.centerTimeSec }
            : { type: "noViewportChange" };
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
    }): ViewportCommand {
      if (state.userPanning || state.suppressTradeFocus) {
        return {
          type: "restoreAfterWindowSwap",
          anchorTimeSec,
          previousVisible,
        };
      }
      if (tradeFocusPending && entryTimeSec !== null) {
        return { type: "focusTrade", entryTimeSec };
      }
      return {
        type: "restoreAfterWindowSwap",
        anchorTimeSec,
        previousVisible,
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
