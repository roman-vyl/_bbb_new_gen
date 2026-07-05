import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RunReport, RunVariant } from "@/api/types";
import { clearMarketResourceCache, mergeCandlesWindowBundle } from "@/features/chart/marketResourceCache";
import { CHART_RENDER_WINDOW_SIZE } from "@/features/chart/chartViewWindow";
import {
  planCandlesWindowFetchForView,
  planEmaWindowFetchesForView,
  seedCandlesWindow,
} from "@/features/chart/marketWindowPlanner";
import { buildRunMarketViewIdentity, resolveRunMarketView } from "@/features/chart/runMarketView";
import {
  buildMarketTargetWindowKey,
  executeMarketWindowLoad,
  marketCandlesReadyForTarget,
  resolveMarketTargetWindow,
} from "@/features/chart/workbenchMarketLoad";

import { createChartRuntimeInput } from "./runtimeInputAdapter";
import { inactiveChartRuntimeOwnerFlags } from "./runtimeDebug";
import {
  resolveMarketFetchPlanRuntime,
  toRuntimeMarketFetchPlanDebug,
} from "./marketFetchPlanRuntime";
import { createMarketLoadHarness } from "./marketLoadHarness";
import {
  beginMarketLoadCycle,
  cancelMarketLoadCycle,
  createMarketLoadRuntimeController,
  runMarketLoadCycle,
} from "./marketLoadRuntime";
import { resolveMarketViewRuntime } from "./marketViewRuntime";
import { resolveMarketWindowRuntime } from "./marketWindowRuntime";
import type { ChartRuntimeInput } from "./runtimeTypes";
import { createInitialChartRuntimeOutput } from "./useWorkbenchChartRuntime";

const fetchCandlesWindow = vi.fn<typeof import("@/api/client").fetchCandlesWindow>();
const fetchEmaWindow = vi.fn<typeof import("@/api/client").fetchEmaWindow>();

vi.mock("@/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/client")>();
  return {
    ...actual,
    fetchCandlesWindow: (...args: Parameters<typeof fetchCandlesWindow>) =>
      fetchCandlesWindow(...args),
    fetchEmaWindow: (...args: Parameters<typeof fetchEmaWindow>) => fetchEmaWindow(...args),
  };
});

const EMPTY_METRICS = {
  long: { trades: 0, pnl: 0, return_pct: 0, profit_factor: null, win_rate: null },
  short: { trades: 0, pnl: 0, return_pct: 0, profit_factor: null, win_rate: null },
  total: {
    trades: 0,
    pnl: 0,
    return_pct: 0,
    profit_factor: null,
    win_rate: null,
    sharpe: 0,
    max_drawdown: 0,
  },
  open_trades: { long: 0, short: 0, total: 0 },
};

const TIMEFRAME_MS = 300_000;
const TARGET_SPAN_MS = CHART_RENDER_WINDOW_SIZE * TIMEFRAME_MS;

function makeVariant(overrides: Partial<RunVariant> = {}): RunVariant {
  return {
    variant: "exp_a",
    config_id: "cfg_a",
    symbol: "BTCUSDT",
    timeframe: "5m",
    strategy_spec: {
      anchor_stack: {
        fast: { period: 200 },
        anchor: { period: 500 },
        slow: { period: 1000 },
      },
    },
    metrics: EMPTY_METRICS,
    component_counters: [],
    trade_records: [],
    ...overrides,
  };
}

function makeReport(variant = makeVariant()): RunReport {
  return {
    run_id: "run-a",
    created_at: "2026-01-01T00:00:00Z",
    report_schema_version: 1,
    family: "ema_pullback",
    symbol: "BTCUSDT",
    timeframe: "5m",
    candles: 150_000,
    data_range: { from_open_time_ms: 0, to_open_time_ms: TARGET_SPAN_MS * 3 },
    variants: [variant],
    variants_count: 1,
  };
}

