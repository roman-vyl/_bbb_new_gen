import type { ChartMarketBundle } from "@/api/types";
import { AnchorStackParseError } from "@/features/chart/anchorStackFromSpec";
import type { RunMarketView, RunMarketViewIdentity } from "@/features/chart/runMarketView";
import {
  buildRunMarketViewIdentity,
  resolveRunMarketView,
} from "@/features/chart/runMarketView";
import type { MarketBundleComposeSource } from "@/features/chart/runMarketView";
import {
  executeMarketWindowLoad,
  buildMarketTargetWindowKey,
  evaluateMarketPanPrefetchExpansion,
  marketCandlesReadyForTarget,
  resolveMarketTargetWindow,
  type MarketDisplayWindowMs,
} from "@/features/chart/workbenchMarketLoad";
import { PIPELINE_DEBUG_STEPS as DBG } from "@/shared/diagnostics/pipelineDebug";

import { dbgMarkCutover } from "./chartRuntimeCutoverTelemetry";
import {
  resolveMarketBundleRuntime,
  type MarketBundleRuntimeOutput,
} from "./marketBundleRuntime";
import {
  beginMarketLoadCycle,
  cancelMarketLoadCycle,
  createMarketLoadRuntimeController,
  runMarketLoadCycle,
  type MarketLoadCycleResult,
  type MarketLoadRuntimeControllerState,
} from "./marketLoadRuntime";
import type { RuntimeLoadStatus } from "./runtimeTypes";

export type Phase63FMarketLoadOwnerState = {
  controller: MarketLoadRuntimeControllerState;
  coverageTargetWindow: MarketDisplayWindowMs | null;
  coverageResetKey: string | null;
  panPrefetchLogKey: string | null;
  panPrefetchExpansionKey: string | null;
  visiblePrefetchSample: string | null;
  composeFallbackKey: string | null;
  composeSource: MarketBundleComposeSource | null;
  prevBundleFirstTimeSec: number | null;
  lastBundleReadyKey: string | null;
};

export function createPhase63FMarketLoadOwnerState(): Phase63FMarketLoadOwnerState {
  return {
    controller: createMarketLoadRuntimeController(),
    coverageTargetWindow: null,
    coverageResetKey: null,
    panPrefetchLogKey: null,
    panPrefetchExpansionKey: null,
    visiblePrefetchSample: null,
    composeFallbackKey: null,
    composeSource: null,
    prevBundleFirstTimeSec: null,
    lastBundleReadyKey: null,
  };
}

export function resetPhase63FMarketLoadOwner(owner: Phase63FMarketLoadOwnerState): void {
  owner.controller = createMarketLoadRuntimeController();
  owner.coverageTargetWindow = null;
  owner.coverageResetKey = null;
  owner.panPrefetchLogKey = null;
  owner.panPrefetchExpansionKey = null;
  owner.visiblePrefetchSample = null;
  owner.composeFallbackKey = null;
  owner.composeSource = null;
  owner.prevBundleFirstTimeSec = null;
  owner.lastBundleReadyKey = null;
}

export function cancelPhase63FMarketLoad(owner: Phase63FMarketLoadOwnerState): void {
  cancelMarketLoadCycle(owner.controller);
}

export type Phase63FResolveMarketViewResult =
  | { outcome: "ok"; view: RunMarketView; viewIdentity: RunMarketViewIdentity }
  | { outcome: "error"; message: string };

export function resolvePhase63FMarketView(input: {
  report: Parameters<typeof resolveRunMarketView>[0]["report"];
  chartTimeframe: string;
  variant: Parameters<typeof resolveRunMarketView>[0]["variant"];
  reloadToken: number;
}): Phase63FResolveMarketViewResult {
  try {
    const view = resolveRunMarketView(input);
    return { outcome: "ok", view, viewIdentity: buildRunMarketViewIdentity(view) };
  } catch (err) {
    const message =
      err instanceof AnchorStackParseError
        ? err.message
        : "Invalid strategy_spec.anchor_stack in run report";
    return { outcome: "error", message };
  }
}

