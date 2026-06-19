/**
 * Legacy monolithic market bundle cache — superseded by `marketResourceCache` + `runMarketView` in PR 5.
 * Kept for test cleanup (`clearMarketCache`) until all call sites migrate.
 */
import type { AnchorStackPeriods, ChartMarketBundle, RunReport } from "@/api/types";
import { clearMarketResourceCache } from "@/features/chart/marketResourceCache";

export type MarketCacheKey = string;

const legacyCache = new Map<MarketCacheKey, ChartMarketBundle>();

/** @deprecated Use `buildCandlesCacheKey` / `buildOverlayCacheKey` via `resolveRunMarketView`. */
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

/** @deprecated Use `composeRunMarketBundle` from `runMarketView`. */
export function getMarketCache(key: MarketCacheKey): ChartMarketBundle | undefined {
  return legacyCache.get(key);
}

/** @deprecated Use `isRunMarketViewReady`. */
export function hasMarketCache(key: MarketCacheKey): boolean {
  return legacyCache.has(key);
}

/** @deprecated Use `seedChartBundleIntoResourceCaches`. */
export function setMarketCacheIfAbsent(key: MarketCacheKey, bundle: ChartMarketBundle): void {
  if (!legacyCache.has(key)) {
    legacyCache.set(key, bundle);
  }
}

export function deleteMarketCache(key: MarketCacheKey): void {
  legacyCache.delete(key);
}

export function clearMarketCache(): void {
  legacyCache.clear();
  clearMarketResourceCache();
}
