import { describe, expect, it } from "vitest";

import { createChartRuntimeInput } from "./runtimeInputAdapter";
import { createInitialChartRuntimeOutput } from "./useWorkbenchChartRuntime";

describe("workbenchChartRuntime Phase 2 contracts", () => {
  it("creates an inert initial runtime output without active owner flags", () => {
    const input = createChartRuntimeInput({
      reportLoadStatus: "loading",
      report: null,
      selectedRunId: "run-1",
      reloadToken: 0,
      selectedVariantKey: "instance_1",
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
    });

    const output = createInitialChartRuntimeOutput(input);

    expect(output.chartViewModel.candles).toEqual([]);
    expect(output.chartViewModel.seriesKey).toBe("::0:empty:");
    expect(output.market.status).toBe("idle");
    expect(output.market.candlesSource).toBe("unavailable");
    expect(output.trace.lanesSignalTraceStatus).toBe("idle");
    expect(output.viewport.command).toBeNull();
    expect(output.debug.runId).toBe("run-1");
    expect(output.debug.cutoverPhase).toBe("6.3E");
    expect(output.debug.domainOwners).toEqual({
      model: "runtime_v2_production",
      render_window: "runtime_v2_production",
      viewport: "runtime_v2_production",
      trace: "runtime_v2_production",
      aux_overlay: "runtime_v2_production",
      market: "old_production",
    });
    expect(output.debug.ownerFlags).toEqual({
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
