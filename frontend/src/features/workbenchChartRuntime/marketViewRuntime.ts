import { AnchorStackParseError } from "@/features/chart/anchorStackFromSpec";
import {
  buildRunMarketViewIdentity,
  resolveRunMarketView,
  type RunMarketView,
  type RunMarketViewIdentity,
} from "@/features/chart/runMarketView";

import type { ChartRuntimeInput } from "./runtimeTypes";

export type MarketViewRuntimeInactiveBoundary = {
  implemented: false;
  view: null;
  marketIdentity: string | null;
  expectedMarketIdentity: string | null;
  error: string | null;
};

export type MarketViewRuntimeOutput = {
  implemented: true;
  view: RunMarketView | null;
  marketIdentity: RunMarketViewIdentity | null;
  expectedMarketIdentity: RunMarketViewIdentity | null;
  error: string | null;
};

export type MarketViewRuntimeBoundary =
  | MarketViewRuntimeInactiveBoundary
  | MarketViewRuntimeOutput;

export function resolveMarketViewRuntime(input: ChartRuntimeInput): MarketViewRuntimeOutput {
  if (input.report === null || input.selectedVariant === null) {
    return {
      implemented: true,
      view: null,
      marketIdentity: null,
      expectedMarketIdentity: null,
      error: null,
    };
  }

  try {
    const view = resolveRunMarketView({
      report: input.report,
      chartTimeframe: input.chartTimeframe,
      variant: input.selectedVariant,
      reloadToken: input.reloadToken,
    });
    const marketIdentity = buildRunMarketViewIdentity(view);
    const expectedMarketIdentity =
      input.reportLoadStatus === "ready" &&
      input.selectedRunId !== null &&
      input.report.run_id === input.selectedRunId
        ? marketIdentity
        : null;

    return {
      implemented: true,
      view,
      marketIdentity,
      expectedMarketIdentity,
      error: null,
    };
  } catch (err) {
    const message =
      err instanceof AnchorStackParseError
        ? err.message
        : "Invalid strategy_spec.anchor_stack in run report";
    return {
      implemented: true,
      view: null,
      marketIdentity: null,
      expectedMarketIdentity: null,
      error: message,
    };
  }
}

export function createMarketViewRuntimeBoundary(
  input?: ChartRuntimeInput,
): MarketViewRuntimeBoundary {
  if (input !== undefined) {
    return resolveMarketViewRuntime(input);
  }
  return {
    implemented: false,
    view: null,
    marketIdentity: null,
    expectedMarketIdentity: null,
    error: null,
  };
}
