import { fetchCandlesWindow, fetchEmaWindow } from "@/api/client";
import type { RunMarketView } from "@/features/chart/runMarketView";
import {
  CHART_RENDER_SAFE_ZONE,
  CHART_RENDER_WINDOW_SIZE,
} from "@/features/chart/chartViewWindow";
import {
  isMarketCandlesReadyForWindow,
  planCandlesWindowFetchForView,
  planEmaWindowFetchesForView,
  resolveTargetDisplayWindowForView,
  seedCandlesWindow,
  seedEmaWindow,
  type MarketDisplayWindowMs,
  type PlannedCandlesWindowFetch,
  type PlannedEmaWindowFetch,
} from "@/features/chart/marketWindowPlanner";

export type { MarketDisplayWindowMs };

export function resolveMarketTargetWindow(
  view: RunMarketView,
  selectedTradeEntryTimeMs: number | null,
): MarketDisplayWindowMs {
  const mode = selectedTradeEntryTimeMs !== null ? "around-trade" : "tail";
  const centerTimeSec =
    selectedTradeEntryTimeMs !== null
      ? Math.floor(selectedTradeEntryTimeMs / 1000)
      : null;
  return resolveTargetDisplayWindowForView(view, {
    reportFromMs: view.fromOpenTimeMs,
    reportToMs: view.toOpenTimeMs,
    mode,
    centerTimeSec,
  });
}

export function mergeMarketDisplayWindow(
  base: MarketDisplayWindowMs,
  renderFromSec: number,
  renderToSec: number,
  timeframeMs: number,
): MarketDisplayWindowMs {
  const renderFromMs = renderFromSec * 1000;
  const renderToExclusiveMs = renderToSec * 1000 + timeframeMs;
  const renderToOpenMs = renderToSec * 1000;
  return {
    fromMs: Math.min(base.fromMs, renderFromMs),
    toMs: Math.max(base.toMs, renderToExclusiveMs),
    toOpenTimeMs: Math.max(base.toOpenTimeMs, renderToOpenMs),
  };
}

export function marketWindowChunkMs(timeframeMs: number): number {
  return CHART_RENDER_WINDOW_SIZE * timeframeMs;
}

export type MarketPanPrefetchReason =
  | "none"
  | "near_left_edge"
  | "near_right_edge"
  | "both"
  | "clamped"
  | "not_user_pan";

export type MarketPanPrefetchDecision = {
  expanded: MarketDisplayWindowMs | null;
  reason: MarketPanPrefetchReason;
  meta: {
    visible_from_ms: number;
    visible_to_ms: number;
    target_from_ms: number;
    target_to_ms: number;
    expanded_from_ms: number | null;
    expanded_to_ms: number | null;
    margin_ms: number;
    margin_bars: number;
  };
};

function lastBarOpenMs(bounds: Pick<MarketDisplayWindowMs, "fromMs" | "toMs">, timeframeMs: number): number {
  return Math.max(bounds.fromMs, bounds.toMs - timeframeMs);
}

export function evaluateMarketPanPrefetchExpansion(input: {
  targetWindow: MarketDisplayWindowMs;
  visibleFromSec: number;
  visibleToSec: number;
  reportFromMs: number;
  reportToMs: number;
  timeframeMs: number;
  isUserPan: boolean;
}): MarketPanPrefetchDecision {
  const marginBars = CHART_RENDER_SAFE_ZONE;
  const marginMs = marginBars * input.timeframeMs;
  const chunkMs = marketWindowChunkMs(input.timeframeMs);
  const visibleFromMs = input.visibleFromSec * 1000;
  const visibleToOpenMs = input.visibleToSec * 1000;
  const baseMeta = {
    visible_from_ms: visibleFromMs,
    visible_to_ms: visibleToOpenMs,
    target_from_ms: input.targetWindow.fromMs,
    target_to_ms: input.targetWindow.toMs,
    expanded_from_ms: null as number | null,
    expanded_to_ms: null as number | null,
    margin_ms: marginMs,
    margin_bars: marginBars,
  };

  if (!input.isUserPan) {
    return { expanded: null, reason: "not_user_pan", meta: baseMeta };
  }

  const atLeftBoundary = input.targetWindow.fromMs <= input.reportFromMs;
  const atRightBoundary = input.targetWindow.toMs >= input.reportToMs;
  const nearLeftEdge = visibleFromMs - input.targetWindow.fromMs <= marginMs;
  const nearRightEdge = input.targetWindow.toOpenTimeMs - visibleToOpenMs <= marginMs;

  if (nearLeftEdge && atLeftBoundary) {
    return { expanded: null, reason: "clamped", meta: baseMeta };
  }
  if (nearRightEdge && atRightBoundary) {
    return { expanded: null, reason: "clamped", meta: baseMeta };
  }

  const nearLeft = nearLeftEdge && input.targetWindow.fromMs > input.reportFromMs;
  const nearRight = nearRightEdge && input.targetWindow.toMs < input.reportToMs;

  if (!nearLeft && !nearRight) {
    return { expanded: null, reason: "none", meta: baseMeta };
  }

  let fromMs = input.targetWindow.fromMs;
  let toMs = input.targetWindow.toMs;
  let clamped = false;

  if (nearLeft) {
    const nextFromMs = Math.max(input.reportFromMs, fromMs - chunkMs);
    clamped ||= nextFromMs === fromMs;
    fromMs = nextFromMs;
  }
  if (nearRight) {
    const nextToMs = Math.min(input.reportToMs, toMs + chunkMs);
    clamped ||= nextToMs === toMs;
    toMs = nextToMs;
  }

  const expanded: MarketDisplayWindowMs = {
    fromMs,
    toMs,
    toOpenTimeMs: lastBarOpenMs({ fromMs, toMs }, input.timeframeMs),
  };

  baseMeta.expanded_from_ms = expanded.fromMs;
  baseMeta.expanded_to_ms = expanded.toMs;

  if (
    expanded.fromMs === input.targetWindow.fromMs &&
    expanded.toMs === input.targetWindow.toMs &&
    expanded.toOpenTimeMs === input.targetWindow.toOpenTimeMs
  ) {
    return { expanded: null, reason: clamped ? "clamped" : "none", meta: baseMeta };
  }

  const reason: MarketPanPrefetchReason =
    nearLeft && nearRight
      ? "both"
      : nearLeft
        ? "near_left_edge"
        : "near_right_edge";

  return { expanded, reason, meta: baseMeta };
}

