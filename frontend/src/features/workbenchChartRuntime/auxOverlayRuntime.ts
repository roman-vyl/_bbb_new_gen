import type {
  ChartAuxEmaOverlay,
  ChartBar,
  HtfContextTrace,
  RunReport,
  RunVariant,
  SignalTraceBundle,
} from "@/api/types";
import { fetchChartOverlayEma } from "@/api/client";
import { anchorStackPeriodsFromStrategySpec } from "@/features/chart/anchorStackFromSpec";
import { mergeAuxOverlayPoints } from "@/features/chart/chartAuxEmaOverlays";
import {
  displayAuxOverlaysForRenderWindow,
  frozenHtfOverlaysForStorage,
} from "@/features/chart/chartRenderWindowDisplay";
import type { HtfContextTraceSlice } from "@/features/chart/signalTraceDisplayCache";
import {
  auxOverlayFromHtfSlice,
  auxOverlayFromHtfTrace,
  collectAuxEmaSpecs,
  type AuxEmaSpec,
} from "@/features/chart/strategySpecAuxEma";
import type { SignalTraceLoadStatus } from "@/shared/context/signalTraceLoadPolicy";
import { signalTraceMatchesChartWindow } from "@/shared/context/signalTraceLoadPolicy";

export type AuxOverlayRuntimeSnapshot = {
  implemented: true;
  auxEmaOverlays: ChartAuxEmaOverlay[];
  displayAuxEmaOverlays: ChartAuxEmaOverlay[];
  htfAuxEmaOverlayStale: boolean;
  auxOverlayCount: number;
  htfOverlayCount: number;
  auxEmaSpecs: AuxEmaSpec[];
};

export type AuxOverlayRuntimeInactiveSnapshot = {
  implemented: false;
  auxEmaOverlays: ChartAuxEmaOverlay[];
  displayAuxEmaOverlays: ChartAuxEmaOverlay[];
  htfAuxEmaOverlayStale: boolean;
};

export type AuxOverlayRuntimeBoundary =
  | AuxOverlayRuntimeInactiveSnapshot
  | AuxOverlayRuntimeSnapshot;

export type AuxOverlayRuntimeController = {
  auxEmaOverlays: ChartAuxEmaOverlay[];
  frozenHtfOverlays: ChartAuxEmaOverlay[];
  auxEmaSpecs: AuxEmaSpec[];
};

export function createAuxOverlayRuntimeController(): AuxOverlayRuntimeController {
  return {
    auxEmaOverlays: [],
    frozenHtfOverlays: [],
    auxEmaSpecs: [],
  };
}

export function resolveAuxEmaSpecsRuntime(input: {
  selectedVariant: RunVariant | null;
  chartTimeframe: string;
  effectiveContextOverlayRef: string | null;
}): AuxEmaSpec[] {
  if (input.selectedVariant === null) {
    return [];
  }
  try {
    const periods = anchorStackPeriodsFromStrategySpec(input.selectedVariant.strategy_spec);
    return collectAuxEmaSpecs(
      input.selectedVariant.strategy_spec,
      input.chartTimeframe,
      periods,
      input.effectiveContextOverlayRef,
    );
  } catch {
    return [];
  }
}

export function syncAuxOverlaySpecs(
  controller: AuxOverlayRuntimeController,
  specs: AuxEmaSpec[],
): void {
  controller.auxEmaSpecs = specs;
}

export function resetAuxOverlayRuntime(controller: AuxOverlayRuntimeController): void {
  controller.auxEmaOverlays = [];
  controller.frozenHtfOverlays = [];
}

export function applyHtfOverlaysFromDisplaySlice(
  controller: AuxOverlayRuntimeController,
  htfSlice: { times: number[]; htf_context?: HtfContextTrace },
): void {
  const htfSpecs = controller.auxEmaSpecs.filter((spec) => spec.source === "htf_trace");
  if (htfSpecs.length === 0 || htfSlice.times.length === 0 || !htfSlice.htf_context) {
    return;
  }
  const htfOverlays = htfSpecs
    .map((spec) => auxOverlayFromHtfSlice(spec, htfSlice.times, htfSlice.htf_context!))
    .filter((overlay): overlay is ChartAuxEmaOverlay => overlay !== null);
  if (htfOverlays.length === 0) {
    return;
  }
  controller.frozenHtfOverlays = htfOverlays;
  const nonHtf = controller.auxEmaOverlays.filter((overlay) => !overlay.id.startsWith("htf_"));
  controller.auxEmaOverlays = mergeAuxOverlayPoints(nonHtf, htfOverlays);
}

