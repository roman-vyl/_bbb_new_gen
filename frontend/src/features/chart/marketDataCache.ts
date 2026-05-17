import type { AnchorStackPeriods, ChartMarketBundle, RunReport } from "@/api/types";

export type MarketCacheKey = string;

const cache = new Map<MarketCacheKey, ChartMarketBundle>();

export function buildMarketCacheKey(
  report: RunReport,
  chartTimeframe: string,
  variantKey: string,
  periods: AnchorStackPeriods,
  reloadToken = 0,
): MarketCacheKey {
  const { from_open_time_ms, to_open_time_ms } = report.data_range;
  return [
    report.run_id,
    report.symbol,
    chartTimeframe,
    variantKey,
    periods.fast,
    periods.anchor,
    periods.slow,
    from_open_time_ms,
    to_open_time_ms,
    reloadToken,
  ].join("|");
}

export function getMarketCache(key: MarketCacheKey): ChartMarketBundle | undefined {
  return cache.get(key);
}

export function hasMarketCache(key: MarketCacheKey): boolean {
  return cache.has(key);
}

/** Immutable by key: never overwrite an existing entry. */
export function setMarketCacheIfAbsent(key: MarketCacheKey, bundle: ChartMarketBundle): void {
  if (!cache.has(key)) {
    cache.set(key, bundle);
  }
}

export function deleteMarketCache(key: MarketCacheKey): void {
  cache.delete(key);
}

export function clearMarketCache(): void {
  cache.clear();
}
