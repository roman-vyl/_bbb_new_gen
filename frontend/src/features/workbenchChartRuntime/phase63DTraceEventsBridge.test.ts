import { describe, expect, it } from "vitest";

import { evaluateSignalTraceBootstrap } from "@/shared/context/signalTraceBootstrap";

import {
  chartRuntimeCutoverConfig,
  PHASE_63D_DOMAIN_OWNERS,
} from "./chartRuntimeCutoverConfig";
import { chartWindowKeyFromCandles } from "./chartModelRuntime";
import { makePhase6Candles, makePhase6Report } from "./phase6ContractFixtures";
import {
  collectForbiddenImportViolations,
  readWorkspaceSource,
} from "./phase6StaticGuardUtils";
import {
  applyTraceDisplayForWindow,
  createTraceDisplayRuntimeController,
  resetTraceDisplayRuntimeCache,
  buildTraceDisplayCacheKeyForRuntime,
} from "./traceDisplayRuntime";
import {
  createPhase63DTraceEventsOwnerState,
  runPhase63DApplyTraceDisplayForWindow,
  shouldPhase63DFinalizeTraceDisplay,
} from "./phase63DTraceEventsBridge";
import { findForbiddenAdapterFallbackPatterns } from "./runtimeOutputAdapter.contract";

describe("Phase 6.3D trace/events cutover", () => {
  it("keeps trace domain on runtime_v2_production at phase 6.3F", () => {
    expect(chartRuntimeCutoverConfig.domainOwners.trace).toBe("runtime_v2_production");
    expect(PHASE_63D_DOMAIN_OWNERS.trace).toBe("runtime_v2_production");
    expect(PHASE_63D_DOMAIN_OWNERS.aux_overlay).toBe("old_production");
  });

  it("has market on runtime_v2_production at 6.3F", () => {
    expect(chartRuntimeCutoverConfig.domainOwners.market).toBe("runtime_v2_production");
  });

  it("blocks trace bootstrap until market and render-window are ready", () => {
    const report = makePhase6Report();
    const candles = makePhase6Candles(12);
    const windowKey = chartWindowKeyFromCandles(report.run_id, report.variants[0]!.variant, candles, null);
    const blocked = evaluateSignalTraceBootstrap({
      report,
      reportLoadStatus: "ready",
      selectedRunId: report.run_id,
      selectedVariantKey: report.variants[0]!.variant,
      marketLoadStatus: "loading",
      runMarketViewIdentity: "identity-a",
      expectedRunMarketViewIdentity: "identity-a",
      chartWindowKey: windowKey,
      candles,
      renderWindowBounds: { fromSec: candles[0]!.time, toSec: candles[candles.length - 1]!.time },
      previousWindowKey: null,
    });
    expect(blocked.ready).toBe(false);
  });

  it("apply trace display is no-op for unchanged window input", () => {
    const owner = createPhase63DTraceEventsOwnerState();
    const cacheKey = buildTraceDisplayCacheKeyForRuntime({
      selectedRunId: "run-a",
      selectedVariantKey: "exp_a",
      effectiveContextOverlayRef: null,
    });
    resetTraceDisplayRuntimeCache(owner.traceDisplayController, cacheKey);
    const candles = makePhase6Candles(10);
    const first = runPhase63DApplyTraceDisplayForWindow(owner, {
      candles,
      traceLoadStatus: "ready",
      selectedTradeId: null,
      selectedTradeEntryTimeSec: null,
      selectedTradeEntryMarkerInView: false,
    });
    const second = runPhase63DApplyTraceDisplayForWindow(owner, {
      candles,
      traceLoadStatus: "ready",
      selectedTradeId: null,
      selectedTradeEntryTimeSec: null,
      selectedTradeEntryMarkerInView: false,
    });
    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(second.displayApplyRevision).toBe(first.displayApplyRevision);
  });

  it("retains component events across unchanged loading re-applies", () => {
    const controller = createTraceDisplayRuntimeController();
    resetTraceDisplayRuntimeCache(
      controller,
      buildTraceDisplayCacheKeyForRuntime({
        selectedRunId: "run-a",
        selectedVariantKey: "exp_a",
        effectiveContextOverlayRef: null,
      }),
    );
    const candles = makePhase6Candles(12);
    controller.componentEvents = [
      {
        time: candles[0]!.time,
        event_type: "point",
        role: "entry_block",
        side: "long",
        component_id: "entry",
        instance_id: "entry-1",
        label: "Entry",
        metadata: {},
      },
    ];
    controller.lastSlicedHtfOverlayPointCount = 1;
    applyTraceDisplayForWindow(controller, candles, "loading");
    const revision = controller.displayApplyRevision;
    applyTraceDisplayForWindow(controller, candles, "loading");
    expect(controller.displayApplyRevision).toBe(revision);
  });

  it("does not include market fetch helpers in trace bridge", () => {
    const bridgeSource = readWorkspaceSource(
      "src/features/workbenchChartRuntime/phase63DTraceEventsBridge.ts",
    );
    expect(bridgeSource).not.toContain("executeMarketWindowLoad");
    expect(bridgeSource).not.toContain("mergeCandlesWindowBundle");
    expect(bridgeSource).not.toContain("seedCandlesWindow");
  });

  it("wires WorkbenchContext to phase63D trace bridge", () => {
    const workbenchSource = readWorkspaceSource("src/shared/context/WorkbenchContext.tsx");
    expect(workbenchSource).toContain("phase63DTraceEventsBridge");
    expect(workbenchSource).toContain("runPhase63DTraceLoadCycle");
    expect(workbenchSource).toContain("onTraceReadyViewport");
    expect(workbenchSource).not.toContain("useWorkbenchChartRuntime");
    expect(findForbiddenAdapterFallbackPatterns(workbenchSource)).toEqual([]);

    const renderViewportSource = readWorkspaceSource(
      "src/shared/context/WorkbenchRenderViewportContext.tsx",
    );
    expect(renderViewportSource).toContain("evaluateTradeFocusReadiness");
    expect(renderViewportSource).toContain("tryEmitTradeFocusWhenReady");
    expect(renderViewportSource).toContain("phase63TradeFocusBridge");
  });

  it("keeps ChartPanel on workbench integration hooks without runtime internals", () => {
    const chartPanelSource = readWorkspaceSource("src/features/chart/ChartPanel.tsx");
    const violations = collectForbiddenImportViolations(chartPanelSource, [
      /from\s+["']@\/features\/workbenchChartRuntime/,
      /useWorkbenchChartRuntime/,
    ]);
    expect(violations).toEqual([]);
    expect(chartPanelSource).toContain("useWorkbenchRenderViewport");
  });

  it("finalizes trace display for completed load outcomes", () => {
    expect(shouldPhase63DFinalizeTraceDisplay("completed")).toBe(true);
    expect(shouldPhase63DFinalizeTraceDisplay("cache_hit")).toBe(true);
    expect(shouldPhase63DFinalizeTraceDisplay("bootstrap_blocked")).toBe(false);
  });
});