export function applyHtfOverlaysFromDenseTrace(
  controller: AuxOverlayRuntimeController,
  trace: SignalTraceBundle,
): void {
  const htfOverlays = controller.auxEmaSpecs
    .filter((spec) => spec.source === "htf_trace")
    .map((spec) => auxOverlayFromHtfTrace(spec, trace))
    .filter((overlay): overlay is ChartAuxEmaOverlay => overlay !== null);
  controller.frozenHtfOverlays = htfOverlays;
  const nonHtf = controller.auxEmaOverlays.filter((overlay) => !overlay.id.startsWith("htf_"));
  controller.auxEmaOverlays = mergeAuxOverlayPoints(nonHtf, htfOverlays);
}

export function resolveHtfAuxEmaOverlayStale(input: {
  auxEmaSpecs: AuxEmaSpec[];
  auxEmaOverlays: ChartAuxEmaOverlay[];
  displayCacheCoversWindow: boolean;
  displayCacheHasWindowData: boolean;
  signalTraceStatus: SignalTraceLoadStatus;
}): boolean {
  const hasHtfSpecs = input.auxEmaSpecs.some((spec) => spec.source === "htf_trace");
  if (!hasHtfSpecs) {
    return false;
  }
  if (input.displayCacheCoversWindow) {
    return false;
  }
  if (input.signalTraceStatus === "loading") {
    return (
      input.displayCacheHasWindowData ||
      input.auxEmaOverlays.some((overlay) => overlay.id.startsWith("htf_"))
    );
  }
  return (
    input.displayCacheHasWindowData ||
    input.auxEmaOverlays.some((overlay) => overlay.id.startsWith("htf_"))
  );
}

export function resolveDisplayAuxEmaOverlays(input: {
  slicedAuxOverlays: readonly ChartAuxEmaOverlay[];
  frozenHtfOverlays: readonly ChartAuxEmaOverlay[];
  traceMatchesWindow: boolean;
  renderWindowCandles: readonly ChartBar[];
  controller: AuxOverlayRuntimeController;
}): ChartAuxEmaOverlay[] {
  const display = displayAuxOverlaysForRenderWindow(
    input.slicedAuxOverlays,
    input.frozenHtfOverlays,
    input.traceMatchesWindow,
    input.renderWindowCandles,
  );

  if (input.traceMatchesWindow) {
    const htfForStorage = frozenHtfOverlaysForStorage(input.slicedAuxOverlays);
    if (htfForStorage.some((overlay) => overlay.points.length > 0)) {
      input.controller.frozenHtfOverlays = htfForStorage;
    }
  }

  return display;
}

export function resolveAuxOverlayRuntimeSnapshot(input: {
  controller: AuxOverlayRuntimeController;
  slicedAuxOverlays: readonly ChartAuxEmaOverlay[];
  renderWindowCandles: readonly ChartBar[];
  chartWindowKey: string | null;
  loadedSignalTraceWindowKey: string | null;
  displayCacheCoversWindow: boolean;
  displayCacheHasWindowData: boolean;
  signalTraceStatus: SignalTraceLoadStatus;
  htfSlice?: HtfContextTraceSlice;
}): AuxOverlayRuntimeBoundary {
  if (input.renderWindowCandles.length === 0) {
    return {
      implemented: false,
      auxEmaOverlays: input.controller.auxEmaOverlays,
      displayAuxEmaOverlays: [],
      htfAuxEmaOverlayStale: false,
    };
  }

  const traceMatchesWindow = signalTraceMatchesChartWindow(
    input.chartWindowKey,
    input.loadedSignalTraceWindowKey,
  );

  if (
    input.htfSlice !== undefined &&
    input.htfSlice.times.length > 0 &&
    input.htfSlice.htf_context
  ) {
    applyHtfOverlaysFromDisplaySlice(input.controller, input.htfSlice);
  }

  const displayAuxEmaOverlays = resolveDisplayAuxEmaOverlays({
    slicedAuxOverlays: input.slicedAuxOverlays,
    frozenHtfOverlays: input.controller.frozenHtfOverlays,
    traceMatchesWindow,
    renderWindowCandles: input.renderWindowCandles,
    controller: input.controller,
  });

  const htfAuxEmaOverlayStale = resolveHtfAuxEmaOverlayStale({
    auxEmaSpecs: input.controller.auxEmaSpecs,
    auxEmaOverlays: input.controller.auxEmaOverlays,
    displayCacheCoversWindow: input.displayCacheCoversWindow,
    displayCacheHasWindowData: input.displayCacheHasWindowData,
    signalTraceStatus: input.signalTraceStatus,
  });

  const htfOverlayCount = displayAuxEmaOverlays.filter((overlay) =>
    overlay.id.startsWith("htf_"),
  ).length;

  return {
    implemented: true,
    auxEmaOverlays: input.controller.auxEmaOverlays,
    displayAuxEmaOverlays,
    htfAuxEmaOverlayStale,
    auxOverlayCount: input.controller.auxEmaOverlays.length,
    htfOverlayCount,
    auxEmaSpecs: input.controller.auxEmaSpecs,
  };
}