function buildCoverageResetKey(
  viewIdentity: string,
  selectedTradeEntryTimeMs: number | null,
  focusWindow: MarketDisplayWindowMs,
): string {
  return `${viewIdentity}:${selectedTradeEntryTimeMs ?? "tail"}:${focusWindow.fromMs}:${focusWindow.toMs}:${focusWindow.toOpenTimeMs}`;
}

function marketDisplayWindowsEqual(
  left: MarketDisplayWindowMs | null,
  right: MarketDisplayWindowMs,
): boolean {
  if (left === null) {
    return false;
  }
  return (
    left.fromMs === right.fromMs &&
    left.toMs === right.toMs &&
    left.toOpenTimeMs === right.toOpenTimeMs
  );
}

function resetPhase63FCoverageTargetForFocusChange(owner: Phase63FMarketLoadOwnerState): void {
  owner.coverageTargetWindow = null;
  owner.panPrefetchExpansionKey = null;
  owner.panPrefetchLogKey = null;
  owner.visiblePrefetchSample = null;
  owner.controller.readyTargetKey = null;
  owner.controller.status = "loading";
  owner.prevBundleFirstTimeSec = null;
  owner.composeFallbackKey = null;
}

export function resolvePhase63FMarketTargetWindows(input: {
  owner: Phase63FMarketLoadOwnerState;
  view: RunMarketView;
  viewIdentity: string;
  selectedTradeEntryTimeMs: number | null;
}): {
  focusWindow: MarketDisplayWindowMs;
  coverageWindow: MarketDisplayWindowMs;
  focusWindowKey: string;
  coverageWindowKey: string;
} {
  const focusWindow = resolveMarketTargetWindow(input.view, input.selectedTradeEntryTimeMs);
  const resetKey = buildCoverageResetKey(
    input.viewIdentity,
    input.selectedTradeEntryTimeMs,
    focusWindow,
  );

  if (input.owner.coverageResetKey !== resetKey) {
    input.owner.coverageResetKey = resetKey;
    resetPhase63FCoverageTargetForFocusChange(input.owner);
  }

  const coverageWindow = input.owner.coverageTargetWindow ?? focusWindow;

  return {
    focusWindow,
    coverageWindow,
    focusWindowKey: buildMarketTargetWindowKey(input.viewIdentity, focusWindow),
    coverageWindowKey: buildMarketTargetWindowKey(input.viewIdentity, coverageWindow),
  };
}

export function applyPhase63FPanPrefetchCoverage(
  owner: Phase63FMarketLoadOwnerState,
  expanded: MarketDisplayWindowMs,
): boolean {
  if (marketDisplayWindowsEqual(owner.coverageTargetWindow, expanded)) {
    return false;
  }
  owner.coverageTargetWindow = expanded;
  owner.controller.readyTargetKey = null;
  return true;
}

export function syncPhase63FMarketFocusWindows(input: {
  view: RunMarketView;
  selectedTradeEntryTimeMs: number | null;
  previousFocus: MarketDisplayWindowMs | null;
  previousCoverage: MarketDisplayWindowMs | null;
  owner: Phase63FMarketLoadOwnerState;
}): {
  focusWindow: MarketDisplayWindowMs;
  coverageWindow: MarketDisplayWindowMs;
  focusChanged: boolean;
  coverageChanged: boolean;
} {
  const viewIdentity = buildRunMarketViewIdentity(input.view);
  const resolved = resolvePhase63FMarketTargetWindows({
    owner: input.owner,
    view: input.view,
    viewIdentity,
    selectedTradeEntryTimeMs: input.selectedTradeEntryTimeMs,
  });
  const focusChanged =
    input.previousFocus === null ||
    input.previousFocus.fromMs !== resolved.focusWindow.fromMs ||
    input.previousFocus.toMs !== resolved.focusWindow.toMs ||
    input.previousFocus.toOpenTimeMs !== resolved.focusWindow.toOpenTimeMs;
  const coverageChanged =
    input.previousCoverage === null ||
    input.previousCoverage.fromMs !== resolved.coverageWindow.fromMs ||
    input.previousCoverage.toMs !== resolved.coverageWindow.toMs ||
    input.previousCoverage.toOpenTimeMs !== resolved.coverageWindow.toOpenTimeMs;

  return {
    focusWindow: resolved.focusWindow,
    coverageWindow: resolved.coverageWindow,
    focusChanged,
    coverageChanged,
  };
}

