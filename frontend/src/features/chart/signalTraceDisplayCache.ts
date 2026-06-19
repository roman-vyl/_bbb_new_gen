import type {
  ComponentEvent,
  HtfContextTrace,
  SignalTraceBundle,
  SignalTraceMeta,
} from "@/api/types";

export type TraceDisplayCacheKey = string;

export type TimeBounds = {
  fromSec: number;
  toSec: number;
};

export type TraceDisplayChunk = {
  fromSec: number;
  toSec: number;
  component_events: ComponentEvent[];
  times: number[];
  htf_context: HtfContextTrace | undefined;
};

export type HtfContextTraceSlice = {
  times: number[];
  htf_context: HtfContextTrace | undefined;
};

export type SignalTraceDisplayCache = {
  reset(key: TraceDisplayCacheKey): void;
  mergeDisplayChunk(chunk: TraceDisplayChunk): void;
  setTraceMeta(meta: SignalTraceMeta): void;
  coversRange(fromSec: number, toSec: number): boolean;
  missingRange(fromSec: number, toSec: number): TimeBounds | null;
  coveredRanges(fromSec: number, toSec: number): TimeBounds[];
  sliceEventsForWindow(fromSec: number, toSec: number): ComponentEvent[];
  sliceHtfContextForWindow(fromSec: number, toSec: number): HtfContextTraceSlice;
  getTraceMeta(): SignalTraceMeta | null;
  chunkCount(): number;
};

const MAX_CHUNKS_PER_KEY = 10;

export function buildTraceDisplayCacheKey(
  runId: string,
  variant: string,
  contextOverlayRef: string | null | undefined,
): TraceDisplayCacheKey {
  return `${runId}:${variant}:${contextOverlayRef ?? ""}`;
}

export function componentEventDedupeKey(event: ComponentEvent, includeLabel = false): string {
  const base = [
    event.time,
    event.role,
    event.event_type,
    event.component_id,
    event.instance_id,
    event.side,
    event.span_id ?? "",
  ].join("\0");
  if (!includeLabel) {
    return base;
  }
  return `${base}\0${event.label}`;
}

/**
 * Time samples for chunk coverage. `bundle.times` is the canonical bar grid:
 * BFF aligns `htf_context.{fast,anchor,slow}` by index with `times` (see `htfEmaPointsFromSignalTrace`).
 * We do not infer bounds from HTF arrays alone — empty `times` means no coverage even if `htf_context` is set.
 */
export function collectTraceTimeSamples(bundle: SignalTraceBundle): number[] {
  const samples: number[] = [];
  if (bundle.times.length > 0) {
    samples.push(bundle.times[0]!, bundle.times[bundle.times.length - 1]!);
  }
  for (const event of bundle.component_events ?? []) {
    samples.push(event.time);
  }
  return samples;
}

/** Chunk bounds from actual returned trace data — never from requested fetch window. */
export function computeChunkBoundsFromResponse(
  bundle: SignalTraceBundle,
): TimeBounds | null {
  const samples = collectTraceTimeSamples(bundle);
  if (samples.length === 0) {
    return null;
  }
  return {
    fromSec: Math.min(...samples),
    toSec: Math.max(...samples),
  };
}

export function isTraceResponseTruncated(
  requested: TimeBounds,
  actual: TimeBounds | null,
): boolean {
  if (actual === null) {
    return true;
  }
  return actual.fromSec > requested.fromSec || actual.toSec < requested.toSec;
}

export function extractDisplayChunkFromResponse(
  bundle: SignalTraceBundle,
): TraceDisplayChunk | null {
  const bounds = computeChunkBoundsFromResponse(bundle);
  if (bounds === null) {
    return null;
  }
  return {
    fromSec: bounds.fromSec,
    toSec: bounds.toSec,
    component_events: bundle.component_events ?? [],
    times: [...bundle.times],
    htf_context: bundle.htf_context,
  };
}