export type BffAuxOverlayLoadResult =
  | { outcome: "loaded"; overlays: ChartAuxEmaOverlay[] }
  | { outcome: "skipped"; reason: "no_specs" | "market_not_ready" | "heavy_io_off" }
  | { outcome: "aborted" }
  | { outcome: "error" };

export async function loadBffAuxOverlaysRuntime(
  controller: AuxOverlayRuntimeController,
  input: {
    chartHeavyIoEnabled: boolean;
    marketLoadStatus: "idle" | "loading" | "ready" | "error";
    report: RunReport | null;
    chartTimeframe: string;
    signal?: AbortSignal;
    fetchOverlayEma?: typeof fetchChartOverlayEma;
  },
): Promise<BffAuxOverlayLoadResult> {
  if (!input.chartHeavyIoEnabled) {
    return { outcome: "skipped", reason: "heavy_io_off" };
  }
  if (input.marketLoadStatus !== "ready" || input.report === null || controller.auxEmaSpecs.length === 0) {
    controller.auxEmaOverlays = [];
    return { outcome: "skipped", reason: "market_not_ready" };
  }

  const bffSpecs = controller.auxEmaSpecs.filter((spec) => spec.source === "bff");
  if (bffSpecs.length === 0) {
    controller.auxEmaOverlays = controller.auxEmaOverlays.filter((overlay) =>
      overlay.id.startsWith("htf_"),
    );
    return { outcome: "skipped", reason: "no_specs" };
  }

  const fetcher = input.fetchOverlayEma ?? fetchChartOverlayEma;
  const snapshot = input.report;
  const fromMs = snapshot.data_range.from_open_time_ms;
  const toOpenTimeMs = snapshot.data_range.to_open_time_ms;

  try {
    const loaded = await Promise.all(
      bffSpecs.map(async (spec) => {
        const points = await fetcher({
          symbol: snapshot.symbol,
          timeframe: input.chartTimeframe,
          period: spec.period,
          fromMs,
          toOpenTimeMs,
          signal: input.signal,
        });
        return {
          id: spec.id,
          label: spec.label,
          period: spec.period,
          timeframe: spec.timeframe,
          points,
          dashed: false,
        } satisfies ChartAuxEmaOverlay;
      }),
    );
    if (input.signal?.aborted) {
      return { outcome: "aborted" };
    }
    const htfOnly = controller.auxEmaOverlays.filter((overlay) => overlay.id.startsWith("htf_"));
    controller.auxEmaOverlays = mergeAuxOverlayPoints(htfOnly, loaded);
    return { outcome: "loaded", overlays: controller.auxEmaOverlays };
  } catch {
    if (input.signal?.aborted) {
      return { outcome: "aborted" };
    }
    controller.auxEmaOverlays = controller.auxEmaOverlays.filter((overlay) =>
      overlay.id.startsWith("htf_"),
    );
    return { outcome: "error" };
  }
}

export function countHtfOverlayPoints(overlays: readonly ChartAuxEmaOverlay[]): number {
  return overlays.reduce((total, overlay) => total + overlay.points.length, 0);
}

export function updateTraceDisplayHtfPointCount(
  controller: AuxOverlayRuntimeController,
  displayController: { lastSlicedHtfOverlayPointCount: number },
): void {
  displayController.lastSlicedHtfOverlayPointCount = countHtfOverlayPoints(
    controller.frozenHtfOverlays,
  );
}
