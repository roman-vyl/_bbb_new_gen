import {
  buildDisplayTraceRequestKey,
  isChartEventsApiEnabled,
  type ChartEventsFallbackReason,
} from "@/features/chart/runtime/chartEventsLoad";
import type { DisplayLoadOutcome } from "@/features/chart/runtime/workbenchTraceNetworkLoad";
import type { DisplayTraceChunkLoadResult } from "@/features/chart/runtime/workbenchTraceNetworkLoad";

export type ChartEventsRuntimeSnapshot = {
  implemented: true;
  chartEventsEnabled: boolean;
  eventCount: number;
  fallbackReason: ChartEventsFallbackReason | null;
  displayMergeSource: "chart-events" | "signal-trace-fallback" | null;
  displayLoadOutcome: DisplayLoadOutcome | null;
};

export type ChartEventsRuntimeInactiveSnapshot = {
  implemented: false;
  chartEventsEnabled: boolean;
  eventCount: number;
  fallbackReason: ChartEventsFallbackReason | null;
};

export type ChartEventsRuntimeBoundary =
  | ChartEventsRuntimeInactiveSnapshot
  | ChartEventsRuntimeSnapshot;

export function resolveChartEventsEnabled(): boolean {
  return isChartEventsApiEnabled();
}

export function resolveDisplayTraceRequestKey(input: {
  runId: string;
  variant: string;
  fromMs: number;
  toOpenTimeMs: number;
  contextOverlayRef: string | null;
}): string {
  return buildDisplayTraceRequestKey({
    runId: input.runId,
    variant: input.variant,
    fromMs: input.fromMs,
    toOpenTimeMs: input.toOpenTimeMs,
    contextOverlayRef: input.contextOverlayRef,
  });
}

export function mapChartEventsDisplayLoadOutcome(
  lanesOnlyFetch: boolean,
  chartEventsEnabled: boolean,
  displayResult: DisplayTraceChunkLoadResult | null,
): DisplayLoadOutcome | null {
  if (lanesOnlyFetch) {
    return "skipped_lanes_only";
  }
  if (displayResult === null) {
    return null;
  }
  if (displayResult.outcome === "aborted" || displayResult.outcome === "stale") {
    return null;
  }
  if (!chartEventsEnabled) {
    return "skipped_flag_off";
  }
  if (displayResult.outcome === "committed") {
    return "committed";
  }
  return "fallback_needed";
}

export function resolveChartEventsRuntimeSnapshot(input: {
  componentEventCount: number;
  displayResult: DisplayTraceChunkLoadResult | null;
  lanesOnlyFetch: boolean;
  fallbackReason?: ChartEventsFallbackReason | null;
}): ChartEventsRuntimeBoundary {
  const chartEventsEnabled = resolveChartEventsEnabled();
  const displayLoadOutcome = mapChartEventsDisplayLoadOutcome(
    input.lanesOnlyFetch,
    chartEventsEnabled,
    input.displayResult,
  );

  if (displayLoadOutcome === null) {
    return {
      implemented: false,
      chartEventsEnabled,
      eventCount: input.componentEventCount,
      fallbackReason: input.fallbackReason ?? null,
    };
  }

  const displayMergeSource =
    input.displayResult !== null &&
    (input.displayResult.outcome === "committed" || input.displayResult.outcome === "continue")
      ? input.displayResult.mergeSource
      : null;

  return {
    implemented: true,
    chartEventsEnabled,
    eventCount: input.componentEventCount,
    fallbackReason: input.fallbackReason ?? null,
    displayMergeSource,
    displayLoadOutcome,
  };
}