function makeInput(overrides: Partial<ChartRuntimeInput> = {}): ChartRuntimeInput {
  const selectedVariant = overrides.selectedVariant ?? makeVariant();
  const report = overrides.report ?? makeReport(selectedVariant);
  return createChartRuntimeInput({
    reportLoadStatus: "ready",
    report,
    selectedRunId: report.run_id,
    reloadToken: 2,
    selectedVariantKey: selectedVariant.variant,
    selectedVariant,
    selectedTradeId: null,
    selectedTradeEntryTimeMs: null,
    chartTradeFocusWarning: null,
    selectedBarTimeSec: null,
    chartTimeframe: "5m",
    chartHeavyIoEnabled: true,
    contextOverlayRef: null,
    effectiveContextOverlayRef: null,
    contextOverlayRefOptions: [],
    ...overrides,
  });
}

function resolveHarnessView(report = makeReport()) {
  const view = resolveRunMarketView({
    report,
    chartTimeframe: "5m",
    variant: report.variants[0]!,
    reloadToken: 0,
  });
  const viewIdentity = buildRunMarketViewIdentity(view);
  return { report, view, viewIdentity };
}

function mockMarketResponses(target: ReturnType<typeof resolveMarketTargetWindow>) {
  fetchCandlesWindow.mockResolvedValue({
    candles: [{ time: target.fromMs / 1000, open: 1, high: 1, low: 1, close: 1 }],
    coverage: {
      requested_from_ms: target.fromMs,
      requested_to_ms: target.toMs,
      actual_from_ms: target.fromMs,
      actual_to_ms: target.toMs,
      truncated: false,
    },
  });
  fetchEmaWindow.mockResolvedValue({
    points: [{ time: target.fromMs / 1000, value: 1, kind: "chart_overlay_ema" }],
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

describe("Phase 3B fetch plan runtime", () => {
  beforeEach(() => {
    clearMarketResourceCache();
  });

  it("matches old planner candles and EMA plans for focus/coverage windows", () => {
    const { view } = resolveHarnessView();
    const focusWindow = resolveMarketTargetWindow(view, null);
    const coverageWindow = focusWindow;

    const runtimePlan = resolveMarketFetchPlanRuntime({
      view,
      focusWindow,
      coverageWindow,
    });
    const oldCandlesPlan = planCandlesWindowFetchForView({ view, targetWindow: coverageWindow });
    const oldEmaPlans = planEmaWindowFetchesForView({ view, targetWindow: coverageWindow });

    expect(runtimePlan.candlesPlan).toEqual(oldCandlesPlan);
    expect(runtimePlan.emaPlans).toEqual(oldEmaPlans);
    expect(runtimePlan.plannedInFlightKeys).toEqual([
      ...(oldCandlesPlan !== null ? [oldCandlesPlan.inFlightKey] : []),
      ...oldEmaPlans.map((plan) => plan.inFlightKey),
    ]);
  });

  it("plans fetch against coverage window while readiness uses focus window", () => {
    const { view } = resolveHarnessView();
    const focusWindow = resolveMarketTargetWindow(view, null);
    const coverageWindow = {
      fromMs: focusWindow.fromMs - TIMEFRAME_MS * 100,
      toMs: focusWindow.toMs,
      toOpenTimeMs: focusWindow.toOpenTimeMs,
    };

    seedCandlesWindow(view.candlesKey, {
      candles: [{ time: focusWindow.fromMs / 1000, open: 1, high: 1, low: 1, close: 1 }],
      coverage: {
        requested_from_ms: focusWindow.fromMs,
        requested_to_ms: focusWindow.toMs,
        actual_from_ms: focusWindow.fromMs,
        actual_to_ms: focusWindow.toMs,
        truncated: false,
      },
    });

    const plan = resolveMarketFetchPlanRuntime({ view, focusWindow, coverageWindow });

    expect(plan.focusCandlesReady).toBe(true);
    expect(plan.coverageCandlesReady).toBe(false);
    expect(plan.candlesPlan).not.toBeNull();
    expect(plan.candlesPlan?.fromMs).toBeLessThan(focusWindow.fromMs);
  });

  it("derives fetch plan debug from Phase 3A identity/window inputs", () => {
    const input = makeInput();
    const marketView = resolveMarketViewRuntime(input);
    const marketWindow = resolveMarketWindowRuntime({
      view: marketView.view,
      marketIdentity: marketView.marketIdentity,
      expectedMarketIdentity: marketView.expectedMarketIdentity,
      selectedTradeEntryTimeMs: input.selectedTradeEntryTimeMs,
    });

    expect(marketView.view).not.toBeNull();
    expect(marketWindow.focusWindow).not.toBeNull();
    expect(marketWindow.coverageWindow).not.toBeNull();

    const plan = resolveMarketFetchPlanRuntime({
      view: marketView.view!,
      focusWindow: marketWindow.focusWindow!,
      coverageWindow: marketWindow.coverageWindow!,
    });

    expect(toRuntimeMarketFetchPlanDebug(plan)).toEqual({
      focusCandlesReady: plan.focusCandlesReady,
      coverageCandlesReady: plan.coverageCandlesReady,
      candlesInFlightKey: plan.candlesPlan?.inFlightKey ?? null,
      emaInFlightKeys: plan.emaPlans.map((entry) => entry.inFlightKey),
      plannedFetchCount: (plan.candlesPlan !== null ? 1 : 0) + plan.emaPlans.length,
    });
  });
});

describe("Phase 3B loader harness", () => {
  beforeEach(() => {
    clearMarketResourceCache();
    vi.clearAllMocks();
  });

  it("cold load fetches candles then EMA and reaches ready", async () => {
    const { report, view, viewIdentity } = resolveHarnessView();
    const target = resolveMarketTargetWindow(view, null);
    mockMarketResponses(target);

    const harness = createMarketLoadHarness({ view, viewIdentity });
    const result = await harness.runLoad({ symbol: report.symbol, timeframe: "5m" });

    expect(result.outcome).toBe("applied");
    expect(result.loadResult?.candlesFetched).toBe(true);
    expect(result.loadResult?.emaFetched).toBe(3);
    expect(result.state.status).toBe("ready");
    expect(result.state.readyIdentity).toBe(viewIdentity);
    expect(result.state.candlesRevision).toBe(1);
    expect(result.state.overlayRevision).toBe(3);
    expect(fetchCandlesWindow).toHaveBeenCalledTimes(1);
    expect(fetchEmaWindow).toHaveBeenCalledTimes(3);
  });

  it("cache hit skips candles fetch but still loads missing EMA", async () => {
    const { report, view, viewIdentity } = resolveHarnessView();
    const target = resolveMarketTargetWindow(view, null);
    mergeCandlesWindowBundle(view.candlesKey, {
      candles: [{ time: target.fromMs / 1000, open: 1, high: 1, low: 1, close: 1 }],
      coverage: {
        requested_from_ms: target.fromMs,
        requested_to_ms: target.toMs,
        actual_from_ms: target.fromMs,
        actual_to_ms: target.toMs,
        truncated: false,
      },
    });
    fetchEmaWindow.mockResolvedValue({
      points: [{ time: target.fromMs / 1000, value: 1, kind: "chart_overlay_ema" }],
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

    const harness = createMarketLoadHarness({ view, viewIdentity });
    const result = await harness.runLoad({ symbol: report.symbol, timeframe: "5m" });

    expect(result.outcome).toBe("cache_hit_ready");
    expect(result.loadResult?.candlesFetched).toBe(false);
    expect(result.focusReadyFromCache).toBe(true);
    expect(result.state.status).toBe("ready");
    expect(fetchCandlesWindow).not.toHaveBeenCalled();
    expect(fetchEmaWindow).toHaveBeenCalledTimes(3);
  });

  it("plans and fetches only the missing range when cache is partial", async () => {
    const { report, view, viewIdentity } = resolveHarnessView();
    const target = resolveMarketTargetWindow(view, null);
    const partialToMs = target.fromMs + TIMEFRAME_MS * 10;

    seedCandlesWindow(view.candlesKey, {
      candles: [{ time: target.fromMs / 1000, open: 1, high: 1, low: 1, close: 1 }],
      coverage: {
        requested_from_ms: target.fromMs,
        requested_to_ms: partialToMs,
        actual_from_ms: target.fromMs,
        actual_to_ms: partialToMs,
        truncated: false,
      },
    });

    const plan = resolveMarketFetchPlanRuntime({ view, focusWindow: target, coverageWindow: target });
    expect(plan.candlesPlan).not.toBeNull();
    expect(plan.candlesPlan?.fromMs).toBeGreaterThan(target.fromMs);

    mockMarketResponses(target);
    const harness = createMarketLoadHarness({ view, viewIdentity });
    await harness.runLoad({ symbol: report.symbol, timeframe: "5m" });

    expect(fetchCandlesWindow).toHaveBeenCalledTimes(1);
    expect(fetchCandlesWindow.mock.calls[0]?.[0]?.fromMs).toBe(plan.candlesPlan?.fromMs);
  });

  it("ignores stale responses when generation advances and intended identity changes", async () => {
    const { report, view, viewIdentity } = resolveHarnessView();
    const target = resolveMarketTargetWindow(view, null);
    const controller = createMarketLoadRuntimeController();
    const focusKey = buildMarketTargetWindowKey(viewIdentity, target);
    const coverageKey = focusKey;

    let releaseFetch: (() => void) | undefined;
    const executeLoad = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        releaseFetch = resolve;
      });
      return { candlesFetched: true, emaFetched: 0 };
    });

    const loadGeneration = beginMarketLoadCycle(controller, viewIdentity);
    const pending = runMarketLoadCycle(controller, {
      view,
      viewIdentity,
      focusWindow: target,
      coverageWindow: target,
      focusKey,
      coverageKey,
      symbol: report.symbol,
      timeframe: "5m",
      signal: new AbortController().signal,
      loadGeneration,
      executeLoad,
    });

    cancelMarketLoadCycle(controller);
    controller.intendedIdentity = "stale-identity";
    releaseFetch?.();
    const result = await pending;

    expect(result.outcome).toBe("stale_response");
    expect(result.state.status).not.toBe("ready");
    expect(result.state.readyIdentity).toBeNull();
  });

  it("completes applied when candles abort but EMA overlays still seed", async () => {
    const { report, view, viewIdentity } = resolveHarnessView();
    const target = resolveMarketTargetWindow(view, null);
    fetchCandlesWindow.mockImplementation(({ signal }) =>
      new Promise((_resolve, reject) => {
        if (signal?.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        signal?.addEventListener(
          "abort",
          () => {
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      }),
    );
    fetchEmaWindow.mockResolvedValue({
      points: [{ time: target.fromMs / 1000, value: 1, kind: "chart_overlay_ema" }],
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

    const controller = createMarketLoadRuntimeController();
    const focusKey = buildMarketTargetWindowKey(viewIdentity, target);
    const abortController = new AbortController();
    const loadGeneration = beginMarketLoadCycle(controller, viewIdentity);
    const pending = runMarketLoadCycle(controller, {
      view,
      viewIdentity,
      focusWindow: target,
      coverageWindow: target,
      focusKey,
      coverageKey: focusKey,
      symbol: report.symbol,
      timeframe: "5m",
      signal: abortController.signal,
      loadGeneration,
    });

    abortController.abort();
    const result = await pending;

    expect(result.outcome).toBe("applied");
    expect(result.loadResult?.emaFetched).toBe(3);
    expect(result.state.status).not.toBe("error");
    expect(result.state.error).toBeNull();
  });

  it("clears in-flight keys on cancel so the next load can fetch EMA overlays", async () => {
    const { report, view, viewIdentity } = resolveHarnessView();
    const target = resolveMarketTargetWindow(view, null);
    const plan = resolveMarketFetchPlanRuntime({ view, focusWindow: target, coverageWindow: target });
    expect(plan.emaPlans.length).toBeGreaterThan(0);

    const controller = createMarketLoadRuntimeController();
    controller.inFlightKeys.add(plan.emaPlans[0]!.inFlightKey);

    mockMarketResponses(target);
    cancelMarketLoadCycle(controller);
    expect(controller.inFlightKeys.size).toBe(0);

    const loadGeneration = beginMarketLoadCycle(controller, viewIdentity);
    const focusKey = buildMarketTargetWindowKey(viewIdentity, target);
    const result = await runMarketLoadCycle(controller, {
      view,
      viewIdentity,
      focusWindow: target,
      coverageWindow: target,
      focusKey,
      coverageKey: focusKey,
      symbol: report.symbol,
      timeframe: "5m",
      signal: new AbortController().signal,
      loadGeneration,
    });

    expect(result.loadResult?.emaFetched).toBe(3);
    expect(fetchEmaWindow).toHaveBeenCalledTimes(3);
  });

  it("dedupes duplicate in-flight keys across concurrent loads", async () => {
    const { report, view, viewIdentity } = resolveHarnessView();
    const target = resolveMarketTargetWindow(view, null);
    const plan = resolveMarketFetchPlanRuntime({ view, focusWindow: target, coverageWindow: target });
    expect(plan.candlesPlan).not.toBeNull();

    const controller = createMarketLoadRuntimeController();
    controller.inFlightKeys.add(plan.candlesPlan!.inFlightKey);

    mockMarketResponses(target);
    const loadGeneration = beginMarketLoadCycle(controller, viewIdentity);
    const focusKey = buildMarketTargetWindowKey(viewIdentity, target);
    const result = await runMarketLoadCycle(controller, {
      view,
      viewIdentity,
      focusWindow: target,
      coverageWindow: target,
      focusKey,
      coverageKey: focusKey,
      symbol: report.symbol,
      timeframe: "5m",
      signal: new AbortController().signal,
      loadGeneration,
    });

    expect(result.loadResult?.candlesFetched).toBe(false);
    expect(fetchCandlesWindow).not.toHaveBeenCalled();
    expect(fetchEmaWindow).toHaveBeenCalledTimes(3);
  });

  it("marks ready when focus candles become ready before EMA overlays finish", async () => {
    const { report, view, viewIdentity } = resolveHarnessView();
    const target = resolveMarketTargetWindow(view, null);
    mockMarketResponses(target);

    const controller = createMarketLoadRuntimeController();
    const focusKey = buildMarketTargetWindowKey(viewIdentity, target);
    const loadGeneration = beginMarketLoadCycle(controller, viewIdentity);

    let candlesReadyAfterChunk = false;
    const executeLoad = vi.fn(async (input) => {
      const base = await executeMarketWindowLoad(input);
      candlesReadyAfterChunk = marketCandlesReadyForTarget(view, target);
      return base;
    });

    const result = await runMarketLoadCycle(controller, {
      view,
      viewIdentity,
      focusWindow: target,
      coverageWindow: target,
      focusKey,
      coverageKey: focusKey,
      symbol: report.symbol,
      timeframe: "5m",
      signal: new AbortController().signal,
      loadGeneration,
      executeLoad,
    });

    expect(candlesReadyAfterChunk).toBe(true);
    expect(result.state.status).toBe("ready");
    expect(result.state.candlesRevision).toBe(1);
    expect(result.state.overlayRevision).toBe(3);
  });
});

describe("Phase 3B production-mounted runtime remains inactive", () => {
  it("computes fetch plan debug only and keeps owner flags false", () => {
    const output = createInitialChartRuntimeOutput(makeInput());

    expect(output.market.status).toBe("idle");
    expect(output.market.candlesSource).toBe("unavailable");
    expect(output.debug.ownerFlags).toEqual(inactiveChartRuntimeOwnerFlags);
    expect(output.debug.marketFetchPlan).not.toBeNull();
    expect(output.debug.marketFetchPlan?.plannedFetchCount).toBeGreaterThan(0);
    expect(output.debug.marketFetchPlan?.focusCandlesReady).toBe(false);
  });
});