function mergeCoverageIntervals(intervals: TimeBounds[]): TimeBounds[] {
  if (intervals.length === 0) {
    return [];
  }
  const sorted = [...intervals].sort((a, b) => a.fromSec - b.fromSec);
  const merged: TimeBounds[] = [{ ...sorted[0]! }];
  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i]!;
    const last = merged[merged.length - 1]!;
    if (current.fromSec <= last.toSec + 1) {
      last.toSec = Math.max(last.toSec, current.toSec);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

export function coversTimeRange(
  intervals: readonly TimeBounds[],
  fromSec: number,
  toSec: number,
): boolean {
  if (fromSec > toSec) {
    return true;
  }
  const merged = mergeCoverageIntervals([...intervals]);
  let cursor = fromSec;
  for (const interval of merged) {
    if (interval.toSec < cursor) {
      continue;
    }
    if (interval.fromSec > cursor) {
      return false;
    }
    cursor = Math.max(cursor, interval.toSec + 1);
    if (cursor > toSec) {
      return true;
    }
  }
  return cursor > toSec;
}

export function missingTimeRange(
  intervals: readonly TimeBounds[],
  fromSec: number,
  toSec: number,
): TimeBounds | null {
  if (fromSec > toSec) {
    return null;
  }
  if (coversTimeRange(intervals, fromSec, toSec)) {
    return null;
  }
  const merged = mergeCoverageIntervals([...intervals]);
  let cursor = fromSec;
  for (const interval of merged) {
    if (interval.toSec < cursor) {
      continue;
    }
    if (interval.fromSec > cursor) {
      return { fromSec: cursor, toSec: toSec };
    }
    cursor = Math.max(cursor, interval.toSec + 1);
    if (cursor > toSec) {
      return null;
    }
  }
  if (cursor <= toSec) {
    return { fromSec: cursor, toSec };
  }
  return null;
}

export function intersectTimeRanges(
  intervals: readonly TimeBounds[],
  fromSec: number,
  toSec: number,
): TimeBounds[] {
  if (fromSec > toSec) {
    return [];
  }
  return mergeCoverageIntervals([...intervals])
    .map((interval) => ({
      fromSec: Math.max(interval.fromSec, fromSec),
      toSec: Math.min(interval.toSec, toSec),
    }))
    .filter((interval) => interval.fromSec <= interval.toSec);
}

function dedupeComponentEvents(events: readonly ComponentEvent[]): ComponentEvent[] {
  const seen = new Set<string>();
  const out: ComponentEvent[] = [];
  for (const event of events) {
    const key = componentEventDedupeKey(event);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(event);
  }
  return out;
}

function mergeHtfSeries(
  existingTimes: readonly number[],
  existing: HtfContextTrace | undefined,
  incomingTimes: readonly number[],
  incoming: HtfContextTrace | undefined,
): { times: number[]; htf_context: HtfContextTrace | undefined } {
  if (incomingTimes.length === 0) {
    return {
      times: [...existingTimes],
      htf_context: existing,
    };
  }
  if (existingTimes.length === 0 || !existing) {
    return {
      times: [...incomingTimes],
      htf_context: incoming,
    };
  }

  const byTime = new Map<
    number,
    { state: "up" | "down" | "neutral"; fast: number | null; anchor: number | null; slow: number | null }
  >();

  for (let i = 0; i < existingTimes.length; i += 1) {
    const time = existingTimes[i]!;
    byTime.set(time, {
      state: existing.state[i] ?? "neutral",
      fast: existing.fast[i] ?? null,
      anchor: existing.anchor[i] ?? null,
      slow: existing.slow[i] ?? null,
    });
  }

  if (incoming) {
    for (let i = 0; i < incomingTimes.length; i += 1) {
      const time = incomingTimes[i]!;
      byTime.set(time, {
        state: incoming.state[i] ?? "neutral",
        fast: incoming.fast[i] ?? null,
        anchor: incoming.anchor[i] ?? null,
        slow: incoming.slow[i] ?? null,
      });
    }
  }

  const times = [...byTime.keys()].sort((a, b) => a - b);
  const htf_context: HtfContextTrace = {
    state: times.map((time) => byTime.get(time)!.state),
    fast: times.map((time) => byTime.get(time)!.fast),
    anchor: times.map((time) => byTime.get(time)!.anchor),
    slow: times.map((time) => byTime.get(time)!.slow),
    meta: incoming?.meta ?? existing.meta ?? {},
  };

  return { times, htf_context };
}

function rebuildMergedState(chunks: readonly TraceDisplayChunk[]): {
  component_events: ComponentEvent[];
  times: number[];
  htf_context: HtfContextTrace | undefined;
  coverage: TimeBounds[];
} {
  let component_events: ComponentEvent[] = [];
  let times: number[] = [];
  let htf_context: HtfContextTrace | undefined;

  for (const chunk of chunks) {
    component_events = dedupeComponentEvents([...component_events, ...chunk.component_events]);
    const merged = mergeHtfSeries(times, htf_context, chunk.times, chunk.htf_context);
    times = merged.times;
    htf_context = merged.htf_context;
  }

  return {
    component_events,
    times,
    htf_context,
    coverage: chunks.map((chunk) => ({ fromSec: chunk.fromSec, toSec: chunk.toSec })),
  };
}

export function createSignalTraceDisplayCache(): SignalTraceDisplayCache {
  let chunks: TraceDisplayChunk[] = [];
  let merged = rebuildMergedState([]);
  let traceMeta: SignalTraceMeta | null = null;

  function rebuild(): void {
    merged = rebuildMergedState(chunks);
  }

  return {
    reset(_nextKey: TraceDisplayCacheKey) {
      chunks = [];
      traceMeta = null;
      rebuild();
    },

    mergeDisplayChunk(chunk: TraceDisplayChunk) {
      chunks.push(chunk);
      if (chunks.length > MAX_CHUNKS_PER_KEY) {
        chunks = chunks.slice(chunks.length - MAX_CHUNKS_PER_KEY);
      }
      rebuild();
    },

    setTraceMeta(meta: SignalTraceMeta) {
      traceMeta = meta;
    },

    coversRange(fromSec: number, toSec: number) {
      return coversTimeRange(merged.coverage, fromSec, toSec);
    },

    missingRange(fromSec: number, toSec: number) {
      return missingTimeRange(merged.coverage, fromSec, toSec);
    },

    coveredRanges(fromSec: number, toSec: number) {
      return intersectTimeRanges(merged.coverage, fromSec, toSec);
    },

    sliceEventsForWindow(fromSec: number, toSec: number) {
      return merged.component_events.filter(
        (event) => event.time >= fromSec && event.time <= toSec,
      );
    },

    sliceHtfContextForWindow(fromSec: number, toSec: number): HtfContextTraceSlice {
      if (merged.times.length === 0 || !merged.htf_context) {
        return { times: [], htf_context: undefined };
      }

      const indices: number[] = [];
      for (let i = 0; i < merged.times.length; i += 1) {
        const time = merged.times[i]!;
        if (time >= fromSec && time <= toSec) {
          indices.push(i);
        }
      }

      if (indices.length === 0) {
        return { times: [], htf_context: undefined };
      }

      const times = indices.map((i) => merged.times[i]!);
      const htf = merged.htf_context;
      return {
        times,
        htf_context: {
          state: indices.map((i) => htf.state[i] ?? "neutral"),
          fast: indices.map((i) => htf.fast[i] ?? null),
          anchor: indices.map((i) => htf.anchor[i] ?? null),
          slow: indices.map((i) => htf.slow[i] ?? null),
          meta: htf.meta,
        },
      };
    },

    getTraceMeta() {
      return traceMeta;
    },

    chunkCount() {
      return chunks.length;
    },
  };
}

export function mergeDisplayChunkFromResponse(
  cache: SignalTraceDisplayCache,
  bundle: SignalTraceBundle,
): TraceDisplayChunk | null {
  const chunk = extractDisplayChunkFromResponse(bundle);
  if (chunk === null) {
    return null;
  }
  cache.setTraceMeta(bundle.meta);
  cache.mergeDisplayChunk(chunk);
  return chunk;
}
