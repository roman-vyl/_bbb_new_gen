import type { ChartBar } from "@/api/types";
import { candleTimeBounds } from "@/features/chart/chartRenderWindowDisplay";
import type { SignalTraceDisplayCache, TimeBounds } from "@/features/chart/signalTraceDisplayCache";

/** Planning/debug identity for normalized display chunks — not a cache address key. */
export type TraceDisplayChunkKey = string;

/** Coarse normalized chunk size while `/signal-trace` remains dense (matches render window cap). */
export const TRACE_DISPLAY_CHUNK_BAR_COUNT = 50_000;

const CHUNK_KEY_SEP = "\u001e";

export type PlannedTraceDisplayChunk = {
  traceDisplayChunkKey: TraceDisplayChunkKey;
  fromSec: number;
  toSec: number;
  fromMs: number;
  toOpenTimeMs: number;
  missingRange: TimeBounds;
};

export function buildTraceDisplayChunkKey(params: {
  runId: string;
  variant: string;
  contextOverlayRef?: string | null;
  chartTimeframe: string;
  fromSec: number;
  toSec: number;
}): TraceDisplayChunkKey {
  const overlayRef = params.contextOverlayRef ?? "";
  return [
    params.runId,
    params.variant,
    overlayRef,
    params.chartTimeframe,
    String(params.fromSec),
    String(params.toSec),
  ].join(CHUNK_KEY_SEP);
}

function findFirstBarIndexAtOrAfter(candles: readonly ChartBar[], fromSec: number): number | null {
  for (let i = 0; i < candles.length; i += 1) {
    if (candles[i]!.time >= fromSec) {
      return i;
    }
  }
  return null;
}

/**
 * Plan one foreground normalized chunk for the current committed render window.
 * Returns null when display cache already covers the window (cache hit — no network).
 */
export function planMissingTraceDisplayChunkFetch(input: {
  cache: SignalTraceDisplayCache;
  candles: readonly ChartBar[];
  runId: string;
  variant: string;
  contextOverlayRef: string | null;
  chartTimeframe: string;
}): PlannedTraceDisplayChunk | null {
  const bounds = candleTimeBounds(input.candles);
  if (bounds === null) {
    return null;
  }

  if (input.cache.coversRange(bounds.fromSec, bounds.toSec)) {
    return null;
  }

  const missingRange = input.cache.missingRange(bounds.fromSec, bounds.toSec);
  if (missingRange === null) {
    return null;
  }

  const startIdx = findFirstBarIndexAtOrAfter(input.candles, missingRange.fromSec);
  if (startIdx === null) {
    return null;
  }

  const chunkEndIdx = Math.min(
    startIdx + TRACE_DISPLAY_CHUNK_BAR_COUNT - 1,
    input.candles.length - 1,
  );

  const fromSec = input.candles[startIdx]!.time;
  const toSec = input.candles[chunkEndIdx]!.time;

  return {
    traceDisplayChunkKey: buildTraceDisplayChunkKey({
      runId: input.runId,
      variant: input.variant,
      contextOverlayRef: input.contextOverlayRef,
      chartTimeframe: input.chartTimeframe,
      fromSec,
      toSec,
    }),
    fromSec,
    toSec,
    fromMs: fromSec * 1000,
    toOpenTimeMs: toSec * 1000,
    missingRange,
  };
}
