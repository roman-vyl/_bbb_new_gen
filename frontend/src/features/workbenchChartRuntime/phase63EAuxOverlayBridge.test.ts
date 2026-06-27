import { describe, expect, it } from "vitest";

import {
  chartRuntimeCutoverConfig,
  PHASE_63E_DOMAIN_OWNERS,
} from "./chartRuntimeCutoverConfig";
import {
  hasRuntimeV2ProductionOwner,
  runtimeV2ProductionDomains,
} from "./chartRuntimeCutoverTelemetry";
import { makePhase6Candles } from "./phase6ContractFixtures";
import {
  collectForbiddenImportViolations,
  readWorkspaceSource,
} from "./phase6StaticGuardUtils";
import { createTraceDisplayRuntimeController } from "./traceDisplayRuntime";
import {
  createPhase63EAuxOverlayOwnerState,
  resetPhase63EAuxOverlayOwner,
  resolvePhase63EAuxOverlaySnapshot,
  runPhase63EApplyHtfFromDisplaySlice,
  syncPhase63EAuxOverlaySpecs,
} from "./phase63EAuxOverlayBridge";
import { findForbiddenAdapterFallbackPatterns } from "./runtimeOutputAdapter.contract";

describe("Phase 6.3E aux/HTF overlay cutover", () => {
  it("sets cutover config to phase 6.3E with aux_overlay on runtime_v2_production", () => {
    expect(chartRuntimeCutoverConfig.cutoverPhase).toBe("6.3E");
    expect(chartRuntimeCutoverConfig.domainOwners).toEqual(PHASE_63E_DOMAIN_OWNERS);
    expect(runtimeV2ProductionDomains(chartRuntimeCutoverConfig)).toEqual([
      "model",
      "render_window",
      "viewport",
      "trace",
      "aux_overlay",
    ]);
    expect(hasRuntimeV2ProductionOwner(chartRuntimeCutoverConfig)).toBe(true);
    expect(chartRuntimeCutoverConfig.domainOwners.market).toBe("old_production");
  });

  it("has no runtime_v2_production owner outside model, render_window, viewport, trace, and aux_overlay", () => {
    const unexpectedV2 = (["market"] as const).filter(
      (domain) => chartRuntimeCutoverConfig.domainOwners[domain] === "runtime_v2_production",
    );
    expect(unexpectedV2).toEqual([]);
  });

  it("does not include market fetch helpers in aux bridge", () => {
    const bridgeSource = readWorkspaceSource(
      "src/features/workbenchChartRuntime/phase63EAuxOverlayBridge.ts",
    );
    expect(bridgeSource).not.toContain("executeMarketWindowLoad");
    expect(bridgeSource).not.toContain("mergeCandlesWindowBundle");
    expect(bridgeSource).not.toContain("seedCandlesWindow");
    expect(bridgeSource).not.toContain("composeDisplayMarketWindowBundle");
  });

  it("resolves aux snapshot from v2 render-window candles", () => {
    const owner = createPhase63EAuxOverlayOwnerState();
    syncPhase63EAuxOverlaySpecs(owner, {
      selectedVariant: null,
      chartTimeframe: "5m",
      effectiveContextOverlayRef: null,
    });
    const candles = makePhase6Candles(8);
    const snapshot = resolvePhase63EAuxOverlaySnapshot(owner, {
      slicedAuxOverlays: [],
      renderWindowCandles: candles,
      chartWindowKey: "run:var:100:107:",
      loadedSignalTraceWindowKey: null,
      displayCacheCoversWindow: false,
      displayCacheHasWindowData: false,
      signalTraceStatus: "idle",
    });
    expect(snapshot.implemented).toBe(true);
    expect(snapshot.displayAuxEmaOverlays).toEqual([]);
  });

  it("dedupes repeated aux snapshot apply for same window input", () => {
    const owner = createPhase63EAuxOverlayOwnerState();
    const candles = makePhase6Candles(6);
    const input = {
      slicedAuxOverlays: [] as const,
      renderWindowCandles: candles,
      chartWindowKey: "run:var:100:105:",
      loadedSignalTraceWindowKey: null,
      displayCacheCoversWindow: false,
      displayCacheHasWindowData: false,
      signalTraceStatus: "idle" as const,
    };
    const first = resolvePhase63EAuxOverlaySnapshot(owner, input);
    const second = resolvePhase63EAuxOverlaySnapshot(owner, input);
    expect(first.implemented).toBe(true);
    expect(second.implemented).toBe(true);
    expect(second.displayAuxEmaOverlays).toEqual(first.displayAuxEmaOverlays);
  });

  it("apply HTF from display slice is no-op without htf specs", () => {
    const owner = createPhase63EAuxOverlayOwnerState();
    const applied = runPhase63EApplyHtfFromDisplaySlice(owner, {
      times: [100, 101],
      htf_context: { state: ["up"], fast: [1], anchor: [2], slow: [3], meta: {} },
    });
    expect(applied).toBe(false);
  });

  it("reset clears aux overlay controller state", () => {
    const owner = createPhase63EAuxOverlayOwnerState();
    owner.controller.auxEmaOverlays = [{ id: "htf_test", label: "x", period: 1, timeframe: "5m", points: [], dashed: false }];
    resetPhase63EAuxOverlayOwner(owner);
    expect(owner.controller.auxEmaOverlays).toEqual([]);
    expect(owner.lastSnapshotKey).toBeNull();
  });

  it("wires WorkbenchContext to phase63E aux bridge without market owner", () => {
    const workbenchSource = readWorkspaceSource("src/shared/context/WorkbenchContext.tsx");
    expect(workbenchSource).toContain("phase63EAuxOverlayBridge");
    expect(workbenchSource).toContain("phase63EAuxOverlayOwner");
    expect(workbenchSource).toContain("resolvePhase63EModelRuntimeSlice");
    expect(workbenchSource).toContain("executeMarketWindowLoad");
    expect(workbenchSource).not.toContain("useWorkbenchChartRuntime");
    expect(findForbiddenAdapterFallbackPatterns(workbenchSource)).toEqual([]);
  });

  it("keeps ChartPanel off runtime v2 internals", () => {
    const chartPanelSource = readWorkspaceSource("src/features/chart/ChartPanel.tsx");
    const violations = collectForbiddenImportViolations(chartPanelSource, [
      /from\s+["']@\/features\/workbenchChartRuntime/,
      /useWorkbenchChartRuntime/,
    ]);
    expect(violations).toEqual([]);
  });

  it("consumes trace display cache as read-only input for HTF slicing", () => {
    const cache = createTraceDisplayRuntimeController().cache;
    const bridgeSource = readWorkspaceSource(
      "src/features/workbenchChartRuntime/phase63EAuxOverlayBridge.ts",
    );
    expect(bridgeSource).toContain("sliceHtfContextForWindow");
    expect(typeof cache.sliceHtfContextForWindow).toBe("function");
  });
});
