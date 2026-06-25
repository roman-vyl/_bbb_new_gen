import type {
  ChartRuntimeCompatibilityInput,
  ChartRuntimeOutput,
} from "./runtimeTypes";
import {
  createChartRuntimeCompatibilityOutput,
  type ChartRuntimeCompatibilityOutput,
} from "./runtimeOutputAdapter";

export type DerivedLegacyWorkbenchChartFields = {
  marketLoadStatus: ChartRuntimeOutput["market"]["status"];
  marketError: ChartRuntimeOutput["market"]["error"];
  candlesSource: ChartRuntimeOutput["market"]["candlesSource"];
  marketCandlesCount: ChartRuntimeOutput["market"]["candlesCount"];
  fullCandleRange: ChartRuntimeOutput["market"]["fullCandleRange"];
  chartCandles: ChartRuntimeOutput["chartViewModel"]["candles"];
  chartEmaOverlays: ChartRuntimeOutput["chartViewModel"]["emaOverlays"];
  chartAuxEmaOverlays: ChartRuntimeOutput["chartViewModel"]["auxEmaOverlays"];
  chartDisplayAuxEmaOverlays: ChartRuntimeOutput["chartViewModel"]["displayAuxEmaOverlays"];
  chartDisplayComponentEvents: ChartRuntimeOutput["chartViewModel"]["componentEvents"];
  htfAuxEmaOverlayStale: ChartRuntimeOutput["overlays"]["htfAuxEmaOverlayStale"];
  componentEventsStale: ChartRuntimeOutput["display"]["componentEventsStale"];
  displayApplyRevision: ChartRuntimeOutput["display"]["displayApplyRevision"];
  renderWindowShiftSeq: ChartRuntimeOutput["display"]["renderWindowShiftSeq"];
  chartViewMode: ChartRuntimeOutput["chartViewModel"]["viewMode"];
  chartViewCenterTimeSec: ChartRuntimeOutput["chartViewModel"]["centerTimeSec"];
  chartViewFirstTimeSec: ChartRuntimeOutput["chartViewModel"]["firstTimeSec"];
  chartViewLastTimeSec: ChartRuntimeOutput["chartViewModel"]["lastTimeSec"];
  chartViewCount: ChartRuntimeOutput["chartViewModel"]["count"];
  lanesSignalTrace: ChartRuntimeOutput["trace"]["lanesSignalTrace"];
  lanesSignalTraceStatus: ChartRuntimeOutput["trace"]["lanesSignalTraceStatus"];
  lanesSignalTraceError: ChartRuntimeOutput["trace"]["lanesSignalTraceError"];
  chartViewportCommand: ChartRuntimeOutput["viewport"]["command"];
  chartViewportCommandSeq: ChartRuntimeOutput["viewport"]["commandSeq"];
  dispatchChartInteraction: ChartRuntimeOutput["interaction"]["dispatch"];
  acknowledgeChartViewportCommand: ChartRuntimeOutput["viewport"]["acknowledge"];
  isWindowSwapTransactionCancelled: ChartRuntimeOutput["viewport"]["isWindowSwapTransactionCancelled"];
  settleWindowSwapCommit: ChartRuntimeOutput["viewport"]["settleWindowSwapCommit"];
};

/** Single-source derivation contract for Phase 6.3 adapter cutover. */
export function deriveLegacyWorkbenchChartFieldsFromRuntime(
  runtime: ChartRuntimeOutput,
): DerivedLegacyWorkbenchChartFields {
  return {
    marketLoadStatus: runtime.market.status,
    marketError: runtime.market.error,
    candlesSource: runtime.market.candlesSource,
    marketCandlesCount: runtime.market.candlesCount,
    fullCandleRange: runtime.market.fullCandleRange,
    chartCandles: runtime.chartViewModel.candles,
    chartEmaOverlays: runtime.chartViewModel.emaOverlays,
    chartAuxEmaOverlays: runtime.chartViewModel.auxEmaOverlays,
    chartDisplayAuxEmaOverlays: runtime.chartViewModel.displayAuxEmaOverlays,
    chartDisplayComponentEvents: runtime.chartViewModel.componentEvents,
    htfAuxEmaOverlayStale: runtime.overlays.htfAuxEmaOverlayStale,
    componentEventsStale: runtime.display.componentEventsStale,
    displayApplyRevision: runtime.display.displayApplyRevision,
    renderWindowShiftSeq: runtime.display.renderWindowShiftSeq,
    chartViewMode: runtime.chartViewModel.viewMode,
    chartViewCenterTimeSec: runtime.chartViewModel.centerTimeSec,
    chartViewFirstTimeSec: runtime.chartViewModel.firstTimeSec,
    chartViewLastTimeSec: runtime.chartViewModel.lastTimeSec,
    chartViewCount: runtime.chartViewModel.count,
    lanesSignalTrace: runtime.trace.lanesSignalTrace,
    lanesSignalTraceStatus: runtime.trace.lanesSignalTraceStatus,
    lanesSignalTraceError: runtime.trace.lanesSignalTraceError,
    chartViewportCommand: runtime.viewport.command,
    chartViewportCommandSeq: runtime.viewport.commandSeq,
    dispatchChartInteraction: runtime.interaction.dispatch,
    acknowledgeChartViewportCommand: runtime.viewport.acknowledge,
    isWindowSwapTransactionCancelled: runtime.viewport.isWindowSwapTransactionCancelled,
    settleWindowSwapCommit: runtime.viewport.settleWindowSwapCommit,
  };
}

export function createWorkbenchChartRuntimeSlice(
  runtime: ChartRuntimeOutput,
  compatibility: ChartRuntimeCompatibilityInput,
): ChartRuntimeCompatibilityOutput & DerivedLegacyWorkbenchChartFields {
  return {
    ...createChartRuntimeCompatibilityOutput(runtime, compatibility),
    ...deriveLegacyWorkbenchChartFieldsFromRuntime(runtime),
  };
}

export const FORBIDDEN_ADAPTER_FALLBACK_PATTERNS = [
  /\blegacyPipeline\b/i,
  /\bfallbackToOld\b/i,
  /\boldPipeline\b/i,
  /\?\?\s*chartView/i,
  /if\s*\(\s*!runtime[\s\S]*chartViewModel/i,
] as const;

export function findForbiddenAdapterFallbackPatterns(source: string): string[] {
  return FORBIDDEN_ADAPTER_FALLBACK_PATTERNS.filter((pattern) => pattern.test(source)).map(
    (pattern) => pattern.source,
  );
}
