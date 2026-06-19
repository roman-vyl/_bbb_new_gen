import { ApiError } from "@/api/client";
import { dbgMark, PIPELINE_DEBUG_STEPS as DBG } from "@/shared/diagnostics/pipelineDebug";

import {
  buildChartEventsRequestKey,
  buildTraceRequestKey,
  type TraceFetchParams,
  type TraceRequestKey,
} from "@/features/chart/runtime/signalTraceRequestCoordinator";

export type ChartEventsFallbackReason = "endpoint_404" | "http_error" | "flag_disabled" | "parse_error";

export type ChartEventsMergeSource = "chart-events" | "signal-trace-fallback";

let flagDisabledNoted = false;

export function isChartEventsApiEnabled(): boolean {
  return import.meta.env.VITE_CHART_EVENTS_API === "1";
}

export function buildDisplayTraceRequestKey(params: TraceFetchParams): TraceRequestKey {
  return isChartEventsApiEnabled() ? buildChartEventsRequestKey(params) : buildTraceRequestKey(params);
}

export function noteChartEventsFlagDisabledOnce(): void {
  if (flagDisabledNoted) {
    return;
  }
  flagDisabledNoted = true;
  dbgMark(DBG.chartEvents.fallback, { reason: "flag_disabled" satisfies ChartEventsFallbackReason });
}

export function chartEventsFallbackReasonFromError(err: unknown): ChartEventsFallbackReason {
  if (err instanceof ApiError) {
    if (err.status === 404) {
      return "endpoint_404";
    }
    return "http_error";
  }
  return "parse_error";
}

/** Test helper — reset session-scoped flag_disabled mark. */
export function resetChartEventsFlagDisabledNoteForTests(): void {
  flagDisabledNoted = false;
}
