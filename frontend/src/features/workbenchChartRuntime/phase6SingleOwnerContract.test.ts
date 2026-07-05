import { describe, expect, it } from "vitest";

import { inactiveChartRuntimeOwnerFlags } from "./runtimeDebug";
import { createChartRuntimeInput } from "./runtimeInputAdapter";
import { createInitialChartRuntimeOutput } from "./useWorkbenchChartRuntime";
import {
  collectForbiddenImportViolations,
  readWorkspaceSource,
} from "./phase6StaticGuardUtils";

const PRE_CUTOVER_ALLOWED_WORKBENCH_RUNTIME_IMPORTS = [
  /from\s+["']@\/features\/workbenchChartRuntime\/chartRuntimeCutoverTelemetry["']/,
  /from\s+["']@\/features\/workbenchChartRuntime\/phase63DTraceEventsBridge["']/,
  /from\s+["']@\/features\/workbenchChartRuntime\/phase63EAuxOverlayBridge["']/,
  /from\s+["']@\/features\/workbenchChartRuntime\/phase63FMarketLoadBridge["']/,
  /from\s+["']@\/shared\/context\/WorkbenchRenderViewportContext["']/,
];

const PRE_CUTOVER_FORBIDDEN_WORKBENCH_IMPORTS = [
  /useWorkbenchChartRuntime/,
  /createChartRuntimeCompatibilityOutput/,
  /createWorkbenchChartRuntimeSlice/,
  /from\s+["']@\/features\/workbenchChartRuntime\/useWorkbenchChartRuntime/,
  /from\s+["']@\/features\/workbenchChartRuntime\/runtimeOutputAdapter["']/,
  /from\s+["']@\/features\/workbenchChartRuntime["']/,
  /buildChartViewModel/,
];

const PRE_CUTOVER_FORBIDDEN_FALLBACK_PATTERNS = [
  /legacyPipeline/i,
  /fallbackToOld/i,
  /oldPipelineOwner/i,
  /if\s*\(\s*!runtimeOutput[\s\S]*chartViewModel/i,
  /runtimeOutput\s*\?\?\s*chartViewModel/i,
];

describe("Phase 6.1 single-owner contract guards", () => {
  it("keeps production-mounted runtime v2 owner flags inactive before cutover", () => {
    const input = createChartRuntimeInput({
      reportLoadStatus: "ready",
      report: null,
      selectedRunId: "run-a",
      reloadToken: 0,
      selectedVariantKey: "exp_a",
      selectedVariant: null,
      selectedTradeId: 1,
      selectedTradeEntryTimeMs: 1_200_000,
      chartTradeFocusWarning: null,
      selectedBarTimeSec: 1_200,
      chartTimeframe: "5m",
      chartHeavyIoEnabled: true,
      contextOverlayRef: null,
      effectiveContextOverlayRef: null,
      contextOverlayRefOptions: [],
    });

    const output = createInitialChartRuntimeOutput(input);
    expect(output.debug.ownerFlags).toEqual(inactiveChartRuntimeOwnerFlags);
    expect(Object.values(output.debug.ownerFlags).every((flag) => flag === false)).toBe(true);
  });

  it("uses inert viewport and interaction callbacks before production cutover", () => {
    const output = createInitialChartRuntimeOutput(
      createChartRuntimeInput({
        reportLoadStatus: "loading",
        report: null,
        selectedRunId: "run-a",
        reloadToken: 0,
        selectedVariantKey: "exp_a",
        selectedVariant: null,
        selectedTradeId: null,
        selectedTradeEntryTimeMs: null,
        chartTradeFocusWarning: null,
        selectedBarTimeSec: null,
        chartTimeframe: "5m",
        chartHeavyIoEnabled: false,
        contextOverlayRef: null,
        effectiveContextOverlayRef: null,
        contextOverlayRefOptions: [],
      }),
    );

    expect(output.viewport.command).toBeNull();
    expect(output.viewport.commandSeq).toBe(0);
    expect(output.interaction.dispatch).toBeTypeOf("function");
    expect(() => output.interaction.dispatch({ type: "resize" })).not.toThrow();
    expect(() => output.viewport.acknowledge()).not.toThrow();
  });

  it("does not wire runtime v2 into WorkbenchContext production chart pipeline yet", () => {
    const workbenchSource = readWorkspaceSource("src/shared/context/WorkbenchContext.tsx");
    const violations = collectForbiddenImportViolations(
      workbenchSource,
      PRE_CUTOVER_FORBIDDEN_WORKBENCH_IMPORTS,
    );
    expect(violations).toEqual([]);
    for (const pattern of PRE_CUTOVER_ALLOWED_WORKBENCH_RUNTIME_IMPORTS) {
      expect(workbenchSource).toMatch(pattern);
    }
    expect(workbenchSource).not.toContain("useWorkbenchChartRuntime");
  });

  it("forbids old-pipeline fallback wiring patterns in WorkbenchContext", () => {
    const workbenchSource = readWorkspaceSource("src/shared/context/WorkbenchContext.tsx");
    const violations = collectForbiddenImportViolations(
      workbenchSource,
      PRE_CUTOVER_FORBIDDEN_FALLBACK_PATTERNS,
    );
    expect(violations).toEqual([]);
  });

  it("documents remaining WorkbenchContext orchestration owners after render-window extraction", () => {
    const workbenchSource = readWorkspaceSource("src/shared/context/WorkbenchContext.tsx");
    expect(workbenchSource).toContain("runPhase63DTraceLoadCycle");
    expect(workbenchSource).toContain("runPhase63FMarketLoad");
    expect(workbenchSource).toContain("phase63FMarketLoadOwner");
    expect(workbenchSource).not.toContain("executeMarketWindowLoad");
    expect(workbenchSource).toContain("phase63DTraceOwner");
    expect(workbenchSource).toContain("phase63EAuxOverlayOwner");
    expect(workbenchSource).toContain("useWorkbenchRenderViewport");
    expect(workbenchSource).not.toContain("phase63BRenderWindowOwnerRef");
    expect(workbenchSource).not.toContain("runPhase63CSelectTradeFocusCommand");
    expect(workbenchSource).not.toContain("runPhase63CForceTradeFocusCommand");

    const renderViewportSource = readWorkspaceSource(
      "src/shared/context/WorkbenchRenderViewportContext.tsx",
    );
    expect(renderViewportSource).toContain("runPhase63BRenderWindowInit");
    expect(renderViewportSource).toContain("runPhase63CForceTradeFocusCommand");
  });
});

describe("Phase 6.1 post-cutover dual-owner guard contract (encoded, not active yet)", () => {
  it("defines inactive owner flags as the only allowed pre-cutover production state", () => {
    expect(inactiveChartRuntimeOwnerFlags).toEqual({
      marketWindows: false,
      marketCacheWrites: false,
      renderWindow: false,
      viewportCommands: false,
      traceDisplayCache: false,
      denseLanesTrace: false,
      auxOverlays: false,
      finalChartModel: false,
    });
  });
});
