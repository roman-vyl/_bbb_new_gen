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
  type MarketTimeBoundsMs,
  type OverlayCacheKey,
} from "@/features/chart/marketResourceCache";

export type { MarketTimeBoundsMs as MarketWindowBoundsMs };

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
  const candlesKey = buildCandlesCacheKey({
    symbol: report.symbol,
    timeframe: chartTimeframe,
    reloadToken,
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
        reloadToken,
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

/**
 * Legacy `/api/market/chart-bundle` path — checks full report `data_range`.
 * Do not use for split candles-window / ema-window load (Phase 6+).
 */
export function getMissingMarketResources(view: RunMarketView): MissingMarketResources {
  return getMissingMarketWindowResources(view, {
    fromMs: view.fromOpenTimeMs,
    toMs: view.toOpenTimeMs,
  });
}

/** Target display window — split cold-load path (Phase 6+). */
export function getMissingMarketWindowResources(
  view: RunMarketView,
  targetWindow: MarketTimeBoundsMs,
): MissingMarketResources {
  const { fromMs, toMs } = targetWindow;
  return {
    candles: !hasCandles(view.candlesKey, fromMs, toMs),
    overlays: view.overlayRefs.filter((ref) => !hasOverlay(ref.key, fromMs, toMs)),
  };
}

/** Legacy chart-bundle readiness over full report range. */
export function isRunMarketViewReady(view: RunMarketView): boolean {
  const missing = getMissingMarketResources(view);
  return !missing.candles && missing.overlays.length === 0;
}

/** Split-path readiness for a target display window only. */
export function isRunMarketWindowReady(
  view: RunMarketView,
  targetWindow: MarketTimeBoundsMs,
): boolean {
  const missing = getMissingMarketWindowResources(view, targetWindow);
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

/** Split-path fetch dedupe key scoped to target display window. */
export function buildMarketWindowFetchKey(
  view: RunMarketView,
  missing: MissingMarketResources,
  targetWindow: MarketTimeBoundsMs,
): string {
  const parts: string[] = [`w:${targetWindow.fromMs}:${targetWindow.toMs}`];
  if (missing.candles) {
    parts.push(`c:${view.candlesKey}`);
  }
  for (const overlay of missing.overlays) {
    parts.push(`o:${overlay.key}`);
  }
  return parts.join("|");
}

/** Legacy chart-bundle compose over full report range. */
export function composeRunMarketBundle(view: RunMarketView): ChartMarketBundle | null {
  return composeRunMarketWindowBundle(view, {
    fromMs: view.fromOpenTimeMs,
    toMs: view.toOpenTimeMs,
  });
}

/** Split-path compose — all overlays required for target window. */
export function composeRunMarketWindowBundle(
  view: RunMarketView,
  targetWindow: MarketTimeBoundsMs,
): ChartMarketBundle | null {
  const { fromMs, toMs } = targetWindow;
  const candles = getCandles(view.candlesKey, fromMs, toMs);
  if (candles === undefined) {
    return null;
  }
  const emaOverlays: ChartEmaOverlay[] = [];
  for (const ref of view.overlayRefs) {
    const overlay = getOverlay(ref.key, fromMs, toMs);
    if (overlay === undefined) {
      return null;
    }
    emaOverlays.push(overlay);
  }
  return { candles, ema_overlays: emaOverlays };
}

/** Legacy chart-bundle partial compose over full report range. */
export function composePartialRunMarketBundle(view: RunMarketView): ChartMarketBundle | null {
  return composePartialRunMarketWindowBundle(view, {
    fromMs: view.fromOpenTimeMs,
    toMs: view.toOpenTimeMs,
  });
}

/** Split-path partial compose — candles + any overlays already cached for target window. */
export function composePartialRunMarketWindowBundle(
  view: RunMarketView,
  targetWindow: MarketTimeBoundsMs,
): ChartMarketBundle | null {
  const { fromMs, toMs } = targetWindow;
  const candles = getCandles(view.candlesKey, fromMs, toMs);
  if (candles === undefined) {
    return null;
  }
  const emaOverlays = view.overlayRefs
    .map((ref) => getOverlay(ref.key, fromMs, toMs))
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
