import type { RunMarketView } from "@/features/chart/runMarketView";
import {
  buildMarketTargetWindowKey,
  resolveMarketTargetWindow,
  type MarketDisplayWindowMs,
} from "@/features/chart/workbenchMarketLoad";

import { resolveMarketFetchPlanRuntime } from "./marketFetchPlanRuntime";
import {
  beginMarketLoadCycle,
  cancelMarketLoadCycle,
  createMarketLoadRuntimeController,
  runMarketLoadCycle,
  type MarketLoadCycleResult,
  type MarketLoadRuntimeControllerState,
} from "./marketLoadRuntime";

export type MarketLoadHarnessContext = {
  controller: MarketLoadRuntimeControllerState;
  view: RunMarketView;
  viewIdentity: string;
  focusWindow: MarketDisplayWindowMs;
  coverageWindow: MarketDisplayWindowMs;
  focusKey: string;
  coverageKey: string;
  fetchPlan: ReturnType<typeof resolveMarketFetchPlanRuntime>;
};

export type MarketLoadHarnessRunInput = {
  symbol: string;
  timeframe: string;
  signal?: AbortSignal;
  executeLoad?: Parameters<typeof runMarketLoadCycle>[1]["executeLoad"];
};

export type MarketLoadHarness = {
  context: MarketLoadHarnessContext;
  runLoad(input: MarketLoadHarnessRunInput): Promise<MarketLoadCycleResult>;
  cancel(): void;
};

export function createMarketLoadHarness(input: {
  view: RunMarketView;
  viewIdentity: string;
  selectedTradeEntryTimeMs?: number | null;
  coverageWindow?: MarketDisplayWindowMs;
}): MarketLoadHarness {
  const controller = createMarketLoadRuntimeController();
  const focusWindow = resolveMarketTargetWindow(
    input.view,
    input.selectedTradeEntryTimeMs ?? null,
  );
  const coverageWindow = input.coverageWindow ?? focusWindow;
  const focusKey = buildMarketTargetWindowKey(input.viewIdentity, focusWindow);
  const coverageKey = buildMarketTargetWindowKey(input.viewIdentity, coverageWindow);
  const fetchPlan = resolveMarketFetchPlanRuntime({
    view: input.view,
    focusWindow,
    coverageWindow,
  });

  const context: MarketLoadHarnessContext = {
    controller,
    view: input.view,
    viewIdentity: input.viewIdentity,
    focusWindow,
    coverageWindow,
    focusKey,
    coverageKey,
    fetchPlan,
  };

  let activeAbort: AbortController | null = null;

  return {
    context,
    async runLoad(runInput) {
      activeAbort?.abort();
      const abortController = new AbortController();
      activeAbort = abortController;
      const signal = runInput.signal ?? abortController.signal;
      const loadGeneration = beginMarketLoadCycle(controller, input.viewIdentity);

      return runMarketLoadCycle(controller, {
        view: input.view,
        viewIdentity: input.viewIdentity,
        focusWindow,
        coverageWindow,
        focusKey,
        coverageKey,
        symbol: runInput.symbol,
        timeframe: runInput.timeframe,
        signal,
        loadGeneration,
        executeLoad: runInput.executeLoad,
      });
    },
    cancel() {
      activeAbort?.abort();
      activeAbort = null;
      cancelMarketLoadCycle(controller);
    },
  };
}
