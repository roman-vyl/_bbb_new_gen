import type {
  ChartBar,
  ChartEmaOverlay,
  CandlesWindowBundle,
  EmaWindowBundle,
  IndicatorPoint,
} from "@/api/types";
import {
  coversMarketRange,
  intersectMarketRanges,
  missingMarketRange,
  type MarketTimeBoundsMs,
} from "@/features/chart/marketIntervalCoverage";

export type CandlesCacheKey = string;
export type OverlayCacheKey = string;

export type { MarketTimeBoundsMs };

const CANDLES_KEY_SEP = "\u001e";
const OVERLAY_KEY_SEP = "\u001e";
const MAX_CHUNKS_PER_KEY = 10;

export type MarketCandlesChunk = {
  fromMs: number;
  toMs: number;
  candles: ChartBar[];
};

export type MarketOverlayChunk = {
  fromMs: number;
  toMs: number;
  points: IndicatorPoint[];
};

export type MarketCandlesCacheStore = {
  reset(): void;
  mergeChunk(chunk: MarketCandlesChunk): void;
  coversRange(fromMs: number, toMs: number): boolean;
  missingRange(fromMs: number, toMs: number): MarketTimeBoundsMs | null;
  coveredRanges(fromMs: number, toMs: number): MarketTimeBoundsMs[];
  sliceForRange(fromMs: number, toMs: number): ChartBar[];
  chunkCount(): number;
};

export type MarketOverlayCacheStore = {
  reset(): void;
  mergeChunk(chunk: MarketOverlayChunk): void;
  coversRange(fromMs: number, toMs: number): boolean;
  missingRange(fromMs: number, toMs: number): MarketTimeBoundsMs | null;
  coveredRanges(fromMs: number, toMs: number): MarketTimeBoundsMs[];
  sliceForRange(fromMs: number, toMs: number): IndicatorPoint[];
  chunkCount(): number;
};

const candlesStores = new Map<CandlesCacheKey, MarketCandlesCacheStore>();
const overlayStores = new Map<OverlayCacheKey, MarketOverlayCacheStore>();

export function buildCandlesCacheKey(params: {
  symbol: string;
  timeframe: string;
  reloadToken: number;
}): CandlesCacheKey {
  return [params.symbol, params.timeframe, String(params.reloadToken)].join(CANDLES_KEY_SEP);
}

export type OverlaySource = "anchor_stack";

export function buildOverlayCacheKey(params: {
  symbol: string;
  timeframe: string;
  source: OverlaySource;
  role: ChartEmaOverlay["role"];
  period: number;
  reloadToken: number;
}): OverlayCacheKey {
  return [
    params.symbol,
    params.timeframe,
    params.source,
    params.role,
    String(params.period),
    String(params.reloadToken),
  ].join(OVERLAY_KEY_SEP);
}

function dedupeCandlesByTime(candles: readonly ChartBar[]): ChartBar[] {
  const byTime = new Map<number, ChartBar>();
  for (const bar of candles) {
    byTime.set(bar.time, bar);
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

function dedupePointsByTime(points: readonly IndicatorPoint[]): IndicatorPoint[] {
  const byTime = new Map<number, IndicatorPoint>();
  for (const point of points) {
    byTime.set(point.time, point);
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

function inferBarStepMs(candles: readonly ChartBar[]): number {
  if (candles.length >= 2) {
    return (candles[1]!.time - candles[0]!.time) * 1000;
  }
  return 300_000;
}

export function chunkBoundsFromCandles(candles: readonly ChartBar[]): MarketTimeBoundsMs | null {
  if (candles.length === 0) {
    return null;
  }
  const stepMs = inferBarStepMs(candles);
  return {
    fromMs: candles[0]!.time * 1000,
    toMs: candles[candles.length - 1]!.time * 1000 + stepMs,
  };
}

export function chunkBoundsFromPoints(points: readonly IndicatorPoint[]): MarketTimeBoundsMs | null {
  if (points.length === 0) {
    return null;
  }
  const stepMs =
    points.length >= 2 ? (points[1]!.time - points[0]!.time) * 1000 : 300_000;
  return {
    fromMs: points[0]!.time * 1000,
    toMs: points[points.length - 1]!.time * 1000 + stepMs,
  };
}

export function chunkBoundsFromCandlesCoverage(
  coverage: CandlesWindowBundle["coverage"],
): MarketTimeBoundsMs {
  return {
    fromMs: coverage.actual_from_ms,
    toMs: coverage.actual_to_ms,
  };
}

export function chunkBoundsFromEmaCoverage(
  coverage: EmaWindowBundle["coverage"],
): MarketTimeBoundsMs {
  return {
    fromMs: coverage.actual_from_ms,
    toMs: coverage.actual_to_ms,
  };
}

function coalesceCandlesChunks(chunks: MarketCandlesChunk[]): MarketCandlesChunk[] {
  if (chunks.length <= 1) {
    return chunks;
  }
  const sorted = [...chunks].sort((a, b) => a.fromMs - b.fromMs);
  const result: MarketCandlesChunk[] = [{ ...sorted[0]!, candles: [...sorted[0]!.candles] }];
  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i]!;
    const last = result[result.length - 1]!;
    if (current.fromMs <= last.toMs) {
      last.toMs = Math.max(last.toMs, current.toMs);
      last.candles = dedupeCandlesByTime([...last.candles, ...current.candles]);
    } else {
      result.push({ ...current, candles: [...current.candles] });
    }
  }
  return result;
}

function coalesceOverlayChunks(chunks: MarketOverlayChunk[]): MarketOverlayChunk[] {
  if (chunks.length <= 1) {
    return chunks;
  }
  const sorted = [...chunks].sort((a, b) => a.fromMs - b.fromMs);
  const result: MarketOverlayChunk[] = [{ ...sorted[0]!, points: [...sorted[0]!.points] }];
  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i]!;
    const last = result[result.length - 1]!;
    if (current.fromMs <= last.toMs) {
      last.toMs = Math.max(last.toMs, current.toMs);
      last.points = dedupePointsByTime([...last.points, ...current.points]);
    } else {
      result.push({ ...current, points: [...current.points] });
    }
  }
  return result;
}

