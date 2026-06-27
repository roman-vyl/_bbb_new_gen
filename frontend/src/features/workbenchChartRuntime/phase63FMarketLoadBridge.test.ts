import { describe, expect, it } from "vitest";

import {
  chartRuntimeCutoverConfig,
  PHASE_63F_DOMAIN_OWNERS,
} from "./chartRuntimeCutoverConfig";
import {
  hasRuntimeV2ProductionOwner,
  runtimeV2ProductionDomains,
} from "./chartRuntimeCutoverTelemetry";
import { makePhase6Report } from "./phase6ContractFixtures";
import {
  collectForbiddenImportViolations,
  readWorkspaceSource,
} from "./phase6StaticGuardUtils";
import { createMarketLoadRuntimeController } from "./marketLoadRuntime";
import {
  createPhase63FMarketLoadOwnerState,
  resetPhase63FMarketLoadOwner,
  resolvePhase63FMarketBundleSnapshot,
  resolvePhase63FMarketView,
} from "./phase63FMarketLoadBridge";
import { findForbiddenAdapterFallbackPatterns } from "./runtimeOutputAdapter.contract";

describe("Phase 6.3F market/load/cache cutover", () => {
  it("sets cutover config to phase 6.3F with all six domains on runtime_v2_production", () => {
    expect(chartRuntimeCutoverConfig.cutoverPhase).toBe("6.3F");
    expect(chartRuntimeCutoverConfig.domainOwners).toEqual(PHASE_63F_DOMAIN_OWNERS);
    expect(runtimeV2ProductionDomains(chartRuntimeCutoverConfig)).toEqual([
      "model",
      "render_window",
      "viewport",
      "trace",
      "aux_overlay",
      "market",
    ]);
    expect(hasRuntimeV2ProductionOwner(chartRuntimeCutoverConfig)).toBe(true);
    expect(Object.values(chartRuntimeCutoverConfig.domainOwners).every((o) => o === "runtime_v2_production")).toBe(true);
  });

  it("has no old_production owner in cutover config", () => {
    expect(Object.values(chartRuntimeCutoverConfig.domainOwners).includes("old_production")).toBe(false);
  });

  it("does not include forbidden dual-owner helpers in market bridge", () => {
    const bridgeSource = readWorkspaceSource(
      "src/features/workbenchChartRuntime/phase63FMarketLoadBridge.ts",
    );
    expect(bridgeSource).not.toContain("useWorkbenchChartRuntime");
    expect(bridgeSource).not.toContain("legacyPipeline");
    expect(bridgeSource).not.toContain("fallbackToOld");
    expect(findForbiddenAdapterFallbackPatterns(bridgeSource)).toEqual([]);
  });

  it("resolves market view from report without old pipeline fallback", () => {
    const report = makePhase6Report();
    const resolved = resolvePhase63FMarketView({
      report,
      chartTimeframe: "5m",
      variant: report.variants[0]!,
      reloadToken: 0,
    });
    expect(resolved.outcome).toBe("ok");
    if (resolved.outcome === "ok") {
      expect(resolved.viewIdentity.length).toBeGreaterThan(0);
    }
  });

  it("dedupes market bundle ready telemetry by foundation key", () => {
    const owner = createPhase63FMarketLoadOwnerState();
    owner.controller = createMarketLoadRuntimeController();
    owner.controller.status = "ready";
    const first = resolvePhase63FMarketBundleSnapshot({
      owner,
      view: null,
      focusWindow: null,
      coverageWindow: null,
      focusWindowKey: null,
      marketLoadStatus: "ready",
      marketLoadError: null,
    });
    owner.lastBundleReadyKey = "forced-key";
    const second = resolvePhase63FMarketBundleSnapshot({
      owner,
      view: null,
      focusWindow: null,
      coverageWindow: null,
      focusWindowKey: null,
      marketLoadStatus: "ready",
      marketLoadError: null,
    });
    expect(first.implemented).toBe(true);
    expect(second.implemented).toBe(true);
    expect(owner.lastBundleReadyKey).toBe("forced-key");
  });

  it("reset clears market owner controller state", () => {
    const owner = createPhase63FMarketLoadOwnerState();
    owner.controller.status = "ready";
    owner.panPrefetchLogKey = "x";
    resetPhase63FMarketLoadOwner(owner);
    expect(owner.controller.status).toBe("idle");
    expect(owner.panPrefetchLogKey).toBeNull();
  });

  it("wires WorkbenchContext to phase63F market bridge without dual owner", () => {
    const workbenchSource = readWorkspaceSource("src/shared/context/WorkbenchContext.tsx");
    expect(workbenchSource).toContain("phase63FMarketLoadBridge");
    expect(workbenchSource).toContain("phase63FMarketLoadOwner");
    expect(workbenchSource).toContain("runPhase63FMarketLoad");
    expect(workbenchSource).not.toContain("executeMarketWindowLoad");
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
});
