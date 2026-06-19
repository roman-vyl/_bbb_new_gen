import type {
  AnchorStackPeriods,
  ChartEmaOverlay,
  ChartMarketBundle,
  RunReport,
  RunVariant,
} from "@/api/types";
import { anchorStackPeriodsFromStrategySpec } from "@/features/chart/anchorStackFromSpec";
import {
  buildCandlesCacheKey,
  buildOverlayCacheKey,
  getCandles,
  getOverlay,
  hasCandles,
  hasOverlay,
  setCandlesIfAbsent,
  setOverlayIfAbsent,
  type CandlesCacheKey,
  type OverlayCacheKey,
} from "@/features/chart/marketResourceCache";

export type OverlayResourceRef = {
  key: OverlayCacheKey;
  role: ChartEmaOverlay["role"];
  period: number;
};

export type RunMarketView = {
  runId: string;
  variant: string;
  symbol: string;
  chartTimeframe: string;
  reloadToken: number;
  fromOpenTimeMs: number;
  toOpenTimeMs: number;
  periods: AnchorStackPeriods;
  candlesKey: CandlesCacheKey;
  overlayRefs: OverlayResourceRef[];
};

export type RunMarketViewIdentity = string;

const VIEW_IDENTITY_SEP = "\u001f";

export function resolveRunMarketView(params: {
  report: RunReport;
  chartTimeframe: string;
  variant: RunVariant;
  reloadToken: number;
}): RunMarketView {
  const { report, chartTimeframe, variant, reloadToken } = params;
  const periods = anchorStackPeriodsFromStrategySpec(variant.strategy_spec);
  const { from_open_time_ms: fromOpenTimeMs, to_open_time_ms: toOpenTimeMs } = report.data_range;
  const range = { fromOpenTimeMs, toOpenTimeMs, reloadToken };
  const candlesKey = buildCandlesCacheKey({
    symbol: report.symbol,
    timeframe: chartTimeframe,
    ...range,
  });
  const overlayRefs: OverlayResourceRef[] = (
    ["fast", "anchor", "slow"] as const
  ).map((role) => {
    const period = periods[role];
    return {
      role,
      period,
      key: buildOverlayCacheKey({
        symbol: report.symbol,
        timeframe: chartTimeframe,
        source: "anchor_stack",
        role,
        period,
        ...range,
      }),
    };
  });
  return {
    runId: report.run_id,
    variant: variant.variant,
    symbol: report.symbol,
    chartTimeframe,
    reloadToken,
    fromOpenTimeMs,
    toOpenTimeMs,
    periods,
    candlesKey,
    overlayRefs,
  };
}

export function buildRunMarketViewIdentity(view: RunMarketView): RunMarketViewIdentity {
  return [
    view.runId,
    view.variant,
    view.candlesKey,
    ...view.overlayRefs.map((ref) => ref.key),
    String(view.reloadToken),
  ].join(VIEW_IDENTITY_SEP);
}

export type MissingMarketResources = {
  candles: boolean;
  overlays: OverlayResourceRef[];
};

export function getMissingMarketResources(view: RunMarketView): MissingMarketResources {
  return {
    candles: !hasCandles(view.candlesKey),
    overlays: view.overlayRefs.filter((ref) => !hasOverlay(ref.key)),
  };
}

export function isRunMarketViewReady(view: RunMarketView): boolean {
  const missing = getMissingMarketResources(view);
  return !missing.candles && missing.overlays.length === 0;
}

export function buildMarketFetchKey(view: RunMarketView, missing: MissingMarketResources): string {
  const parts: string[] = [];
  if (missing.candles) {
    parts.push(`c:${view.candlesKey}`);
  }
  for (const overlay of missing.overlays) {
    parts.push(`o:${overlay.key}`);
  }
  return parts.join("|");
}

export function composeRunMarketBundle(view: RunMarketView): ChartMarketBundle | null {
  const candles = getCandles(view.candlesKey);
  if (candles === undefined) {
    return null;
  }
  const emaOverlays: ChartEmaOverlay[] = [];
  for (const ref of view.overlayRefs) {
    const overlay = getOverlay(ref.key);
    if (overlay === undefined) {
      return null;
    }
    emaOverlays.push(overlay);
  }
  return { candles, ema_overlays: emaOverlays };
}

/** Candles when cached; anchor EMA overlays only for keys already present. */
export function composePartialRunMarketBundle(view: RunMarketView): ChartMarketBundle | null {
  const candles = getCandles(view.candlesKey);
  if (candles === undefined) {
    return null;
  }
  const emaOverlays = view.overlayRefs
    .map((ref) => getOverlay(ref.key))
    .filter((overlay): overlay is ChartEmaOverlay => overlay !== undefined);
  return { candles, ema_overlays: emaOverlays };
}

export function seedChartBundleIntoResourceCaches(
  view: RunMarketView,
  bundle: ChartMarketBundle,
): void {
  setCandlesIfAbsent(view.candlesKey, bundle.candles);
  for (const overlay of bundle.ema_overlays) {
    const ref = view.overlayRefs.find(
      (candidate) => candidate.role === overlay.role && candidate.period === overlay.period,
    );
    if (ref !== undefined) {
      setOverlayIfAbsent(ref.key, overlay);
    }
  }
}
