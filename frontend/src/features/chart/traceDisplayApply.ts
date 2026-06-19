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

export type TraceDisplayStatus = "current" | "partial" | "stale" | "loading_missing" | "empty";

export type TraceDisplayState = TraceDisplayWindowSlice & {
  status: TraceDisplayStatus;
  coveredRanges: Array<{ fromSec: number; toSec: number }>;
  missingRange: { fromSec: number; toSec: number } | null;
};

export type PreviousTraceDisplayPresence = {
  eventCount: number;
  htfOverlayPointCount: number;
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

export function deriveTraceDisplayStateForCandles(
  cache: SignalTraceDisplayCache,
  candles: readonly ChartBar[],
  traceLoadStatus: "idle" | "loading" | "ready" | "error",
): TraceDisplayState {
  const bounds = candleTimeBounds(candles);
  if (bounds === null) {
    return {
      status: "empty",
      fromSec: 0,
      toSec: 0,
      events: [],
      htfSlice: { times: [], htf_context: undefined },
      coveredRanges: [],
      missingRange: null,
    };
  }

  const { fromSec, toSec } = bounds;
  const coveredRanges = cache.coveredRanges(fromSec, toSec);
  const missingRange = cache.missingRange(fromSec, toSec);
  const coversWindow = missingRange === null;
  const events = cache.sliceEventsForWindow(fromSec, toSec);
  const htfSlice = cache.sliceHtfContextForWindow(fromSec, toSec);
  const hasCoveredDisplay = events.length > 0 || htfSlice.times.length > 0;

  let status: TraceDisplayStatus;
  if (coversWindow) {
    status = "current";
  } else if (traceLoadStatus === "loading") {
    status = "loading_missing";
  } else if (hasCoveredDisplay || coveredRanges.length > 0) {
    status = "partial";
  } else {
    status = "stale";
  }

  return {
    status,
    fromSec,
    toSec,
    events,
    htfSlice,
    coveredRanges,
    missingRange,
  };
}

export function shouldRetainPreviousTraceDisplay(
  state: TraceDisplayState,
  previous: PreviousTraceDisplayPresence,
): boolean {
  if (state.status === "current" || state.status === "empty") {
    return false;
  }
  const hasCoveredDisplay = state.events.length > 0 || state.htfSlice.times.length > 0;
  if (hasCoveredDisplay) {
    return false;
  }
  if (state.coveredRanges.length > 0) {
    return false;
  }
  return previous.eventCount > 0 || previous.htfOverlayPointCount > 0;
}
