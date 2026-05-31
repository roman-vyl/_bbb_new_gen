import type { ChartLogicalRange } from "@/features/chart/chartViewport";
import type { ChartBar } from "@/api/types";
import { resolveAnchorTimeFromVisibleRange } from "@/features/chart/chartViewport";
import type { ChartInteractionEvent } from "@/features/chart/runtime/types";

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
