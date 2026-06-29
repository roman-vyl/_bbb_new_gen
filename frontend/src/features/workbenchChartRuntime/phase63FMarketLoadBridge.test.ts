import { describe, expect, it } from "vitest";

import {
  chartRuntimeCutoverConfig,
  PHASE_63F_DOMAIN_OWNERS,
} from "./chartRuntimeCutoverConfig";
import {
  hasRuntimeV2ProductionOwner,
  runtimeV2ProductionDomains,
} from "./chartRuntimeCutoverTelemetry";
import { makePhase6Report, makePhase6Variant } from "./phase6ContractFixtures";
import {
  collectForbiddenImportViolations,
  readWorkspaceSource,
} from "./phase6StaticGuardUtils";
import { createMarketLoadRuntimeController } from "./marketLoadRuntime";
import {
  applyPhase63FPanPrefetchCoverage,
  createPhase63FMarketLoadOwnerState,
  resetPhase63FMarketLoadOwner,
  resolvePhase63FMarketBundleSnapshot,
  resolvePhase63FMarketTargetWindows,
  resolvePhase63FMarketView,
} from "./phase63FMarketLoadBridge";
import { resolveRunMarketView } from "@/features/chart/runMarketView";
import {
  marketWindowChunkMs,
  resolveMarketTargetWindow,
} from "@/features/chart/workbenchMarketLoad";
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
    owner.coverageTargetWindow = { fromMs: 1, toMs: 2, toOpenTimeMs: 1 };
    owner.coverageResetKey = "reset";
    resetPhase63FMarketLoadOwner(owner);
    expect(owner.controller.status).toBe("idle");
    expect(owner.panPrefetchLogKey).toBeNull();
    expect(owner.coverageTargetWindow).toBeNull();
    expect(owner.coverageResetKey).toBeNull();
  });

  it("resolvePhase63FMarketTargetWindows uses focus when coverageTargetWindow is null", () => {
    const report = makePhase6Report();
    const view = resolveRunMarketView({
      report,
      chartTimeframe: "5m",
      variant: report.variants[0]!,
      reloadToken: 0,
    });
    const viewIdentity = resolvePhase63FMarketView({
      report,
      chartTimeframe: "5m",
      variant: report.variants[0]!,
      reloadToken: 0,
    });
    expect(viewIdentity.outcome).toBe("ok");
    if (viewIdentity.outcome !== "ok") {
      return;
    }
    const owner = createPhase63FMarketLoadOwnerState();
    const resolved = resolvePhase63FMarketTargetWindows({
      owner,
      view,
      viewIdentity: viewIdentity.viewIdentity,
      selectedTradeEntryTimeMs: null,
    });
    const focusWindow = resolveMarketTargetWindow(view, null);
    expect(owner.coverageTargetWindow).toBeNull();
    expect(resolved.coverageWindow).toEqual(focusWindow);
    expect(resolved.focusWindow).toEqual(focusWindow);
  });

  it("applyPhase63FPanPrefetchCoverage stores expanded coverage and clears readyTargetKey", () => {
    const owner = createPhase63FMarketLoadOwnerState();
    owner.controller.readyTargetKey = "ready";
    const expanded = { fromMs: 500_000, toMs: 1_500_000, toOpenTimeMs: 1_200_000 };
    expect(applyPhase63FPanPrefetchCoverage(owner, expanded)).toBe(true);
    expect(owner.coverageTargetWindow).toEqual(expanded);
    expect(owner.controller.readyTargetKey).toBeNull();
    expect(applyPhase63FPanPrefetchCoverage(owner, expanded)).toBe(false);
  });

  it("resolvePhase63FMarketTargetWindows preserves expanded coverage when reset key is unchanged", () => {
    const report = makePhase6Report();
    const view = resolveRunMarketView({
      report,
      chartTimeframe: "5m",
      variant: report.variants[0]!,
      reloadToken: 0,
    });
    const viewIdentity = resolvePhase63FMarketView({
      report,
      chartTimeframe: "5m",
      variant: report.variants[0]!,
      reloadToken: 0,
    });
    expect(viewIdentity.outcome).toBe("ok");
    if (viewIdentity.outcome !== "ok") {
      return;
    }
    const owner = createPhase63FMarketLoadOwnerState();
    const initial = resolvePhase63FMarketTargetWindows({
      owner,
      view,
      viewIdentity: viewIdentity.viewIdentity,
      selectedTradeEntryTimeMs: null,
    });
    const chunkMs = marketWindowChunkMs(300_000);
    const expanded = {
      ...initial.coverageWindow,
      fromMs: Math.max(report.data_range.from_open_time_ms, initial.coverageWindow.fromMs - chunkMs),
    };
    applyPhase63FPanPrefetchCoverage(owner, expanded);
    const next = resolvePhase63FMarketTargetWindows({
      owner,
      view,
      viewIdentity: viewIdentity.viewIdentity,
      selectedTradeEntryTimeMs: null,
    });
    expect(next.focusWindow).toEqual(initial.focusWindow);
    expect(next.coverageWindow).toEqual(expanded);
  });

  it("resolvePhase63FMarketTargetWindows resets expanded coverage when selected trade changes", () => {
    const report = makePhase6Report(
      makePhase6Variant({
        trade_records: [
          {
            trade_id: 1,
            direction: "long",
            status: "closed",
            entry_time_ms: 1_100_000,
            exit_time_ms: 1_200_000,
            entry_price: 100,
            exit_price: 101,
            exit_reason: "signal:exit",
            size: 1,
            pnl: 1,
            return_pct: 0.01,
          },
          {
            trade_id: 2,
            direction: "long",
            status: "closed",
            entry_time_ms: 1_300_000,
            exit_time_ms: 1_400_000,
            entry_price: 102,
            exit_price: 103,
            exit_reason: "signal:exit",
            size: 1,
            pnl: 1,
            return_pct: 0.01,
          },
        ],
      }),
    );
    const view = resolveRunMarketView({
      report,
      chartTimeframe: "5m",
      variant: report.variants[0]!,
      reloadToken: 0,
    });
    const viewIdentity = resolvePhase63FMarketView({
      report,
      chartTimeframe: "5m",
      variant: report.variants[0]!,
      reloadToken: 0,
    });
    expect(viewIdentity.outcome).toBe("ok");
    if (viewIdentity.outcome !== "ok") {
      return;
    }
    const owner = createPhase63FMarketLoadOwnerState();
    const initial = resolvePhase63FMarketTargetWindows({
      owner,
      view,
      viewIdentity: viewIdentity.viewIdentity,
      selectedTradeEntryTimeMs: 1_100_000,
    });
    const expanded = {
      ...initial.coverageWindow,
      fromMs: Math.max(report.data_range.from_open_time_ms, initial.coverageWindow.fromMs - 1_000_000),
    };
    applyPhase63FPanPrefetchCoverage(owner, expanded);
    const next = resolvePhase63FMarketTargetWindows({
      owner,
      view,
      viewIdentity: viewIdentity.viewIdentity,
      selectedTradeEntryTimeMs: 1_300_000,
    });
    expect(owner.coverageTargetWindow).toBeNull();
    expect(next.coverageWindow).toEqual(next.focusWindow);
    expect(next.focusWindow).toEqual(resolveMarketTargetWindow(view, 1_300_000));
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
