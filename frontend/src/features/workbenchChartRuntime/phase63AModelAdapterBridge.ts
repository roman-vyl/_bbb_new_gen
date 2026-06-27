import type { ChartAuxEmaOverlay, ComponentEvent } from "@/api/types";
import type { ChartViewWindow } from "@/features/chart/chartViewWindow";
import type { TraceDisplayState } from "@/features/chart/traceDisplayApply";
import { dbgMarkCutover } from "./chartRuntimeCutoverTelemetry";
import {
  createChartModelStabilizeCache,
  resolveChartModelRuntime,
  type ChartModelStabilizeCache,
} from "./chartModelRuntime";
import type { AuxOverlayRuntimeBoundary } from "./auxOverlayRuntime";
import type { TraceDisplayRuntimeBoundary } from "./traceDisplayRuntime";
import type { ChartRuntimeModelParts } from "./runtimeTypes";
import type { ChartViewModel } from "@/features/chart/runtime/chartViewModel";

export const PHASE_63A_MODEL_ADAPTER_APPLY_STEP = "wb.model_adapter.apply";

export type OldPipelineModelBridgeInput = {
  chartView: Pick<
    ChartViewWindow,
    | "candles"
    | "emaOverlays"
    | "auxEmaOverlays"
    | "mode"
    | "centerTimeSec"
    | "firstTimeSec"
    | "lastTimeSec"
    | "count"
  >;
  chartDisplayAuxEmaOverlays: ChartAuxEmaOverlay[];
  chartDisplayComponentEvents: ComponentEvent[];
  htfAuxEmaOverlayStale: boolean;
  componentEventsStale: boolean;
  traceDisplayState: Pick<TraceDisplayState, "status" | "missingRange">;
};

export type Phase63AModelRuntimeSlice = {
  chartViewModel: ChartViewModel;
};

export function buildChartModelRuntimeInputFromOldPipeline(
  input: OldPipelineModelBridgeInput,
): {
  chartWindowParts: ChartRuntimeModelParts;
  displayAuxEmaOverlays: ChartAuxEmaOverlay[];
  traceDisplay: TraceDisplayRuntimeBoundary;
  auxOverlay: AuxOverlayRuntimeBoundary;
  viewMode: ChartViewWindow["mode"];
  centerTimeSec: number | null;
  firstTimeSec: number | null;
  lastTimeSec: number | null;
  count: number;
} {
  const traceDisplayState: TraceDisplayState = {
    status: input.traceDisplayState.status,
    missingRange: input.traceDisplayState.missingRange,
    fromSec: input.chartView.firstTimeSec ?? 0,
    toSec: input.chartView.lastTimeSec ?? 0,
    events: input.chartDisplayComponentEvents,
    htfSlice: { times: [], htf_context: undefined },
    coveredRanges: [],
  };

  return {
    chartWindowParts: {
      candles: input.chartView.candles,
      emaOverlays: input.chartView.emaOverlays,
      auxEmaOverlays: input.chartView.auxEmaOverlays,
      componentEvents: input.chartDisplayComponentEvents,
    },
    displayAuxEmaOverlays: input.chartDisplayAuxEmaOverlays,
    traceDisplay: {
      implemented: true,
      status: "idle",
      componentEvents: input.chartDisplayComponentEvents,
      componentEventsStale: input.componentEventsStale,
      displayApplyRevision: 0,
      missingRange: input.traceDisplayState.missingRange,
      traceDisplayState,
      displayCacheCoversWindow: false,
      displayCacheHasWindowData: false,
    },
    auxOverlay: {
      implemented: false,
      auxEmaOverlays: input.chartView.auxEmaOverlays,
      displayAuxEmaOverlays: input.chartDisplayAuxEmaOverlays,
      htfAuxEmaOverlayStale: input.htfAuxEmaOverlayStale,
    },
    viewMode: input.chartView.mode,
    centerTimeSec: input.chartView.centerTimeSec,
    firstTimeSec: input.chartView.firstTimeSec,
    lastTimeSec: input.chartView.lastTimeSec,
    count: input.chartView.count,
  };
}

export function resolvePhase63AModelRuntimeSlice(
  input: OldPipelineModelBridgeInput,
  stabilizeCache?: ChartModelStabilizeCache,
): Phase63AModelRuntimeSlice {
  const modelRuntimeInput = buildChartModelRuntimeInputFromOldPipeline(input);
  const boundary = resolveChartModelRuntime({
    ...modelRuntimeInput,
    ...(stabilizeCache !== undefined ? { stabilizeCache } : {}),
  });

  dbgMarkCutover(PHASE_63A_MODEL_ADAPTER_APPLY_STEP, "model", {
    seriesKey: boundary.chartViewModel.seriesKey,
    barCount: boundary.chartViewModel.count,
    viewMode: boundary.chartViewModel.viewMode,
  });

  return { chartViewModel: boundary.chartViewModel };
}
