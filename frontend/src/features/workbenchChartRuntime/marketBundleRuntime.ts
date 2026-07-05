import type { ChartMarketBundle } from "@/api/types";
import { candleRangeMs } from "@/features/chart/chartMarkers";
import { getCandles } from "@/features/chart/marketResourceCache";
import {
  composeDisplayMarketWindowBundle,
  type MarketBundleComposeSource,
  type RunMarketView,
} from "@/features/chart/runMarketView";
import {
  marketCandlesReadyForTarget,
  type MarketDisplayWindowMs,
} from "@/features/chart/workbenchMarketLoad";

import type { ChartRuntimeMarketOutput, RuntimeCandlesSource, RuntimeLoadStatus } from "./runtimeTypes";

export type RuntimeMarketBundleDebug = {
  displayBundle: {
    range: { min: number; max: number } | null;
    count: number;
    source: MarketBundleComposeSource | null;
  };
  cachedCandles: { range: { min: number; max: number } | null; count: number };
  fetchedCandles: { range: { min: number; max: number } | null; count: number };
};

export type MarketBundleRuntimeInput = {
  view: RunMarketView | null;
  focusWindow: MarketDisplayWindowMs | null;
  coverageWindow: MarketDisplayWindowMs | null;
  focusWindowKey: string | null;
  marketLoadStatus: RuntimeLoadStatus;
  marketLoadError?: string | null;
};

export type MarketBundleRuntimeOutput = {
  implemented: true;
  bundle: ChartMarketBundle | null;
  composeSource: MarketBundleComposeSource | null;
  foundationKey: string | null;
  market: ChartRuntimeMarketOutput;
  debug: RuntimeMarketBundleDebug;
};

export type MarketBundleRuntimeInactiveBoundary = {
  implemented: false;
  foundationKey: null;
  market: ChartRuntimeMarketOutput;
  debug: RuntimeMarketBundleDebug;
};

export type MarketBundleRuntimeBoundary =
  | MarketBundleRuntimeInactiveBoundary
  | MarketBundleRuntimeOutput;

function emptyRangeCount(): { range: null; count: 0 } {
  return { range: null, count: 0 };
}

function emptyMarketBundleDebug(): RuntimeMarketBundleDebug {
  const empty = emptyRangeCount();
  return {
    displayBundle: { ...empty, source: null },
    cachedCandles: empty,
    fetchedCandles: empty,
  };
}

function candlesRangeCount(candles: { time: number }[] | undefined): {
  range: { min: number; max: number } | null;
  count: number;
} {
  if (candles === undefined || candles.length === 0) {
    return { range: null, count: 0 };
  }
  return { range: candleRangeMs(candles), count: candles.length };
}

function deriveMarketOutput(
  bundle: ChartMarketBundle | null | undefined,
  marketLoadStatus: RuntimeLoadStatus,
  marketLoadError: string | null,
): ChartRuntimeMarketOutput {
  const candlesCount = bundle?.candles.length ?? 0;
  const fullCandleRange =
    bundle !== null && bundle !== undefined ? candleRangeMs(bundle.candles) : null;
  const candlesSource: RuntimeCandlesSource =
    bundle !== undefined && bundle !== null && marketLoadStatus !== "error"
      ? "market"
      : "unavailable";

  return {
    status: marketLoadStatus,
    error: marketLoadError,
    candlesSource,
    candlesCount,
    fullCandleRange,
  };
}

/** Mirrors WorkbenchContext render-window foundation key semantics. */
export function resolveRenderWindowFoundationKey(input: {
  view: RunMarketView | null;
  focusWindow: MarketDisplayWindowMs | null;
  focusWindowKey: string | null;
  marketLoadStatus: RuntimeLoadStatus;
}): string | null {
  if (
    input.view === null ||
    input.focusWindow === null ||
    input.focusWindowKey === null ||
    input.marketLoadStatus !== "ready"
  ) {
    return null;
  }
  const candles = getCandles(
    input.view.candlesKey,
    input.focusWindow.fromMs,
    input.focusWindow.toMs,
  );
  if (candles === undefined || candles.length === 0) {
    return null;
  }
  return `${input.focusWindowKey}:${candles.length}`;
}

/**
 * Display bundle composition with focus fallback — read-only cache access via
 * existing `composeDisplayMarketWindowBundle()` semantics.
 */
export function resolveMarketBundleRuntime(
  input: MarketBundleRuntimeInput,
): MarketBundleRuntimeOutput {
  const marketLoadError = input.marketLoadError ?? null;
  const emptyDebug = emptyMarketBundleDebug();

  if (
    input.view === null ||
    input.focusWindow === null ||
    input.coverageWindow === null
  ) {
    return {
      implemented: true,
      bundle: null,
      composeSource: null,
      foundationKey: null,
      market: deriveMarketOutput(null, input.marketLoadStatus, marketLoadError),
      debug: emptyDebug,
    };
  }

  const { view, focusWindow, coverageWindow } = input;

  const cachedCandles = candlesRangeCount(
    getCandles(view.candlesKey, coverageWindow.fromMs, coverageWindow.toMs),
  );
  const fetchedCandles = candlesRangeCount(
    getCandles(view.candlesKey, focusWindow.fromMs, focusWindow.toMs),
  );

  const foundationKey = resolveRenderWindowFoundationKey({
    view,
    focusWindow,
    focusWindowKey: input.focusWindowKey,
    marketLoadStatus: input.marketLoadStatus,
  });

  const debugWithoutDisplay: Omit<RuntimeMarketBundleDebug, "displayBundle"> = {
    cachedCandles,
    fetchedCandles,
  };

  if (input.marketLoadStatus === "error") {
    return {
      implemented: true,
      bundle: null,
      composeSource: null,
      foundationKey: null,
      market: deriveMarketOutput(null, "error", marketLoadError),
      debug: {
        ...debugWithoutDisplay,
        displayBundle: { range: null, count: 0, source: null },
      },
    };
  }

  if (!marketCandlesReadyForTarget(view, focusWindow)) {
    return {
      implemented: true,
      bundle: null,
      composeSource: null,
      foundationKey: null,
      market: deriveMarketOutput(null, input.marketLoadStatus, marketLoadError),
      debug: {
        ...debugWithoutDisplay,
        displayBundle: { range: null, count: 0, source: null },
      },
    };
  }

  const composed = composeDisplayMarketWindowBundle(view, focusWindow, coverageWindow);
  if (composed === null) {
    return {
      implemented: true,
      bundle: null,
      composeSource: null,
      foundationKey,
      market: deriveMarketOutput(null, input.marketLoadStatus, marketLoadError),
      debug: {
        ...debugWithoutDisplay,
        displayBundle: { range: null, count: 0, source: null },
      },
    };
  }

  const displayRange = candleRangeMs(composed.bundle.candles);
  return {
    implemented: true,
    bundle: composed.bundle,
    composeSource: composed.source,
    foundationKey,
    market: deriveMarketOutput(composed.bundle, input.marketLoadStatus, marketLoadError),
    debug: {
      cachedCandles,
      fetchedCandles,
      displayBundle: {
        range: displayRange,
        count: composed.bundle.candles.length,
        source: composed.source,
      },
    },
  };
}

export function createMarketBundleRuntimeBoundary(): MarketBundleRuntimeInactiveBoundary {
  return {
    implemented: false,
    foundationKey: null,
    market: {
      status: "idle",
      error: null,
      candlesSource: "unavailable",
      candlesCount: 0,
      fullCandleRange: null,
    },
    debug: emptyMarketBundleDebug(),
  };
}