function rebuildCandlesMerged(chunks: readonly MarketCandlesChunk[]): {
  candles: ChartBar[];
  coverage: MarketTimeBoundsMs[];
} {
  let candles: ChartBar[] = [];
  for (const chunk of chunks) {
    candles = dedupeCandlesByTime([...candles, ...chunk.candles]);
  }
  return {
    candles,
    coverage: chunks.map((chunk) => ({ fromMs: chunk.fromMs, toMs: chunk.toMs })),
  };
}

function rebuildOverlayMerged(chunks: readonly MarketOverlayChunk[]): {
  points: IndicatorPoint[];
  coverage: MarketTimeBoundsMs[];
} {
  let points: IndicatorPoint[] = [];
  for (const chunk of chunks) {
    points = dedupePointsByTime([...points, ...chunk.points]);
  }
  return {
    points,
    coverage: chunks.map((chunk) => ({ fromMs: chunk.fromMs, toMs: chunk.toMs })),
  };
}

function sliceCandlesForRange(
  candles: readonly ChartBar[],
  fromMs: number,
  toMs: number,
): ChartBar[] {
  return candles.filter((bar) => {
    const openMs = bar.time * 1000;
    return openMs >= fromMs && openMs < toMs;
  });
}

function slicePointsForRange(
  points: readonly IndicatorPoint[],
  fromMs: number,
  toMs: number,
): IndicatorPoint[] {
  return points.filter((point) => {
    const openMs = point.time * 1000;
    return openMs >= fromMs && openMs < toMs;
  });
}

export function createMarketCandlesCacheStore(): MarketCandlesCacheStore {
  let chunks: MarketCandlesChunk[] = [];
  let merged = rebuildCandlesMerged([]);

  function rebuild(): void {
    merged = rebuildCandlesMerged(chunks);
  }

  return {
    reset() {
      chunks = [];
      rebuild();
    },

    mergeChunk(chunk: MarketCandlesChunk) {
      chunks = coalesceCandlesChunks([...chunks, chunk]);
      if (chunks.length > MAX_CHUNKS_PER_KEY) {
        chunks = chunks.slice(chunks.length - MAX_CHUNKS_PER_KEY);
      }
      rebuild();
    },

    coversRange(fromMs: number, toMs: number) {
      return coversMarketRange(merged.coverage, fromMs, toMs);
    },

    missingRange(fromMs: number, toMs: number) {
      return missingMarketRange(merged.coverage, fromMs, toMs);
    },

    coveredRanges(fromMs: number, toMs: number) {
      return intersectMarketRanges(merged.coverage, fromMs, toMs);
    },

    sliceForRange(fromMs: number, toMs: number) {
      return sliceCandlesForRange(merged.candles, fromMs, toMs);
    },

    chunkCount() {
      return chunks.length;
    },
  };
}

export function createMarketOverlayCacheStore(): MarketOverlayCacheStore {
  let chunks: MarketOverlayChunk[] = [];
  let merged = rebuildOverlayMerged([]);

  function rebuild(): void {
    merged = rebuildOverlayMerged(chunks);
  }

  return {
    reset() {
      chunks = [];
      rebuild();
    },

    mergeChunk(chunk: MarketOverlayChunk) {
      chunks = coalesceOverlayChunks([...chunks, chunk]);
      if (chunks.length > MAX_CHUNKS_PER_KEY) {
        chunks = chunks.slice(chunks.length - MAX_CHUNKS_PER_KEY);
      }
      rebuild();
    },

    coversRange(fromMs: number, toMs: number) {
      return coversMarketRange(merged.coverage, fromMs, toMs);
    },

    missingRange(fromMs: number, toMs: number) {
      return missingMarketRange(merged.coverage, fromMs, toMs);
    },

    coveredRanges(fromMs: number, toMs: number) {
      return intersectMarketRanges(merged.coverage, fromMs, toMs);
    },

    sliceForRange(fromMs: number, toMs: number) {
      return slicePointsForRange(merged.points, fromMs, toMs);
    },

    chunkCount() {
      return chunks.length;
    },
  };
}

