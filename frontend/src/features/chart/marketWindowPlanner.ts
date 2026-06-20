import type { CandlesWindowBundle, EmaWindowBundle } from "@/api/types";
import { CHART_RENDER_WINDOW_SIZE } from "@/features/chart/chartViewWindow";
import {
  buildCandlesCacheKey,
  getMarketCandlesCache,
  getMarketOverlayCache,
  mergeCandlesWindowBundle,
  mergeEmaWindowBundle,
  marketCandlesReady,
  marketOverlayReady,
  type CandlesCacheKey,
  type MarketTimeBoundsMs,
  type OverlayCacheKey,
} from "@/features/chart/marketResourceCache";
import type { OverlayResourceRef, RunMarketView } from "@/features/chart/runMarketView";
import { dbgMark, PIPELINE_DEBUG_STEPS as DBG } from "@/shared/diagnostics/pipelineDebug";

export type { MarketTimeBoundsMs };

export type MarketDisplayWindowMs = MarketTimeBoundsMs & {
  toOpenTimeMs: number;
};

const PLANNER_KEY_SEP = "\u001e";
const DEFAULT_TIMEFRAME_MS = 300_000;

export type PlannedCandlesWindowFetch = {
  inFlightKey: string;
  candlesKey: CandlesCacheKey;
  fromMs: number;
  toMs: number;
  toOpenTimeMs: number;
  missingRange: MarketTimeBoundsMs;
};

export type PlannedEmaWindowFetch = {
  inFlightKey: string;
  overlayKey: OverlayCacheKey;
  role: OverlayResourceRef["role"];
  period: number;
  fromMs: number;
  toMs: number;
  toOpenTimeMs: number;
  missingRange: MarketTimeBoundsMs;
};

export function resolveTargetDisplayWindow(input: {
  reportFromMs: number;
  reportToMs: number;
  mode: "tail" | "around-trade";
  centerTimeSec?: number | null;
  timeframeMs?: number;
}): MarketDisplayWindowMs {
  const timeframeMs = input.timeframeMs ?? DEFAULT_TIMEFRAME_MS;
  const spanMs = CHART_RENDER_WINDOW_SIZE * timeframeMs;

  if (input.mode === "around-trade" && input.centerTimeSec != null) {
    const centerMs = input.centerTimeSec * 1000;
    const halfSpan = Math.floor(spanMs / 2);
    let fromMs = Math.max(input.reportFromMs, centerMs - halfSpan);
    let toMs = Math.min(input.reportToMs, fromMs + spanMs);
    fromMs = Math.max(input.reportFromMs, toMs - spanMs);
    const lastOpenMs = Math.max(input.reportFromMs, toMs - timeframeMs);
    return {
      fromMs,
      toMs,
      toOpenTimeMs: lastOpenMs,
    };
  }

  const fromMs = Math.max(input.reportFromMs, input.reportToMs - spanMs);
  const lastOpenMs = Math.max(input.reportFromMs, input.reportToMs - timeframeMs);
  return {
    fromMs,
    toMs: input.reportToMs,
    toOpenTimeMs: lastOpenMs,
  };
}

function lastBarOpenMs(bounds: MarketDisplayWindowMs, timeframeMs: number): number {
  return Math.max(bounds.fromMs, bounds.toMs - timeframeMs);
}

export function buildCandlesWindowInFlightKey(params: {
  candlesKey: CandlesCacheKey;
  fromMs: number;
  toMs: number;
}): string {
  return ["candles", params.candlesKey, String(params.fromMs), String(params.toMs)].join(
    PLANNER_KEY_SEP,
  );
}

export function buildEmaWindowInFlightKey(params: {
  overlayKey: OverlayCacheKey;
  fromMs: number;
  toMs: number;
}): string {
  return ["ema", params.overlayKey, String(params.fromMs), String(params.toMs)].join(
    PLANNER_KEY_SEP,
  );
}

