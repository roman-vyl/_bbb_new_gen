import { describe, expect, it } from "vitest";

import {
  createChartRuntimeCompatibilityOutput,
  type ChartRuntimeCompatibilityOutput,
} from "./runtimeOutputAdapter";
import {
  createWorkbenchChartRuntimeSlice,
  deriveLegacyWorkbenchChartFieldsFromRuntime,
  findForbiddenAdapterFallbackPatterns,
} from "./runtimeOutputAdapter.contract";
import {
  makePhase6CompatibilityInput,
  makeSampleChartRuntimeOutput,
  PROVIDER_OWNED_WORKBENCH_CHART_FIELD_KEYS,
  RUNTIME_OWNED_WORKBENCH_CHART_FIELD_KEYS,
} from "./phase6ContractFixtures";
import { readWorkspaceSource } from "./phase6StaticGuardUtils";

const CHART_PANEL_RUNTIME_FIELD_KEYS = [
  "chartViewModel",
  "htfAuxEmaOverlayStale",
  "componentEventsStale",
  "displayApplyRevision",
  "renderWindowShiftSeq",
  "candlesSource",
  "marketError",
  "marketCandlesCount",
  "timeframeMismatch",
  "reportTimeframe",
  "chartTimeframe",
  "lanesSignalTrace",
  "lanesSignalTraceStatus",
  "lanesSignalTraceError",
  "dispatchChartInteraction",
  "chartViewportCommand",
  "chartViewportCommandSeq",
  "acknowledgeChartViewportCommand",
  "isWindowSwapTransactionCancelled",
  "settleWindowSwapCommit",
] as const;

function expectDefinedFunctions(output: ChartRuntimeCompatibilityOutput): void {
  expect(typeof output.viewport.acknowledge).toBe("function");
  expect(typeof output.viewport.isWindowSwapTransactionCancelled).toBe("function");
  expect(typeof output.viewport.settleWindowSwapCommit).toBe("function");
  expect(typeof output.interaction.dispatch).toBe("function");
}

describe("Phase 6.1 runtime output adapter contract", () => {
  it("maps runtime output and provider compatibility without dropping required runtime fields", () => {
    const runtime = makeSampleChartRuntimeOutput();
    const compatibility = makePhase6CompatibilityInput();
    const output = createChartRuntimeCompatibilityOutput(runtime, compatibility);

    expect(output.chartViewModel).toBe(runtime.chartViewModel);
    expect(output.market).toBe(runtime.market);
    expect(output.trace).toBe(runtime.trace);
    expect(output.display).toBe(runtime.display);
    expect(output.overlays).toBe(runtime.overlays);
    expect(output.viewport).toBe(runtime.viewport);
    expect(output.interaction).toBe(runtime.interaction);
    expect(output.selectedVariant).toBe(compatibility.selectedVariant);
    expect(output.selectedTradeId).toBe(compatibility.selectedTradeId);
    expect(output.selectedBarTimeSec).toBe(compatibility.selectedBarTimeSec);
    expectDefinedFunctions(output);
  });

  it("derives legacy WorkbenchChart fields from one runtime output source", () => {
    const runtime = makeSampleChartRuntimeOutput();
    const derived = deriveLegacyWorkbenchChartFieldsFromRuntime(runtime);

    expect(derived.marketLoadStatus).toBe(runtime.market.status);
    expect(derived.marketError).toBe(runtime.market.error);
    expect(derived.candlesSource).toBe(runtime.market.candlesSource);
    expect(derived.marketCandlesCount).toBe(runtime.market.candlesCount);
    expect(derived.fullCandleRange).toBe(runtime.market.fullCandleRange);
    expect(derived.chartCandles).toBe(runtime.chartViewModel.candles);
    expect(derived.chartEmaOverlays).toBe(runtime.chartViewModel.emaOverlays);
    expect(derived.chartDisplayAuxEmaOverlays).toBe(runtime.chartViewModel.displayAuxEmaOverlays);
    expect(derived.chartDisplayComponentEvents).toBe(runtime.chartViewModel.componentEvents);
    expect(derived.htfAuxEmaOverlayStale).toBe(runtime.overlays.htfAuxEmaOverlayStale);
    expect(derived.componentEventsStale).toBe(runtime.display.componentEventsStale);
    expect(derived.displayApplyRevision).toBe(runtime.display.displayApplyRevision);
    expect(derived.renderWindowShiftSeq).toBe(runtime.display.renderWindowShiftSeq);
    expect(derived.lanesSignalTrace).toBe(runtime.trace.lanesSignalTrace);
    expect(derived.lanesSignalTraceStatus).toBe(runtime.trace.lanesSignalTraceStatus);
    expect(derived.lanesSignalTraceError).toBe(runtime.trace.lanesSignalTraceError);
    expect(derived.chartViewportCommand).toBe(runtime.viewport.command);
    expect(derived.chartViewportCommandSeq).toBe(runtime.viewport.commandSeq);
  });

  it("keeps adapter slice consistent with runtime-owned WorkbenchChart field contract", () => {
    const runtime = makeSampleChartRuntimeOutput();
    const slice = createWorkbenchChartRuntimeSlice(runtime, makePhase6CompatibilityInput());

    for (const key of RUNTIME_OWNED_WORKBENCH_CHART_FIELD_KEYS) {
      expect(slice[key]).toBeDefined();
    }

    expect(slice.chartViewModel.seriesKey).toBe(runtime.chartViewModel.seriesKey);
    expect(slice.chartViewMode).toBe(runtime.chartViewModel.viewMode);
    expect(slice.chartViewCount).toBe(runtime.chartViewModel.count);
  });

  it("documents provider-owned fields that must remain outside runtime lifecycle", () => {
    expect(PROVIDER_OWNED_WORKBENCH_CHART_FIELD_KEYS).toContain("selectTrade");
    expect(PROVIDER_OWNED_WORKBENCH_CHART_FIELD_KEYS).toContain("selectedVariant");
    expect(PROVIDER_OWNED_WORKBENCH_CHART_FIELD_KEYS).not.toContain("chartViewModel");
  });

  it("covers ChartPanel runtime-consumed fields through adapter/runtime mapping", () => {
    const runtime = makeSampleChartRuntimeOutput();
    const output = createChartRuntimeCompatibilityOutput(runtime, makePhase6CompatibilityInput());
    const derived = deriveLegacyWorkbenchChartFieldsFromRuntime(runtime);

    expect(output.chartViewModel).toBeDefined();
    expect(output.display.displayApplyRevision).toBeDefined();
    expect(output.viewport.acknowledge).toBeTypeOf("function");
    expect(output.interaction.dispatch).toBeTypeOf("function");
    expect(derived.lanesSignalTraceStatus).toBeDefined();
    expect(derived.chartViewportCommandSeq).toBeGreaterThan(0);

    for (const key of CHART_PANEL_RUNTIME_FIELD_KEYS) {
      if (key in output) {
        expect(output[key as keyof typeof output]).toBeDefined();
      }
    }
  });

  it("forbids old-pipeline fallback patterns in runtimeOutputAdapter", () => {
    const adapterSource = readWorkspaceSource(
      "src/features/workbenchChartRuntime/runtimeOutputAdapter.ts",
    );

    expect(findForbiddenAdapterFallbackPatterns(adapterSource)).toEqual([]);
  });
});