export type Phase63FMarketLoadInput = {
  view: RunMarketView;
  viewIdentity: string;
  focusWindow: MarketDisplayWindowMs;
  coverageWindow: MarketDisplayWindowMs;
  symbol: string;
  timeframe: string;
  signal: AbortSignal;
  onChunkSeeded?: (kind: "candles" | "ema") => void;
};

export async function runPhase63FMarketLoad(
  owner: Phase63FMarketLoadOwnerState,
  input: Phase63FMarketLoadInput,
): Promise<MarketLoadCycleResult> {
  const focusKey = buildMarketTargetWindowKey(input.viewIdentity, input.focusWindow);
  const coverageKey = buildMarketTargetWindowKey(input.viewIdentity, input.coverageWindow);
  const loadGeneration = beginMarketLoadCycle(owner.controller, input.viewIdentity);
  owner.controller.intendedIdentity = input.viewIdentity;

  const focusCandlesReady = marketCandlesReadyForTarget(input.view, input.focusWindow);
  if (focusCandlesReady) {
    dbgMarkCutover(DBG.load.marketFetchCacheHit, "market", {
      viewIdentity: input.viewIdentity,
      candlesCached: true,
      targetFromMs: input.coverageWindow.fromMs,
      targetToMs: input.coverageWindow.toMs,
    });
  }

  dbgMarkCutover(DBG.load.marketFetchStart, "market", {
    key: coverageKey,
    candlesCached: focusCandlesReady,
    targetFromMs: input.coverageWindow.fromMs,
    targetToMs: input.coverageWindow.toMs,
  });

  const result = await runMarketLoadCycle(owner.controller, {
    view: input.view,
    viewIdentity: input.viewIdentity,
    focusWindow: input.focusWindow,
    coverageWindow: input.coverageWindow,
    focusKey,
    coverageKey,
    symbol: input.symbol,
    timeframe: input.timeframe,
    signal: input.signal,
    loadGeneration,
    executeLoad: async (loadInput) => {
      const loadResult = await executeMarketWindowLoad({
        ...loadInput,
        onChunkSeeded: (kind) => {
          loadInput.onChunkSeeded?.(kind);
          input.onChunkSeeded?.(kind);
        },
      });
      dbgMarkCutover(DBG.load.marketFetchEnd, "market", {
        key: coverageKey,
        candlesFetched: loadResult.candlesFetched,
        emaFetched: loadResult.emaFetched,
      });
      return loadResult;
    },
  });

  return result;
}

export function resolvePhase63FMarketBundleSnapshot(input: {
  owner: Phase63FMarketLoadOwnerState;
  view: RunMarketView | null;
  focusWindow: MarketDisplayWindowMs | null;
  coverageWindow: MarketDisplayWindowMs | null;
  focusWindowKey: string | null;
  marketLoadStatus: RuntimeLoadStatus;
  marketLoadError: string | null;
}): MarketBundleRuntimeOutput {
  const snapshot = resolveMarketBundleRuntime({
    view: input.view,
    focusWindow: input.focusWindow,
    coverageWindow: input.coverageWindow,
    focusWindowKey: input.focusWindowKey,
    marketLoadStatus: input.marketLoadStatus,
    marketLoadError: input.marketLoadError,
  });

  input.owner.composeSource = snapshot.composeSource;

  if (
    input.marketLoadStatus === "ready" &&
    snapshot.bundle !== null &&
    snapshot.foundationKey !== null &&
    input.owner.lastBundleReadyKey !== snapshot.foundationKey
  ) {
    input.owner.lastBundleReadyKey = snapshot.foundationKey;
    dbgMarkCutover(DBG.load.marketBundleReady, "market", {
      barCount: snapshot.bundle.candles.length,
      anchorEmaOverlayCount: snapshot.bundle.ema_overlays.length,
    });
  }

  return snapshot;
}

