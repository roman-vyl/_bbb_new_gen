import { describe, expect, it } from "vitest";

import {
  collectForbiddenImportViolations,
  listRuntimeProductionModules,
  readRuntimeProductionModule,
  readWorkspaceSource,
  runtimeModulePath,
} from "./phase6StaticGuardUtils";

const RUNTIME_FORBIDDEN_IMPORT_PATTERNS = [
  /from\s+["']react-dom/,
  /from\s+["']lightweight-charts/,
  /from\s+["']react["']/,
];

const RUNTIME_FORBIDDEN_DIRECT_CACHE_MUTATION_PATTERNS = [
  /mergeCandlesWindowBundle/,
  /clearMarketResourceCache/,
  /seedCandlesWindow/,
];

const WORKBENCH_CHART_RUNTIME_OWNER_SYMBOLS = [
  "phase63DTraceOwner",
  "phase63EAuxOverlayOwner",
  "phase63FMarketLoadOwner",
];

const RENDER_VIEWPORT_RUNTIME_OWNER_SYMBOLS = [
  "dispatchChartInteraction",
  "runPhase63BRenderWindowInit",
  "runPhase63CSelectTradeFocusCommand",
];

describe("Phase 6.1 static import and ownership guards", () => {
  it("keeps ChartPanel on workbench integration hooks without runtime internals", () => {
    const chartPanelSource = readWorkspaceSource("src/features/chart/ChartPanel.tsx");
    const violations = collectForbiddenImportViolations(chartPanelSource, [
      /from\s+["']@\/features\/workbenchChartRuntime/,
      /useWorkbenchChartRuntime/,
    ]);
    expect(violations).toEqual([]);
    expect(chartPanelSource).toContain('from "@/shared/context/WorkbenchContext"');
    expect(chartPanelSource).toContain("useWorkbenchChart");
    expect(chartPanelSource).toContain("useWorkbenchRenderViewport");
  });

  it("forbids React DOM and Lightweight Charts imports in runtime v2 production modules", () => {
    const violations = listRuntimeProductionModules().flatMap((fileName) => {
      const source = readRuntimeProductionModule(fileName);
      return collectForbiddenImportViolations(source, RUNTIME_FORBIDDEN_IMPORT_PATTERNS).map(
        (pattern) => `${runtimeModulePath(fileName)}:${pattern}`,
      );
    });
    expect(violations).toEqual([]);
  });

  it("forbids direct market cache mutation helpers in runtime v2 production modules", () => {
    const violations = listRuntimeProductionModules().flatMap((fileName) => {
      const source = readRuntimeProductionModule(fileName);
      return collectForbiddenImportViolations(
        source,
        RUNTIME_FORBIDDEN_DIRECT_CACHE_MUTATION_PATTERNS,
      ).map((pattern) => `${runtimeModulePath(fileName)}:${pattern}`);
    });
    expect(violations).toEqual([]);
  });

  it("keeps trace/market owners in WorkbenchContext and render-window/viewport in integration layer", () => {
    const workbenchSource = readWorkspaceSource("src/shared/context/WorkbenchContext.tsx");
    for (const symbol of WORKBENCH_CHART_RUNTIME_OWNER_SYMBOLS) {
      expect(workbenchSource).toContain(symbol);
    }
    expect(workbenchSource).not.toContain("useWorkbenchChartRuntime");
    expect(workbenchSource).not.toContain("phase63BRenderWindowBridge");
    expect(workbenchSource).not.toContain("phase63CViewportCommandBridge");

    const renderViewportSource = readWorkspaceSource(
      "src/shared/context/WorkbenchRenderViewportContext.tsx",
    );
    for (const symbol of RENDER_VIEWPORT_RUNTIME_OWNER_SYMBOLS) {
      expect(renderViewportSource).toContain(symbol);
    }
  });

  it("does not wire runtime v2 hook into production WorkbenchContext exports", () => {
    const workbenchSource = readWorkspaceSource("src/shared/context/WorkbenchContext.tsx");
    expect(workbenchSource).not.toContain("useWorkbenchChartRuntime");
    expect(workbenchSource).not.toMatch(
      /from\s+["']@\/features\/workbenchChartRuntime\/useWorkbenchChartRuntime/,
    );
    expect(workbenchSource).toContain(
      'from "@/features/workbenchChartRuntime/chartRuntimeCutoverTelemetry"',
    );
    expect(workbenchSource).toContain(
      'from "@/features/workbenchChartRuntime/phase63EAuxOverlayBridge"',
    );
    expect(workbenchSource).toContain("resolvePhase63EModelRuntimeSlice");
    expect(workbenchSource).toContain(
      'from "@/features/workbenchChartRuntime/phase63DTraceEventsBridge"',
    );
    expect(workbenchSource).toContain(
      'from "@/features/workbenchChartRuntime/phase63EAuxOverlayBridge"',
    );
    expect(workbenchSource).toContain(
      'from "@/features/workbenchChartRuntime/phase63FMarketLoadBridge"',
    );
    expect(workbenchSource).toContain(
      'from "@/shared/context/WorkbenchRenderViewportContext"',
    );
    expect(workbenchSource).not.toContain(
      'from "@/features/workbenchChartRuntime/phase63BRenderWindowBridge"',
    );
    expect(workbenchSource).not.toContain(
      'from "@/features/workbenchChartRuntime/phase63CViewportCommandBridge"',
    );
    expect(workbenchSource).not.toContain("buildChartViewModel");
    expect(workbenchSource).not.toContain("useWorkbenchChartRuntime");
  });
});
