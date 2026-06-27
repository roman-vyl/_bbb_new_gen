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
  "executeMarketWindowLoad",
  "composeDisplayMarketWindowBundle",
  "dispatchChartInteraction",
  "signalTraceDisplayCacheRef",
  "phase63CViewportOwner",
  "emitChartViewportCommand",
];

describe("Phase 6.1 static import and ownership guards", () => {
  it("keeps ChartPanel on WorkbenchContext chart API without runtime internals", () => {
    const chartPanelSource = readWorkspaceSource("src/features/chart/ChartPanel.tsx");
    const violations = collectForbiddenImportViolations(chartPanelSource, [
      /from\s+["']@\/features\/workbenchChartRuntime/,
      /useWorkbenchChartRuntime/,
    ]);
    expect(violations).toEqual([]);
    expect(chartPanelSource).toContain('from "@/shared/context/WorkbenchContext"');
    expect(chartPanelSource).toContain("useWorkbenchChart");
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

  it("keeps old WorkbenchContext chart-runtime owners present before Phase 7 deletion", () => {
    const workbenchSource = readWorkspaceSource("src/shared/context/WorkbenchContext.tsx");
    for (const symbol of WORKBENCH_CHART_RUNTIME_OWNER_SYMBOLS) {
      expect(workbenchSource).toContain(symbol);
    }
    expect(workbenchSource).not.toContain("useWorkbenchChartRuntime");
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
      'from "@/features/workbenchChartRuntime/phase63AModelAdapterBridge"',
    );
    expect(workbenchSource).toContain(
      'from "@/features/workbenchChartRuntime/phase63BRenderWindowBridge"',
    );
    expect(workbenchSource).toContain(
      'from "@/features/workbenchChartRuntime/phase63CViewportCommandBridge"',
    );
    expect(workbenchSource).not.toContain("buildChartViewModel");
    expect(workbenchSource).not.toContain("useWorkbenchChartRuntime");
  });
});
