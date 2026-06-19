import type { ChartBar, ChartEmaOverlay } from "@/api/types";

export type CandlesCacheKey = string;
export type OverlayCacheKey = string;

const CANDLES_KEY_SEP = "\u001e";
const OVERLAY_KEY_SEP = "\u001e";

const candlesCache = new Map<CandlesCacheKey, ChartBar[]>();
const overlayCache = new Map<OverlayCacheKey, ChartEmaOverlay>();

export type MarketRangeIdentity = {
  fromOpenTimeMs: number;
  toOpenTimeMs: number;
  reloadToken: number;
};

export function buildCandlesCacheKey(params: {
  symbol: string;
  timeframe: string;
  fromOpenTimeMs: number;
  toOpenTimeMs: number;
  reloadToken: number;
}): CandlesCacheKey {
  return [
    params.symbol,
    params.timeframe,
    String(params.fromOpenTimeMs),
    String(params.toOpenTimeMs),
    String(params.reloadToken),
  ].join(CANDLES_KEY_SEP);
}

export type OverlaySource = "anchor_stack";

export function buildOverlayCacheKey(params: {
  symbol: string;
  timeframe: string;
  source: OverlaySource;
  role: ChartEmaOverlay["role"];
  period: number;
  fromOpenTimeMs: number;
  toOpenTimeMs: number;
  reloadToken: number;
}): OverlayCacheKey {
  return [
    params.symbol,
    params.timeframe,
    params.source,
    params.role,
    String(params.period),
    String(params.fromOpenTimeMs),
    String(params.toOpenTimeMs),
    String(params.reloadToken),
  ].join(OVERLAY_KEY_SEP);
}

export function getCandles(key: CandlesCacheKey): ChartBar[] | undefined {
  return candlesCache.get(key);
}

export function hasCandles(key: CandlesCacheKey): boolean {
  return candlesCache.has(key);
}

/** Immutable by key: never overwrite an existing entry. */
export function setCandlesIfAbsent(key: CandlesCacheKey, candles: ChartBar[]): void {
  if (!candlesCache.has(key)) {
    candlesCache.set(key, candles);
  }
}

export function getOverlay(key: OverlayCacheKey): ChartEmaOverlay | undefined {
  return overlayCache.get(key);
}

export function hasOverlay(key: OverlayCacheKey): boolean {
  return overlayCache.has(key);
}

/** Immutable by key: never overwrite an existing entry. */
export function setOverlayIfAbsent(key: OverlayCacheKey, overlay: ChartEmaOverlay): void {
  if (!overlayCache.has(key)) {
    overlayCache.set(key, overlay);
  }
}

export function clearMarketResourceCache(): void {
  candlesCache.clear();
  overlayCache.clear();
}