export function logPhase63FComposeFocusFallback(
  owner: Phase63FMarketLoadOwnerState,
  input: {
    focusWindow: MarketDisplayWindowMs;
    coverageWindow: MarketDisplayWindowMs;
    focusWindowKey: string;
    coverageWindowKey: string;
    candlesRevision: number;
  },
): void {
  if (owner.composeSource === "focus" && input.focusWindowKey !== input.coverageWindowKey) {
    const fallbackKey = `${input.coverageWindowKey}:${input.candlesRevision}`;
    if (fallbackKey !== owner.composeFallbackKey) {
      owner.composeFallbackKey = fallbackKey;
      dbgMarkCutover(DBG.market.composeFocusFallback, "market", {
        focusFromMs: input.focusWindow.fromMs,
        focusToMs: input.focusWindow.toMs,
        coverageFromMs: input.coverageWindow.fromMs,
        coverageToMs: input.coverageWindow.toMs,
      });
    }
  } else if (owner.composeSource === "coverage") {
    owner.composeFallbackKey = null;
  }
}

export type Phase63FPanPrefetchResult = {
  expanded: MarketDisplayWindowMs | null;
  shouldApply: boolean;
  visibleSampleChanged: boolean;
  visibleSample: string | null;
};

export function evaluatePhase63FPanPrefetch(
  owner: Phase63FMarketLoadOwnerState,
  input: {
    view: RunMarketView;
    coverageWindow: MarketDisplayWindowMs;
    visibleFromSec: number;
    visibleToSec: number;
    chartTimeframeMs: number;
    forceUserPan?: boolean;
    isUserPan: boolean;
    visibleSample: string;
  },
): Phase63FPanPrefetchResult {
  if (input.visibleSample === owner.visiblePrefetchSample) {
    return {
      expanded: null,
      shouldApply: false,
      visibleSampleChanged: false,
      visibleSample: owner.visiblePrefetchSample,
    };
  }
  owner.visiblePrefetchSample = input.visibleSample;

  const decision = evaluateMarketPanPrefetchExpansion({
    targetWindow: input.coverageWindow,
    visibleFromSec: input.visibleFromSec,
    visibleToSec: input.visibleToSec,
    reportFromMs: input.view.fromOpenTimeMs,
    reportToMs: input.view.toOpenTimeMs,
    timeframeMs: input.chartTimeframeMs,
    isUserPan: input.forceUserPan === true || input.isUserPan,
  });

  const logKey = `${decision.reason}:${decision.meta.expanded_from_ms ?? "x"}:${decision.meta.expanded_to_ms ?? "x"}`;
  if (logKey !== owner.panPrefetchLogKey) {
    owner.panPrefetchLogKey = logKey;
    dbgMarkCutover(DBG.market.panPrefetchDecision, "market", {
      reason: decision.reason,
      ...decision.meta,
    });
  }

  if (decision.expanded === null) {
    return {
      expanded: null,
      shouldApply: false,
      visibleSampleChanged: true,
      visibleSample: input.visibleSample,
    };
  }

  const expansionKey = `${decision.expanded.fromMs}:${decision.expanded.toMs}:${decision.expanded.toOpenTimeMs}`;
  if (expansionKey === owner.panPrefetchExpansionKey) {
    return {
      expanded: null,
      shouldApply: false,
      visibleSampleChanged: true,
      visibleSample: input.visibleSample,
    };
  }
  owner.panPrefetchExpansionKey = expansionKey;

  return {
    expanded: decision.expanded,
    shouldApply: true,
    visibleSampleChanged: true,
    visibleSample: input.visibleSample,
  };
}

export function resolvePhase63FMarketReactSync(owner: Phase63FMarketLoadOwnerState): {
  marketLoadStatus: RuntimeLoadStatus;
  marketError: string | null;
  runMarketViewIdentity: string | null;
} {
  return {
    marketLoadStatus: owner.controller.status,
    marketError: owner.controller.error,
    runMarketViewIdentity: owner.controller.readyIdentity,
  };
}

export function marketBundleFromSnapshot(
  snapshot: MarketBundleRuntimeOutput,
): ChartMarketBundle | undefined {
  return snapshot.bundle ?? undefined;
}
