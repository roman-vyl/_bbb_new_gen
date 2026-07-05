import type {
  ChartAuxEmaOverlay,
  ChartBar,
  ChartEmaOverlay,
  ChartMarketBundle,
} from "@/api/types";
import {
  buildAuxOverlaysStabilizeKey,
  buildEmaOverlaysStabilizeKey,
  buildRenderWindowBoundsKey,
  stabilizeByWindowBoundsKey,
} from "@/features/chart/chartRenderWindowDisplay";
import type { ChartDataWindowManager } from "@/features/chart/chartDataWindowManager";

import type { ChartRuntimeModelParts, RuntimeLoadStatus } from "./runtimeTypes";
import type { RenderWindowRuntimeController } from "./renderWindowRuntime";

export type ChartWindowRuntimeResult = {
  implemented: true;
  parts: ChartRuntimeModelParts;
  firstTimeSec: number | null;
  lastTimeSec: number | null;
  count: number;
  seriesKey: string;
};

export type ChartWindowRuntimeInactiveResult = {
  implemented: false;
  parts: ChartRuntimeModelParts;
  firstTimeSec: null;
  lastTimeSec: null;
  count: 0;
  seriesKey: null;
};

export type ChartWindowRuntimeBoundary = ChartWindowRuntimeResult | ChartWindowRuntimeInactiveResult;

const EMPTY_PARTS: ChartRuntimeModelParts = {
  candles: [],
  emaOverlays: [],
  auxEmaOverlays: [],
  componentEvents: [],
};

export type ChartWindowStabilizeCaches = {
  candles: { current: { key: string; value: ChartBar[] } };
  ema: { current: { key: string; value: ChartEmaOverlay[] } };
  aux: { current: { key: string; value: ChartAuxEmaOverlay[] } };
};

export function createChartWindowStabilizeCaches(): ChartWindowStabilizeCaches {
  return {
    candles: { current: { key: "", value: [] } },
    ema: { current: { key: "", value: [] } },
    aux: { current: { key: "", value: [] } },
  };
}

/** Mirrors WorkbenchContext chartWindowSlice memo using existing manager slice semantics. */
export function resolveChartWindowRuntime(input: {
  bundle: ChartMarketBundle | null;
  marketLoadStatus: RuntimeLoadStatus;
  manager: ChartDataWindowManager;
  auxEmaOverlays: readonly ChartAuxEmaOverlay[];
  marketIdentity: string | null;
  stabilizeCaches?: ChartWindowStabilizeCaches;
}): ChartWindowRuntimeBoundary {
  if (input.bundle === null || input.marketLoadStatus === "error") {
    return {
      implemented: false,
      parts: EMPTY_PARTS,
      firstTimeSec: null,
      lastTimeSec: null,
      count: 0,
      seriesKey: null,
    };
  }

  const manager = input.manager;
  manager.setFullLength(input.bundle.candles.length);
  const anchorEmaOverlays = input.bundle.ema_overlays;
  const rawCandles = manager.sliceCandles(input.bundle.candles);
  const rawEma = manager.sliceEmaOverlays(anchorEmaOverlays, input.bundle.candles);
  const rawAux = manager.sliceAuxOverlays(input.auxEmaOverlays, input.bundle.candles);
  const count = rawCandles.length;
  const firstTimeSec = count > 0 ? rawCandles[0]!.time : null;
  const lastTimeSec = count > 0 ? rawCandles[count - 1]!.time : null;
  const boundsKey = buildRenderWindowBoundsKey(firstTimeSec, lastTimeSec, count);
  const emaStabilizeKey = buildEmaOverlaysStabilizeKey(
    boundsKey,
    rawEma,
    input.marketIdentity ?? "",
  );
  const auxStabilizeKey = buildAuxOverlaysStabilizeKey(boundsKey, rawAux);

  const caches = input.stabilizeCaches ?? createChartWindowStabilizeCaches();
  const candles = stabilizeByWindowBoundsKey(caches.candles, boundsKey, rawCandles);
  const emaOverlays = stabilizeByWindowBoundsKey(caches.ema, emaStabilizeKey, rawEma);
  const auxEmaOverlays = stabilizeByWindowBoundsKey(caches.aux, auxStabilizeKey, rawAux);

  return {
    implemented: true,
    parts: {
      candles,
      emaOverlays,
      auxEmaOverlays,
      componentEvents: [],
    },
    firstTimeSec,
    lastTimeSec,
    count,
    seriesKey: boundsKey,
  };
}

export function resolveChartWindowFromRenderController(input: {
  bundle: ChartMarketBundle | null;
  marketLoadStatus: RuntimeLoadStatus;
  renderController: RenderWindowRuntimeController;
  auxEmaOverlays: readonly ChartAuxEmaOverlay[];
  marketIdentity: string | null;
  stabilizeCaches?: ChartWindowStabilizeCaches;
}): ChartWindowRuntimeBoundary {
  const manager = input.renderController.chartRuntime.renderWindow.getManager();
  return resolveChartWindowRuntime({
    bundle: input.bundle,
    marketLoadStatus: input.marketLoadStatus,
    manager,
    auxEmaOverlays: input.auxEmaOverlays,
    marketIdentity: input.marketIdentity,
    stabilizeCaches: input.stabilizeCaches,
  });
}

export function createChartWindowRuntimeBoundary(): ChartWindowRuntimeInactiveResult {
  return {
    implemented: false,
    parts: EMPTY_PARTS,
    firstTimeSec: null,
    lastTimeSec: null,
    count: 0,
    seriesKey: null,
  };
}
