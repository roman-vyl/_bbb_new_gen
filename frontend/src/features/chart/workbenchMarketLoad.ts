import { fetchCandlesWindow, fetchEmaWindow } from "@/api/client";
import type { RunMarketView } from "@/features/chart/runMarketView";
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

export async function executeMarketWindowLoad(input: {
  view: RunMarketView;
  targetWindow: MarketDisplayWindowMs;
  symbol: string;
  timeframe: string;
  signal: AbortSignal;
  inFlightKeys: Set<string>;
  onChunkSeeded?: () => void;
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
      input.onChunkSeeded?.();
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
        input.onChunkSeeded?.();
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
