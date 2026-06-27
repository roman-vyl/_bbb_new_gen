import { describe, expect, it } from "vitest";

import { buildChartViewModel } from "@/features/chart/runtime/chartViewModel";

import { chartRuntimeCutoverConfig } from "./chartRuntimeCutoverConfig";
import { runtimeV2ProductionDomains } from "./chartRuntimeCutoverTelemetry";
import { makePhase6Candles } from "./phase6ContractFixtures";
import {
  buildChartModelRuntimeInputFromOldPipeline,
  PHASE_63A_MODEL_ADAPTER_APPLY_STEP,
  resolvePhase63AModelRuntimeSlice,
} from "./phase63AModelAdapterBridge";
import {
  derivePhase63AModelDomainFieldsFromRuntime,
  findForbiddenAdapterFallbackPatterns,
  PHASE_63A_MODEL_DOMAIN_FIELD_KEYS,
} from "./runtimeOutputAdapter.contract";
import {
  collectForbiddenImportViolations,
  readWorkspaceSource,
} from "./phase6StaticGuardUtils";

describe("Phase 6.3A model + adapter cutover", () => {
  it("keeps model bridge compatible when cutover config is at phase 6.3D", () => {
    expect(chartRuntimeCutoverConfig.cutoverPhase).toBe("6.3D");
    expect(chartRuntimeCutoverConfig.domainOwners.model).toBe("runtime_v2_production");
    expect(runtimeV2ProductionDomains(chartRuntimeCutoverConfig)).toContain("model");
    expect(chartRuntimeCutoverConfig.domainOwners.trace).toBe("runtime_v2_production");
  });

  it("builds model bridge input as read-only passthrough from old pipeline fields", () => {
    const candles = makePhase6Candles(12);
    const bridgeInput = buildChartModelRuntimeInputFromOldPipeline({
      chartView: {
        candles,
        emaOverlays: [],
        auxEmaOverlays: [],
        mode: "around-trade",
        centerTimeSec: 1_200,
        firstTimeSec: candles[0]!.time,
        lastTimeSec: candles[candles.length - 1]!.time,
        count: candles.length,
      },
      chartDisplayAuxEmaOverlays: [],
      chartDisplayComponentEvents: [],
      htfAuxEmaOverlayStale: false,
      componentEventsStale: false,
      traceDisplayState: { status: "current", missingRange: null },
    });

    expect(bridgeInput.chartWindowParts.candles).toBe(candles);
    expect(bridgeInput.count).toBe(12);
    expect(bridgeInput.traceDisplay.componentEventsStale).toBe(false);
    expect(bridgeInput.auxOverlay.htfAuxEmaOverlayStale).toBe(false);
  });

  it("derives adapter model-domain fields from v2 chartViewModel output", () => {
    const candles = makePhase6Candles(8);
    const oldModel = buildChartViewModel({
      candles,
      emaOverlays: [],
      auxEmaOverlays: [],
      displayAuxEmaOverlays: [],
      componentEvents: [],
      htfOverlayStale: false,
      componentEventsStale: false,
      traceDisplayStatus: "current",
      traceDisplayMissingRange: null,
      viewMode: "around-trade",
      centerTimeSec: 1_100,
      firstTimeSec: candles[0]!.time,
      lastTimeSec: candles[candles.length - 1]!.time,
      count: candles.length,
    });

    const slice = resolvePhase63AModelRuntimeSlice({
      chartView: {
        candles,
        emaOverlays: [],
        auxEmaOverlays: [],
        mode: oldModel.viewMode,
        centerTimeSec: oldModel.centerTimeSec,
        firstTimeSec: oldModel.firstTimeSec,
        lastTimeSec: oldModel.lastTimeSec,
        count: oldModel.count,
      },
      chartDisplayAuxEmaOverlays: [],
      chartDisplayComponentEvents: [],
      htfAuxEmaOverlayStale: false,
      componentEventsStale: false,
      traceDisplayState: { status: "current", missingRange: null },
    });

    const derived = derivePhase63AModelDomainFieldsFromRuntime(slice);
    expect(derived.chartViewModel.seriesKey).toBe(oldModel.seriesKey);
    expect(derived.chartCandles).toBe(slice.chartViewModel.candles);
    expect(derived.chartViewCount).toBe(8);

    for (const key of PHASE_63A_MODEL_DOMAIN_FIELD_KEYS) {
      expect(derived[key]).toBeDefined();
    }
  });

  it("forbids fallback patterns in WorkbenchContext and adapter contract modules", () => {
    const workbenchSource = readWorkspaceSource("src/shared/context/WorkbenchContext.tsx");
    const contractSource = readWorkspaceSource(
      "src/features/workbenchChartRuntime/runtimeOutputAdapter.contract.ts",
    );
    const bridgeSource = readWorkspaceSource(
      "src/features/workbenchChartRuntime/phase63AModelAdapterBridge.ts",
    );

    expect(findForbiddenAdapterFallbackPatterns(workbenchSource)).toEqual([]);
    expect(findForbiddenAdapterFallbackPatterns(contractSource)).toEqual([]);
    expect(findForbiddenAdapterFallbackPatterns(bridgeSource)).toEqual([]);
    expect(workbenchSource).not.toContain("buildChartViewModel");
    expect(workbenchSource).toContain("resolvePhase63AModelRuntimeSlice");
    expect(workbenchSource).toContain("derivePhase63AModelDomainFieldsFromRuntime");
    expect(workbenchSource).not.toContain("useWorkbenchChartRuntime");
  });

  it("keeps ChartPanel off runtime v2 internals while allowing cutover debug helper", () => {
    const chartPanelSource = readWorkspaceSource("src/features/chart/ChartPanel.tsx");
    const violations = collectForbiddenImportViolations(chartPanelSource, [
      /from\s+["']@\/features\/workbenchChartRuntime/,
      /useWorkbenchChartRuntime/,
    ]);
    expect(violations).toEqual([]);
    expect(chartPanelSource).toContain('from "@/shared/diagnostics/cutoverPipelineDebug"');
    expect(chartPanelSource).toContain("dbgTimedSyncChartModel");
  });

  it("documents model adapter debug step id", () => {
    expect(PHASE_63A_MODEL_ADAPTER_APPLY_STEP).toBe("wb.model_adapter.apply");
  });
});
