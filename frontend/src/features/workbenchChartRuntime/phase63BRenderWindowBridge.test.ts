import { describe, expect, it } from "vitest";

import type { ChartMarketBundle } from "@/api/types";

import { chartRuntimeCutoverConfig } from "./chartRuntimeCutoverConfig";
import { makePhase6Candles } from "./phase6ContractFixtures";
import {
  collectForbiddenImportViolations,
  readWorkspaceSource,
} from "./phase6StaticGuardUtils";
import {
  buildChartViewWindowFromPhase63BSlice,
  createPhase63BRenderWindowOwnerState,
  resolvePhase63BChartWindowSlice,
  runPhase63BApplyTrade,
  runPhase63BRenderWindowInit,
} from "./phase63BRenderWindowBridge";
import { findForbiddenAdapterFallbackPatterns } from "./runtimeOutputAdapter.contract";

function makeBundle(candleCount: number): ChartMarketBundle {
  const candles = makePhase6Candles(candleCount);
  return {
    candles,
    ema_overlays: [],
  };
}

describe("Phase 6.3B render-window cutover", () => {
  it("sets cutover config to phase 6.3E with v2 domains including aux_overlay", () => {
    expect(chartRuntimeCutoverConfig.cutoverPhase).toBe("6.3E");
    expect(chartRuntimeCutoverConfig.domainOwners.render_window).toBe("runtime_v2_production");
    expect(chartRuntimeCutoverConfig.domainOwners.trace).toBe("runtime_v2_production");
    expect(chartRuntimeCutoverConfig.domainOwners.aux_overlay).toBe("runtime_v2_production");
    expect(chartRuntimeCutoverConfig.domainOwners.market).toBe("old_production");
  });

  it("initializes render-window from old market bundle without market fetch helpers", () => {
    const bridgeSource = readWorkspaceSource(
      "src/features/workbenchChartRuntime/phase63BRenderWindowBridge.ts",
    );
    expect(bridgeSource).not.toContain("executeMarketWindowLoad");
    expect(bridgeSource).not.toContain("mergeCandlesWindowBundle");
    expect(bridgeSource).not.toContain("seedCandlesWindow");
    expect(bridgeSource).not.toContain("clearMarketResourceCache");

    const state = createPhase63BRenderWindowOwnerState(() => {});
    const bundle = makeBundle(24);
    const initialized = runPhase63BRenderWindowInit(state, {
      foundationKey: "run-a:exp_a",
      marketLoadStatus: "ready",
      bundleCandles: bundle.candles,
      selectedTradeEntryTimeMs: null,
      variantKey: "exp_a",
    });
    expect(initialized).toBe(true);

    const slice = resolvePhase63BChartWindowSlice(state, {
      bundle,
      marketLoadStatus: "ready",
      auxEmaOverlays: [],
      marketIdentity: "run-a:exp_a",
    });
    expect(slice.implemented).toBe(true);
    expect(slice.count).toBeGreaterThan(0);
    expect(slice.parts.candles.length).toBe(slice.count);
  });

  it("rebuilds trade-centered window from old bundle candles", () => {
    const state = createPhase63BRenderWindowOwnerState(() => {});
    const bundle = makeBundle(40);
    runPhase63BRenderWindowInit(state, {
      foundationKey: "run-a:exp_a",
      marketLoadStatus: "ready",
      bundleCandles: bundle.candles,
      selectedTradeEntryTimeMs: null,
      variantKey: "exp_a",
    });

    const entryTimeMs = bundle.candles[2]!.time * 1000;
    runPhase63BApplyTrade(state, {
      bundleCandles: bundle.candles,
      selectedTradeEntryTimeMs: entryTimeMs,
      forceRebuild: true,
    });

    const chartWindow = resolvePhase63BChartWindowSlice(state, {
      bundle,
      marketLoadStatus: "ready",
      auxEmaOverlays: [],
      marketIdentity: "run-a:exp_a",
    });
    const chartView = buildChartViewWindowFromPhase63BSlice({
      chartWindow,
      selectedTradeEntryTimeMs: entryTimeMs,
    });
    expect(chartView.mode).toBe("around-trade");
    expect(chartView.centerTimeSec).toBe(Math.floor(entryTimeMs / 1000));
    expect(chartView.count).toBeGreaterThan(0);
  });

  it("does not re-init render window when foundation key is unchanged", () => {
    const state = createPhase63BRenderWindowOwnerState(() => {});
    const bundle = makeBundle(16);
    const input = {
      foundationKey: "run-a:exp_a",
      marketLoadStatus: "ready" as const,
      bundleCandles: bundle.candles,
      selectedTradeEntryTimeMs: null,
      variantKey: "exp_a",
    };
    expect(runPhase63BRenderWindowInit(state, input)).toBe(true);
    expect(runPhase63BRenderWindowInit(state, input)).toBe(false);
  });

  it("wires WorkbenchContext to v2 render-window bridge without full runtime hook", () => {
    const workbenchSource = readWorkspaceSource("src/shared/context/WorkbenchContext.tsx");
    expect(workbenchSource).toContain("phase63BRenderWindowBridge");
    expect(workbenchSource).toContain("resolvePhase63BChartWindowSlice");
    expect(workbenchSource).toContain("buildChartViewWindowFromPhase63BSlice");
    expect(workbenchSource).toContain("resolvePhase63EModelRuntimeSlice");
    expect(workbenchSource).not.toContain("useWorkbenchChartRuntime");
    expect(workbenchSource).not.toContain("buildChartViewModel");
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

  it("documents that model consumes v2 render-window sliced chartView", () => {
    const workbenchSource = readWorkspaceSource("src/shared/context/WorkbenchContext.tsx");
    expect(workbenchSource).toMatch(
      /buildChartViewWindowFromPhase63BSlice[\s\S]*resolvePhase63EModelRuntimeSlice/,
    );
  });
});
