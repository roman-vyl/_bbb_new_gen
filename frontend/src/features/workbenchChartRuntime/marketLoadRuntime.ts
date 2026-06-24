import type { RunMarketView } from "@/features/chart/runMarketView";
import {
  executeMarketWindowLoad,
  marketCandlesReadyForTarget,
  type ExecuteMarketWindowLoadResult,
  type MarketDisplayWindowMs,
  type MarketWindowChunkKind,
} from "@/features/chart/workbenchMarketLoad";

import type { RuntimeLoadStatus } from "./runtimeTypes";

export type MarketLoadRuntimeBoundary = {
  implemented: false;
  status: RuntimeLoadStatus;
  error: string | null;
  readyIdentity: string | null;
  candlesRevision: number;
  overlayRevision: number;
};

export type MarketLoadRuntimeControllerState = {
  status: RuntimeLoadStatus;
  error: string | null;
  readyIdentity: string | null;
  readyTargetKey: string | null;
  candlesRevision: number;
  overlayRevision: number;
  generation: number;
  inFlightKeys: Set<string>;
  intendedIdentity: string | null;
};

export type MarketLoadCycleOutcome =
  | "applied"
  | "cache_hit_ready"
  | "stale_response"
  | "aborted"
  | "error";

export type MarketLoadCycleResult = {
  outcome: MarketLoadCycleOutcome;
  loadResult: ExecuteMarketWindowLoadResult | null;
  state: MarketLoadRuntimeControllerState;
  focusReadyFromCache: boolean;
};

export type MarketLoadCycleInput = {
  view: RunMarketView;
  viewIdentity: string;
  focusWindow: MarketDisplayWindowMs;
  coverageWindow: MarketDisplayWindowMs;
  focusKey: string;
  coverageKey: string;
  symbol: string;
  timeframe: string;
  signal: AbortSignal;
  loadGeneration: number;
  executeLoad?: typeof executeMarketWindowLoad;
};

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function marketErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return "Market load failed";
}

export function createMarketLoadRuntimeController(): MarketLoadRuntimeControllerState {
  return {
    status: "idle",
    error: null,
    readyIdentity: null,
    readyTargetKey: null,
    candlesRevision: 0,
    overlayRevision: 0,
    generation: 0,
    inFlightKeys: new Set<string>(),
    intendedIdentity: null,
  };
}

export function beginMarketLoadCycle(
  state: MarketLoadRuntimeControllerState,
  viewIdentity: string,
): number {
  state.generation += 1;
  state.intendedIdentity = viewIdentity;
  return state.generation;
}

export function cancelMarketLoadCycle(state: MarketLoadRuntimeControllerState): void {
  state.generation += 1;
}

function shouldApplyMarketLoadResult(
  state: MarketLoadRuntimeControllerState,
  loadGeneration: number,
  viewIdentity: string,
): boolean {
  return (
    state.generation === loadGeneration || state.intendedIdentity === viewIdentity
  );
}

function shouldIgnoreStaleCacheHit(
  state: MarketLoadRuntimeControllerState,
  loadGeneration: number,
  viewIdentity: string,
): boolean {
  return (
    state.generation !== loadGeneration && state.intendedIdentity !== viewIdentity
  );
}

function markFocusCandlesReady(
  state: MarketLoadRuntimeControllerState,
  viewIdentity: string,
  focusKey: string,
): boolean {
  if (state.readyTargetKey === focusKey) {
    return false;
  }
  state.readyTargetKey = focusKey;
  state.readyIdentity = viewIdentity;
  state.status = "ready";
  state.error = null;
  return true;
}

function onMarketChunkSeeded(
  state: MarketLoadRuntimeControllerState,
  kind: MarketWindowChunkKind,
  input: Pick<MarketLoadCycleInput, "view" | "viewIdentity" | "focusWindow" | "focusKey">,
): boolean {
  if (kind === "candles") {
    state.candlesRevision += 1;
    if (
      marketCandlesReadyForTarget(input.view, input.focusWindow) &&
      state.readyTargetKey !== input.focusKey
    ) {
      return markFocusCandlesReady(state, input.viewIdentity, input.focusKey);
    }
    return false;
  }

  state.overlayRevision += 1;
  return false;
}

export async function runMarketLoadCycle(
  state: MarketLoadRuntimeControllerState,
  input: MarketLoadCycleInput,
): Promise<MarketLoadCycleResult> {
  const executeLoad = input.executeLoad ?? executeMarketWindowLoad;
  state.error = null;

  let focusReadyFromCache = false;
  const focusCandlesReady = marketCandlesReadyForTarget(input.view, input.focusWindow);
  if (focusCandlesReady) {
    if (shouldIgnoreStaleCacheHit(state, input.loadGeneration, input.viewIdentity)) {
      return {
        outcome: "stale_response",
        loadResult: null,
        state,
        focusReadyFromCache: false,
      };
    }
    focusReadyFromCache = markFocusCandlesReady(state, input.viewIdentity, input.focusKey);
  } else if (state.readyTargetKey === null) {
    state.status = "loading";
  }

  try {
    const loadResult = await executeLoad({
      view: input.view,
      targetWindow: input.coverageWindow,
      symbol: input.symbol,
      timeframe: input.timeframe,
      signal: input.signal,
      inFlightKeys: state.inFlightKeys,
      onChunkSeeded: (kind) => {
        onMarketChunkSeeded(state, kind, input);
      },
    });

    if (!shouldApplyMarketLoadResult(state, input.loadGeneration, input.viewIdentity)) {
      return {
        outcome: "stale_response",
        loadResult,
        state,
        focusReadyFromCache,
      };
    }

    if (
      marketCandlesReadyForTarget(input.view, input.focusWindow) &&
      state.readyTargetKey !== input.focusKey
    ) {
      markFocusCandlesReady(state, input.viewIdentity, input.focusKey);
    }

    return {
      outcome: focusReadyFromCache ? "cache_hit_ready" : "applied",
      loadResult,
      state,
      focusReadyFromCache,
    };
  } catch (err) {
    if (isAbortError(err)) {
      return { outcome: "aborted", loadResult: null, state, focusReadyFromCache };
    }
    if (shouldIgnoreStaleCacheHit(state, input.loadGeneration, input.viewIdentity)) {
      return {
        outcome: "stale_response",
        loadResult: null,
        state,
        focusReadyFromCache,
      };
    }
    state.error = marketErrorMessage(err);
    state.readyIdentity = null;
    state.readyTargetKey = null;
    state.status = "error";
    return { outcome: "error", loadResult: null, state, focusReadyFromCache };
  }
}

export function createMarketLoadRuntimeBoundary(): MarketLoadRuntimeBoundary {
  return {
    implemented: false,
    status: "idle",
    error: null,
    readyIdentity: null,
    candlesRevision: 0,
    overlayRevision: 0,
  };
}