export function planCandlesWindowFetch(input: {
  view: RunMarketView;
  targetWindow: MarketDisplayWindowMs;
  timeframeMs?: number;
}): PlannedCandlesWindowFetch | null {
  const timeframeMs = input.timeframeMs ?? DEFAULT_TIMEFRAME_MS;
  const { fromMs, toMs } = input.targetWindow;
  const cache = getMarketCandlesCache(input.view.candlesKey);

  if (cache.coversRange(fromMs, toMs)) {
    dbgMark(DBG.market.candlesDecision, {
      decision: "cache_hit",
      candlesKey: input.view.candlesKey,
      fromMs,
      toMs,
    });
    return null;
  }

  const missingRange = cache.missingRange(fromMs, toMs);
  if (missingRange === null) {
    dbgMark(DBG.market.candlesDecision, {
      decision: "cache_hit",
      candlesKey: input.view.candlesKey,
      fromMs,
      toMs,
    });
    return null;
  }

  const toOpenTimeMs = lastBarOpenMs(
    { fromMs: missingRange.fromMs, toMs: missingRange.toMs, toOpenTimeMs: 0 },
    timeframeMs,
  );

  dbgMark(DBG.market.candlesDecision, {
    decision: "fetch",
    candlesKey: input.view.candlesKey,
    fromMs: missingRange.fromMs,
    toMs: missingRange.toMs,
    toOpenTimeMs,
  });

  return {
    inFlightKey: buildCandlesWindowInFlightKey({
      candlesKey: input.view.candlesKey,
      fromMs: missingRange.fromMs,
      toMs: missingRange.toMs,
    }),
    candlesKey: input.view.candlesKey,
    fromMs: missingRange.fromMs,
    toMs: missingRange.toMs,
    toOpenTimeMs,
    missingRange,
  };
}

export function planEmaWindowFetches(input: {
  view: RunMarketView;
  targetWindow: MarketDisplayWindowMs;
  overlayRefs?: OverlayResourceRef[];
  timeframeMs?: number;
}): PlannedEmaWindowFetch[] {
  const timeframeMs = input.timeframeMs ?? DEFAULT_TIMEFRAME_MS;
  const { fromMs, toMs } = input.targetWindow;
  const refs = input.overlayRefs ?? input.view.overlayRefs;
  const planned: PlannedEmaWindowFetch[] = [];

  for (const ref of refs) {
    const cache = getMarketOverlayCache(ref.key);
    if (cache.coversRange(fromMs, toMs)) {
      dbgMark(DBG.market.emaDecision, {
        decision: "cache_hit",
        overlayKey: ref.key,
        role: ref.role,
        period: ref.period,
        fromMs,
        toMs,
      });
      continue;
    }

    const missingRange = cache.missingRange(fromMs, toMs);
    if (missingRange === null) {
      dbgMark(DBG.market.emaDecision, {
        decision: "cache_hit",
        overlayKey: ref.key,
        role: ref.role,
        period: ref.period,
        fromMs,
        toMs,
      });
      continue;
    }

    const toOpenTimeMs = lastBarOpenMs(
      { fromMs: missingRange.fromMs, toMs: missingRange.toMs, toOpenTimeMs: 0 },
      timeframeMs,
    );

    dbgMark(DBG.market.emaDecision, {
      decision: "fetch",
      overlayKey: ref.key,
      role: ref.role,
      period: ref.period,
      fromMs: missingRange.fromMs,
      toMs: missingRange.toMs,
      toOpenTimeMs,
    });

    planned.push({
      inFlightKey: buildEmaWindowInFlightKey({
        overlayKey: ref.key,
        fromMs: missingRange.fromMs,
        toMs: missingRange.toMs,
      }),
      overlayKey: ref.key,
      role: ref.role,
      period: ref.period,
      fromMs: missingRange.fromMs,
      toMs: missingRange.toMs,
      toOpenTimeMs,
      missingRange,
    });
  }

  return planned;
}

export function seedCandlesWindow(candlesKey: CandlesCacheKey, bundle: CandlesWindowBundle): void {
  mergeCandlesWindowBundle(candlesKey, bundle);
}

export function seedEmaWindow(overlayKey: OverlayCacheKey, bundle: EmaWindowBundle): void {
  mergeEmaWindowBundle(overlayKey, bundle);
}

export function isMarketCandlesReadyForWindow(
  view: RunMarketView,
  targetWindow: MarketDisplayWindowMs,
): boolean {
  return marketCandlesReady(view.candlesKey, targetWindow.fromMs, targetWindow.toMs);
}

export function isMarketOverlaysReadyForWindow(
  view: RunMarketView,
  targetWindow: MarketDisplayWindowMs,
  overlayRefs?: OverlayResourceRef[],
): boolean {
  const refs = overlayRefs ?? view.overlayRefs;
  return refs.every((ref) =>
    marketOverlayReady(ref.key, targetWindow.fromMs, targetWindow.toMs),
  );
}

export function buildRunMarketCandlesKey(view: RunMarketView): CandlesCacheKey {
  return buildCandlesCacheKey({
    symbol: view.symbol,
    timeframe: view.chartTimeframe,
    reloadToken: view.reloadToken,
  });
}