function getOrCreateCandlesStore(key: CandlesCacheKey): MarketCandlesCacheStore {
  let store = candlesStores.get(key);
  if (store === undefined) {
    store = createMarketCandlesCacheStore();
    candlesStores.set(key, store);
  }
  return store;
}

function getOrCreateOverlayStore(key: OverlayCacheKey): MarketOverlayCacheStore {
  let store = overlayStores.get(key);
  if (store === undefined) {
    store = createMarketOverlayCacheStore();
    overlayStores.set(key, store);
  }
  return store;
}

export function getMarketCandlesCache(key: CandlesCacheKey): MarketCandlesCacheStore {
  return getOrCreateCandlesStore(key);
}

export function getMarketOverlayCache(key: OverlayCacheKey): MarketOverlayCacheStore {
  return getOrCreateOverlayStore(key);
}

export function mergeCandlesChunk(key: CandlesCacheKey, chunk: MarketCandlesChunk): void {
  getOrCreateCandlesStore(key).mergeChunk(chunk);
}

export function mergeOverlayChunk(key: OverlayCacheKey, chunk: MarketOverlayChunk): void {
  getOrCreateOverlayStore(key).mergeChunk(chunk);
}

export function mergeCandlesWindowBundle(key: CandlesCacheKey, bundle: CandlesWindowBundle): void {
  const bounds = chunkBoundsFromCandlesCoverage(bundle.coverage);
  mergeCandlesChunk(key, {
    fromMs: bounds.fromMs,
    toMs: bounds.toMs,
    candles: bundle.candles,
  });
}

export function mergeEmaWindowBundle(
  key: OverlayCacheKey,
  bundle: EmaWindowBundle,
): void {
  const bounds = chunkBoundsFromEmaCoverage(bundle.coverage);
  mergeOverlayChunk(key, {
    fromMs: bounds.fromMs,
    toMs: bounds.toMs,
    points: bundle.points,
  });
}

export function marketCandlesReady(
  key: CandlesCacheKey,
  fromMs: number,
  toMs: number,
): boolean {
  return getOrCreateCandlesStore(key).coversRange(fromMs, toMs);
}

export function marketOverlaysReady(
  keys: readonly OverlayCacheKey[],
  fromMs: number,
  toMs: number,
): boolean {
  return keys.every((key) => getOrCreateOverlayStore(key).coversRange(fromMs, toMs));
}

export function marketOverlayReady(
  key: OverlayCacheKey,
  fromMs: number,
  toMs: number,
): boolean {
  return getOrCreateOverlayStore(key).coversRange(fromMs, toMs);
}

export function getCandles(
  key: CandlesCacheKey,
  fromMs: number,
  toMs: number,
): ChartBar[] | undefined {
  const store = candlesStores.get(key);
  if (store === undefined || !store.coversRange(fromMs, toMs)) {
    return undefined;
  }
  return store.sliceForRange(fromMs, toMs);
}

export function hasCandles(key: CandlesCacheKey, fromMs: number, toMs: number): boolean {
  return marketCandlesReady(key, fromMs, toMs);
}

/** Merge candle bars without overwriting existing times (interval/chunk storage). */
export function setCandlesIfAbsent(key: CandlesCacheKey, candles: ChartBar[]): void {
  const bounds = chunkBoundsFromCandles(candles);
  if (bounds === null) {
    return;
  }
  const store = getOrCreateCandlesStore(key);
  if (store.coversRange(bounds.fromMs, bounds.toMs)) {
    return;
  }
  store.mergeChunk({
    fromMs: bounds.fromMs,
    toMs: bounds.toMs,
    candles: [...candles],
  });
}

export function getOverlay(
  key: OverlayCacheKey,
  fromMs: number,
  toMs: number,
): ChartEmaOverlay | undefined {
  const store = overlayStores.get(key);
  if (store === undefined || !store.coversRange(fromMs, toMs)) {
    return undefined;
  }
  const parts = key.split(OVERLAY_KEY_SEP);
  const role = parts[3] as ChartEmaOverlay["role"];
  const period = Number(parts[4]);
  return {
    role,
    period,
    points: store.sliceForRange(fromMs, toMs),
  };
}

export function hasOverlay(key: OverlayCacheKey, fromMs: number, toMs: number): boolean {
  return marketOverlayReady(key, fromMs, toMs);
}

/** Merge overlay points without overwriting existing times (interval/chunk storage). */
export function setOverlayIfAbsent(key: OverlayCacheKey, overlay: ChartEmaOverlay): void {
  const bounds = chunkBoundsFromPoints(overlay.points);
  if (bounds === null) {
    return;
  }
  const store = getOrCreateOverlayStore(key);
  if (store.coversRange(bounds.fromMs, bounds.toMs)) {
    return;
  }
  store.mergeChunk({
    fromMs: bounds.fromMs,
    toMs: bounds.toMs,
    points: [...overlay.points],
  });
}

export function clearMarketResourceCache(): void {
  candlesStores.clear();
  overlayStores.clear();
}
