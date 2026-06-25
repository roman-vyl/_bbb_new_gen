import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearMarketResourceCache, mergeCandlesWindowBundle } from "@/features/chart/marketResourceCache";
import { buildRunMarketViewIdentity, resolveRunMarketView } from "@/features/chart/runMarketView";
import { resolveMarketTargetWindow } from "@/features/chart/workbenchMarketLoad";
import { createChartRuntimeInput } from "./runtimeInputAdapter";
import {
  createChartModelStabilizeCache,
  resolveChartModelRuntime,
} from "./chartModelRuntime";
import {
  applyTraceDisplayForWindow,
  createTraceDisplayRuntimeController,
  resetTraceDisplayRuntimeCache,
  buildTraceDisplayCacheKeyForRuntime,
} from "./traceDisplayRuntime";
import {
  createChartRuntimeStabilizationController,
  resolveStableChartRuntimeOutput,
  resolveStableChartRuntimeOutputTwice,
  resolveStableDisplayViewMode,
  runStableMarketLoadCycle,
} from "./runtimeOutputStabilizationHarness";
import {
  createDisplayRenderViewportHarness,
} from "./displayRenderViewportHarness";
import {
  acknowledgeViewportCommandCandidate,
  createViewportRuntimeState,
  recordViewportCommandCandidate,
} from "./viewportRuntime";
import { evaluatePanPrefetchCandidate } from "./panRuntime";
import { createMarketLoadHarness } from "./marketLoadHarness";
import {
  makePhase6Candles,
  makePhase6Report,
  makePhase6Variant,
} from "./phase6ContractFixtures";
import type { ChartRuntimeInput } from "./runtimeTypes";

const fetchEmaWindow = vi.fn<typeof import("@/api/client").fetchEmaWindow>();

vi.mock("@/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/client")>();
  return {
    ...actual,
    fetchEmaWindow: (...args: Parameters<typeof fetchEmaWindow>) => fetchEmaWindow(...args),
  };
});

function makeReadyRuntimeInput(
  overrides: Partial<ChartRuntimeInput> = {},
): ChartRuntimeInput {
  const variant = makePhase6Variant();
  const report = makePhase6Report(variant);
  return createChartRuntimeInput({
    reportLoadStatus: "ready",
    report,
    selectedRunId: report.run_id,
    reloadToken: 0,
    selectedVariantKey: variant.variant,
    selectedVariant: variant,
    selectedTradeId: null,
    selectedTradeEntryTimeMs: null,
    chartTradeFocusWarning: null,
    selectedBarTimeSec: null,
    chartTimeframe: "5m",
    chartHeavyIoEnabled: true,
    contextOverlayRef: null,
    effectiveContextOverlayRef: null,
    contextOverlayRefOptions: [],
    chartFocusIntent: { type: "none" },
    ...overrides,
  });
}

function seedMarketCacheForInput(input: ChartRuntimeInput): void {
  const view = resolveRunMarketView({
    report: input.report!,
    chartTimeframe: input.chartTimeframe,
    variant: input.selectedVariant!,
    reloadToken: input.reloadToken,
  });
  const target = resolveMarketTargetWindow(view, input.selectedTradeEntryTimeMs);
  const candles = makePhase6Candles(120, Math.floor(target.fromMs / 1000));
  mergeCandlesWindowBundle(view.candlesKey, {
    candles,
    coverage: {
      requested_from_ms: target.fromMs,
      requested_to_ms: target.toMs,
      actual_from_ms: target.fromMs,
      actual_to_ms: target.toMs,
      truncated: false,
    },
  });
  fetchEmaWindow.mockResolvedValue({
    points: [{ time: candles[0]!.time, value: 1, kind: "chart_overlay_ema" }],
    coverage: {
      requested_from_ms: target.fromMs,
      requested_to_ms: target.toMs,
      actual_from_ms: target.fromMs,
      actual_to_ms: target.toMs,
      calculation_origin_ms: target.fromMs,
      coverage_to_ms: target.toMs,
      cache_hit: false,
      truncated: false,
    },
  });
}

