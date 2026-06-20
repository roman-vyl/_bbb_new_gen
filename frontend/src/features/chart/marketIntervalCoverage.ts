/** Half-open millisecond intervals `[fromMs, toMs)` for market resource chunk coverage. */

export type MarketTimeBoundsMs = {
  fromMs: number;
  toMs: number;
};

function mergeCoverageIntervals(intervals: MarketTimeBoundsMs[]): MarketTimeBoundsMs[] {
  if (intervals.length === 0) {
    return [];
  }
  const sorted = [...intervals].sort((a, b) => a.fromMs - b.fromMs);
  const merged: MarketTimeBoundsMs[] = [{ ...sorted[0]! }];
  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i]!;
    const last = merged[merged.length - 1]!;
    if (current.fromMs <= last.toMs) {
      last.toMs = Math.max(last.toMs, current.toMs);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

export function coversMarketRange(
  intervals: readonly MarketTimeBoundsMs[],
  fromMs: number,
  toMs: number,
): boolean {
  if (fromMs >= toMs) {
    return true;
  }
  const merged = mergeCoverageIntervals([...intervals]);
  let cursor = fromMs;
  for (const interval of merged) {
    if (interval.toMs <= cursor) {
      continue;
    }
    if (interval.fromMs > cursor) {
      return false;
    }
    cursor = Math.max(cursor, interval.toMs);
    if (cursor >= toMs) {
      return true;
    }
  }
  return cursor >= toMs;
}

export function missingMarketRange(
  intervals: readonly MarketTimeBoundsMs[],
  fromMs: number,
  toMs: number,
): MarketTimeBoundsMs | null {
  if (fromMs >= toMs) {
    return null;
  }
  if (coversMarketRange(intervals, fromMs, toMs)) {
    return null;
  }
  const merged = mergeCoverageIntervals([...intervals]);
  let cursor = fromMs;
  for (const interval of merged) {
    if (interval.toMs <= cursor) {
      continue;
    }
    if (interval.fromMs > cursor) {
      return { fromMs: cursor, toMs: Math.min(toMs, interval.fromMs) };
    }
    cursor = Math.max(cursor, interval.toMs);
    if (cursor >= toMs) {
      return null;
    }
  }
  if (cursor < toMs) {
    return { fromMs: cursor, toMs };
  }
  return null;
}

export function intersectMarketRanges(
  intervals: readonly MarketTimeBoundsMs[],
  fromMs: number,
  toMs: number,
): MarketTimeBoundsMs[] {
  if (fromMs >= toMs) {
    return [];
  }
  return mergeCoverageIntervals([...intervals])
    .map((interval) => ({
      fromMs: Math.max(interval.fromMs, fromMs),
      toMs: Math.min(interval.toMs, toMs),
    }))
    .filter((interval) => interval.fromMs < interval.toMs);
}
