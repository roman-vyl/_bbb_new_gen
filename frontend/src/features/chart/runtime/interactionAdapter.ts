import type { ChartLogicalRange } from "@/features/chart/chartViewport";
import type { ChartBar } from "@/api/types";
import { resolveAnchorTimeFromVisibleRange } from "@/features/chart/chartViewport";
import type {
  ChartInteractionEvent,
  ChartNavigationKey,
} from "@/features/chart/runtime/types";

const CHART_NAVIGATION_KEYS: readonly ChartNavigationKey[] = [
  "ArrowLeft",
  "ArrowRight",
  "PageUp",
  "PageDown",
  "Home",
  "End",
];

export function isChartNavigationKey(key: string): key is ChartNavigationKey {
  return (CHART_NAVIGATION_KEYS as readonly string[]).includes(key);
}

export type ChartInteractionDispatch = (event: ChartInteractionEvent) => void;

export type ChartInteractionAdapterOptions = {
  dispatch: ChartInteractionDispatch;
  getCandles: () => readonly ChartBar[];
  shouldSuppressRangeEvent: () => boolean;
};

export type ChartInteractionAdapter = {
  onPointerDown: () => void;
  onPointerUp: () => void;
  onWheel: () => void;
  onKeyboardPanStart: (key: ChartNavigationKey) => void;
  onProgrammaticViewportStart: () => void;
  onProgrammaticViewportEnd: () => void;
  onVisibleLogicalRangeChange: (visible: ChartLogicalRange | null) => void;
  dispose: () => void;
};

export function createChartInteractionAdapter(
  options: ChartInteractionAdapterOptions,
): ChartInteractionAdapter {
  const { dispatch, getCandles, shouldSuppressRangeEvent } = options;

  return {
    onPointerDown() {
      dispatch({ type: "pointerdown" });
    },
    onPointerUp() {
      dispatch({ type: "pointerup" });
    },
    onWheel() {
      dispatch({ type: "wheel" });
    },
    onKeyboardPanStart(key) {
      dispatch({ type: "keyboard_pan_start", key });
    },
    onProgrammaticViewportStart() {
      dispatch({ type: "programmatic_viewport_start" });
    },
    onProgrammaticViewportEnd() {
      dispatch({ type: "programmatic_viewport_end" });
    },
    onVisibleLogicalRangeChange(visible) {
      if (!visible || shouldSuppressRangeEvent()) {
        return;
      }
      const candles = getCandles();
      const anchorTimeSec = resolveAnchorTimeFromVisibleRange(visible, candles);
      dispatch({
        type: "visible_range_changed",
        visible,
        anchorTimeSec,
      });
    },
    dispose() {},
  };
}
