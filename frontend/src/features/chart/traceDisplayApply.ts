import type { ComponentEvent } from "@/api/types";
import type { ChartBar } from "@/api/types";
import {
  type HtfContextTraceSlice,
  type SignalTraceDisplayCache,
} from "@/features/chart/signalTraceDisplayCache";
import { candleTimeBounds } from "@/features/chart/chartRenderWindowDisplay";

export type TraceDisplayWindowSlice = {
  fromSec: number;
  toSec: number;
  events: ComponentEvent[];
  htfSlice: HtfContextTraceSlice;
};

/** Slice display cache to current render-window candle bounds. */
export function sliceTraceDisplayForCandles(
  cache: SignalTraceDisplayCache,
  candles: readonly ChartBar[],
): TraceDisplayWindowSlice | null {
  const bounds = candleTimeBounds(candles);
  if (bounds === null) {
    return null;
  }
  const { fromSec, toSec } = bounds;
  return {
    fromSec,
    toSec,
    events: cache.sliceEventsForWindow(fromSec, toSec),
    htfSlice: cache.sliceHtfContextForWindow(fromSec, toSec),
  };
}