export async function fetchPlannedCandlesWindow(
  plan: PlannedCandlesWindowFetch,
  params: {
    symbol: string;
    timeframe: string;
    signal?: AbortSignal;
  },
): Promise<void> {
  const bundle = await fetchCandlesWindow({
    symbol: params.symbol,
    timeframe: params.timeframe,
    fromMs: plan.fromMs,
    toOpenTimeMs: plan.toOpenTimeMs,
    signal: params.signal,
  });
  seedCandlesWindow(plan.candlesKey, bundle);
}

export async function fetchPlannedEmaWindow(
  plan: PlannedEmaWindowFetch,
  params: {
    symbol: string;
    timeframe: string;
    signal?: AbortSignal;
  },
): Promise<void> {
  const bundle = await fetchEmaWindow({
    symbol: params.symbol,
    timeframe: params.timeframe,
    period: plan.period,
    fromMs: plan.fromMs,
    toOpenTimeMs: plan.toOpenTimeMs,
    signal: params.signal,
  });
  seedEmaWindow(plan.overlayKey, bundle);
}

export type ExecuteMarketWindowLoadResult = {
  candlesFetched: boolean;
  emaFetched: number;
};

export type MarketWindowChunkKind = "candles" | "ema";

export function buildMarketTargetWindowKey(
  viewIdentity: string,
  targetWindow: MarketDisplayWindowMs,
): string {
  return `${viewIdentity}:${targetWindow.fromMs}:${targetWindow.toMs}:${targetWindow.toOpenTimeMs}`;
}

export async function executeMarketWindowLoad(input: {
  view: RunMarketView;
  targetWindow: MarketDisplayWindowMs;
  symbol: string;
  timeframe: string;
  signal: AbortSignal;
  inFlightKeys: Set<string>;
  onChunkSeeded?: (kind: MarketWindowChunkKind) => void;
}): Promise<ExecuteMarketWindowLoadResult> {
  let candlesFetched = false;
  let emaFetched = 0;

  const candlesPlan = planCandlesWindowFetchForView({
    view: input.view,
    targetWindow: input.targetWindow,
  });

  if (candlesPlan !== null && !input.inFlightKeys.has(candlesPlan.inFlightKey)) {
    input.inFlightKeys.add(candlesPlan.inFlightKey);
    try {
      await fetchPlannedCandlesWindow(candlesPlan, {
        symbol: input.symbol,
        timeframe: input.timeframe,
        signal: input.signal,
      });
      candlesFetched = true;
      input.onChunkSeeded?.("candles");
    } finally {
      input.inFlightKeys.delete(candlesPlan.inFlightKey);
    }
  }

  const emaPlans = planEmaWindowFetchesForView({
    view: input.view,
    targetWindow: input.targetWindow,
  });

  await Promise.all(
    emaPlans.map(async (plan) => {
      if (input.inFlightKeys.has(plan.inFlightKey)) {
        return;
      }
      input.inFlightKeys.add(plan.inFlightKey);
      try {
        await fetchPlannedEmaWindow(plan, {
          symbol: input.symbol,
          timeframe: input.timeframe,
          signal: input.signal,
        });
        emaFetched += 1;
        input.onChunkSeeded?.("ema");
      } finally {
        input.inFlightKeys.delete(plan.inFlightKey);
      }
    }),
  );

  return { candlesFetched, emaFetched };
}

export function marketCandlesReadyForTarget(
  view: RunMarketView,
  targetWindow: MarketDisplayWindowMs,
): boolean {
  return isMarketCandlesReadyForWindow(view, targetWindow);
}