describe("Phase 6.2 runtime output stabilization harness", () => {
  beforeEach(() => {
    clearMarketResourceCache();
    fetchEmaWindow.mockReset();
  });

  it("keeps chartViewModel and slice references stable across unchanged resolve cycles", async () => {
    const input = makeReadyRuntimeInput();
    seedMarketCacheForInput(input);
    const controller = createChartRuntimeStabilizationController();
    await runStableMarketLoadCycle(controller, input, {
      executeLoad: async () => ({ candlesFetched: false, emaFetched: 0 }),
    });

    const { first, second } = resolveStableChartRuntimeOutputTwice(controller, input);

    expect(first.chartViewModel).toBe(second.chartViewModel);
    expect(first.chartViewModel.candles).toBe(second.chartViewModel.candles);
    expect(first.chartViewModel.emaOverlays).toBe(second.chartViewModel.emaOverlays);
    expect(first.display.displayApplyRevision).toBe(second.display.displayApplyRevision);
    expect(first.debug.ownerFlags).toEqual(second.debug.ownerFlags);
  });

  it("does not bump displayApplyRevision on repeated trace apply with unchanged window", () => {
    const controller = createTraceDisplayRuntimeController();
    const cacheKey = buildTraceDisplayCacheKeyForRuntime({
      selectedRunId: "run-a",
      selectedVariantKey: "exp_a",
      effectiveContextOverlayRef: null,
    });
    resetTraceDisplayRuntimeCache(controller, cacheKey);
    const candles = makePhase6Candles(20);

    const first = applyTraceDisplayForWindow(controller, candles, "ready");
    const revisionAfterFirst = controller.displayApplyRevision;
    const second = applyTraceDisplayForWindow(controller, candles, "ready");

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(controller.displayApplyRevision).toBe(revisionAfterFirst);
  });

  it("keeps chart model object stable when stability key is unchanged", () => {
    const candles = makePhase6Candles(40);
    const parts = {
      candles,
      emaOverlays: [],
      auxEmaOverlays: [],
      componentEvents: [],
    };
    const traceDisplay = {
      implemented: true as const,
      status: "idle" as const,
      componentEvents: [],
      componentEventsStale: false,
      displayApplyRevision: 1,
      missingRange: null,
      traceDisplayState: {
        status: "current" as const,
        fromSec: candles[0]!.time,
        toSec: candles[candles.length - 1]!.time,
        events: [],
        htfSlice: { times: [], htf_context: undefined },
        coveredRanges: [],
        missingRange: null,
      },
      displayCacheCoversWindow: true,
      displayCacheHasWindowData: false,
    };
    const auxOverlay = {
      implemented: true as const,
      auxEmaOverlays: [],
      displayAuxEmaOverlays: [],
      htfAuxEmaOverlayStale: false,
      auxOverlayCount: 0,
      htfOverlayCount: 0,
      auxEmaSpecs: [],
    };
    const cache = createChartModelStabilizeCache();
    const modelInput = {
      chartWindowParts: parts,
      displayAuxEmaOverlays: [],
      traceDisplay,
      auxOverlay,
      viewMode: "around-trade" as const,
      centerTimeSec: 1_200,
      firstTimeSec: candles[0]!.time,
      lastTimeSec: candles[candles.length - 1]!.time,
      count: candles.length,
      stabilizeCache: cache,
    };

    const first = resolveChartModelRuntime(modelInput);
    const second = resolveChartModelRuntime(modelInput);

    expect(first.chartViewModel).toBe(second.chartViewModel);
  });

  it("does not re-init render window when foundation key is unchanged", () => {
    const report = makePhase6Report();
    const variant = makePhase6Variant();
    const view = resolveRunMarketView({
      report,
      chartTimeframe: "5m",
      variant,
      reloadToken: 0,
    });
    const candles = makePhase6Candles(120);
    const bundle = { candles, ema_overlays: [] as never[] };
    const harness = createDisplayRenderViewportHarness({
      bundle,
      foundationKey: "foundation-a",
      view,
      focusWindow: resolveMarketTargetWindow(view, null),
      coverageWindow: resolveMarketTargetWindow(view, null),
      marketLoadStatus: "ready",
      chartTimeframe: "5m",
      marketIdentity: "identity-a",
    });

    harness.initialize(null);
    const revisionAfterInit = harness.context.renderController.revision;
    harness.initialize(null);
    expect(harness.context.renderController.revision).toBe(revisionAfterInit);
  });

  it("suppresses duplicate viewport command seq for unchanged focus candidate", () => {
    const state = createViewportRuntimeState();
    state.controller.dispatch({ type: "trade_selected", entryTimeSec: 1_200 });
    const first = recordViewportCommandCandidate(state, {
      type: "focusTrade",
      entryTimeSec: 1_200,
    });
    const second = recordViewportCommandCandidate(state, {
      type: "focusTrade",
      entryTimeSec: 1_200,
    });

    expect(first).toEqual({ type: "focusTrade", entryTimeSec: 1_200 });
    expect(second).toBeNull();
    expect(state.commandSeq).toBe(1);
    acknowledgeViewportCommandCandidate(state);
  });

  it("does not expand coverage on suppressed programmatic pan", () => {
    const report = makePhase6Report();
    const view = resolveRunMarketView({
      report,
      chartTimeframe: "5m",
      variant: makePhase6Variant(),
      reloadToken: 0,
    });
    const coverageWindow = resolveMarketTargetWindow(view, null);
    const decision = evaluatePanPrefetchCandidate({
      view,
      coverageWindow,
      visibleFromSec: 1_000,
      visibleToSec: 1_050,
      timeframeMs: 300_000,
      chartHeavyIoEnabled: true,
      interactionState: "user_panning",
      programmaticViewportActive: true,
    });

    expect(decision.expansion).toBeNull();
    expect(decision.suppressedProgrammatic).toBe(true);
  });

  it("does not promote market ready state on repeated cache-hit cycles", async () => {
    const input = makeReadyRuntimeInput();
    seedMarketCacheForInput(input);
    const view = resolveRunMarketView({
      report: input.report!,
      chartTimeframe: input.chartTimeframe,
      variant: input.selectedVariant!,
      reloadToken: input.reloadToken,
    });
    const viewIdentity = buildRunMarketViewIdentity(view);
    const harness = createMarketLoadHarness({ view, viewIdentity });
    const executeLoad = async () => ({ candlesFetched: false, emaFetched: 0 });

    const first = await harness.runLoad({
      symbol: input.report!.symbol,
      timeframe: input.chartTimeframe,
      executeLoad,
    });
    const revisionBefore = harness.context.controller.candlesRevision;
    const second = await harness.runLoad({
      symbol: input.report!.symbol,
      timeframe: input.chartTimeframe,
      executeLoad,
    });

    expect(first.outcome).toBe("cache_hit_ready");
    expect(second.outcome).toBe("applied");
    expect(second.focusReadyFromCache).toBe(false);
    expect(harness.context.controller.candlesRevision).toBe(revisionBefore);
  });

  it("represents selected trade focus as around-trade without tail fallback", async () => {
    const entryTimeMs = 1_200_000;
    const input = makeReadyRuntimeInput({
      selectedTradeId: 1,
      selectedTradeEntryTimeMs: entryTimeMs,
    });
    seedMarketCacheForInput(input);
    const controller = createChartRuntimeStabilizationController();
    await runStableMarketLoadCycle(controller, input, {
      executeLoad: async () => ({ candlesFetched: false, emaFetched: 0 }),
    });
    const output = resolveStableChartRuntimeOutput(controller, input);

    expect(output.debug.marketWindowFocusMode).toBe("around-trade");
    expect(output.chartViewModel.viewMode).toBe("around-trade");
    expect(output.chartViewModel.centerTimeSec).toBe(Math.floor(entryTimeMs / 1000));
    expect(resolveStableDisplayViewMode(input).mode).toBe("around-trade");
  });

  it("preserves market window refs when reset key is unchanged", () => {
    const controller = createChartRuntimeStabilizationController();
    const input = makeReadyRuntimeInput({ selectedTradeEntryTimeMs: 1_200_000 });
    resolveStableChartRuntimeOutput(controller, input);
    const firstFocus = controller.marketWindowState?.focusWindow ?? null;

    resolveStableChartRuntimeOutput(controller, input);
    const secondFocus = controller.marketWindowState?.focusWindow ?? null;

    expect(firstFocus).not.toBeNull();
    expect(secondFocus).toBe(firstFocus);
  });

  it("changes output references only when trade entry changes", async () => {
    const input = makeReadyRuntimeInput();
    seedMarketCacheForInput(input);
    const controller = createChartRuntimeStabilizationController();
    await runStableMarketLoadCycle(controller, input, {
      executeLoad: async () => ({ candlesFetched: false, emaFetched: 0 }),
    });
    const tailOutput = resolveStableChartRuntimeOutput(controller, input);

    const tradeInput = { ...input, selectedTradeEntryTimeMs: 1_200_000, selectedTradeId: 1 };
    seedMarketCacheForInput(tradeInput);
    await runStableMarketLoadCycle(controller, tradeInput, {
      executeLoad: async () => ({ candlesFetched: false, emaFetched: 0 }),
    });
    const tradeOutput = resolveStableChartRuntimeOutput(controller, tradeInput);

    expect(tailOutput.chartViewModel.viewMode).toBe("tail");
    expect(tradeOutput.chartViewModel.viewMode).toBe("around-trade");
    expect(tradeOutput.chartViewModel).not.toBe(tailOutput.chartViewModel);
  });
});
