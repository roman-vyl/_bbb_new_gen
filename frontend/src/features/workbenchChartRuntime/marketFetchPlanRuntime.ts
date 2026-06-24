import {
  planCandlesWindowFetchForView,
  planEmaWindowFetchesForView,
  type PlannedCandlesWindowFetch,
  type PlannedEmaWindowFetch,
} from "@/features/chart/marketWindowPlanner";
import type { RunMarketView } from "@/features/chart/runMarketView";
import {
  marketCandlesReadyForTarget,
  type MarketDisplayWindowMs,
} from "@/features/chart/workbenchMarketLoad";

export type RuntimeMarketFetchPlan = {
  candlesPlan: PlannedCandlesWindowFetch | null;
  emaPlans: PlannedEmaWindowFetch[];
  focusCandlesReady: boolean;
  coverageCandlesReady: boolean;
  plannedInFlightKeys: string[];
};

export type MarketFetchPlanRuntimeOutput = RuntimeMarketFetchPlan & {
  implemented: true;
};

export type MarketFetchPlanRuntimeInactiveBoundary = {
  implemented: false;
  candlesPlan: null;
  emaPlans: [];
  focusCandlesReady: false;
  coverageCandlesReady: false;
  plannedInFlightKeys: [];
};

export type MarketFetchPlanRuntimeBoundary =
  | MarketFetchPlanRuntimeInactiveBoundary
  | MarketFetchPlanRuntimeOutput;

export function resolveMarketFetchPlanRuntime(input: {
  view: RunMarketView;
  focusWindow: MarketDisplayWindowMs;
  coverageWindow: MarketDisplayWindowMs;
}): MarketFetchPlanRuntimeOutput {
  const candlesPlan = planCandlesWindowFetchForView({
    view: input.view,
    targetWindow: input.coverageWindow,
  });
  const emaPlans = planEmaWindowFetchesForView({
    view: input.view,
    targetWindow: input.coverageWindow,
  });

  return {
    implemented: true,
    candlesPlan,
    emaPlans,
    focusCandlesReady: marketCandlesReadyForTarget(input.view, input.focusWindow),
    coverageCandlesReady: marketCandlesReadyForTarget(input.view, input.coverageWindow),
    plannedInFlightKeys: [
      ...(candlesPlan !== null ? [candlesPlan.inFlightKey] : []),
      ...emaPlans.map((plan) => plan.inFlightKey),
    ],
  };
}

export function createMarketFetchPlanRuntimeBoundary(input?: {
  view: RunMarketView;
  focusWindow: MarketDisplayWindowMs;
  coverageWindow: MarketDisplayWindowMs;
}): MarketFetchPlanRuntimeBoundary {
  if (input !== undefined) {
    return resolveMarketFetchPlanRuntime(input);
  }
  return {
    implemented: false,
    candlesPlan: null,
    emaPlans: [],
    focusCandlesReady: false,
    coverageCandlesReady: false,
    plannedInFlightKeys: [],
  };
}

export function toRuntimeMarketFetchPlanDebug(
  plan: MarketFetchPlanRuntimeOutput | null,
): {
  focusCandlesReady: boolean;
  coverageCandlesReady: boolean;
  candlesInFlightKey: string | null;
  emaInFlightKeys: string[];
  plannedFetchCount: number;
} | null {
  if (plan === null) {
    return null;
  }
  return {
    focusCandlesReady: plan.focusCandlesReady,
    coverageCandlesReady: plan.coverageCandlesReady,
    candlesInFlightKey: plan.candlesPlan?.inFlightKey ?? null,
    emaInFlightKeys: plan.emaPlans.map((entry) => entry.inFlightKey),
    plannedFetchCount:
      (plan.candlesPlan !== null ? 1 : 0) + plan.emaPlans.length,
  };
}
