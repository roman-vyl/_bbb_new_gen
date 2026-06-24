import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ChartAuxEmaOverlay,
  ChartBar,
  ChartEventsBundle,
  ComponentEvent,
  RunReport,
  RunVariant,
  SignalTraceBundle,
} from "@/api/types";
import { clearMarketResourceCache, mergeCandlesWindowBundle } from "@/features/chart/marketResourceCache";
import { resolveRunMarketView, buildRunMarketViewIdentity } from "@/features/chart/runMarketView";
import {
  buildMarketTargetWindowKey,
  resolveMarketTargetWindow,
  type MarketDisplayWindowMs,
} from "@/features/chart/workbenchMarketLoad";
import { mergeDisplayChunkFromChartEvents } from "@/features/chart/signalTraceDisplayCache";
import { resetChartEventsFlagDisabledNoteForTests } from "@/features/chart/runtime/chartEventsLoad";
import {
  loadDenseLanesTrace,
  loadDisplayTraceChunk,
} from "@/features/chart/runtime/workbenchTraceNetworkLoad";
import { deriveTraceDisplayStateForCandles } from "@/features/chart/traceDisplayApply";
import { inactiveChartRuntimeOwnerFlags } from "./runtimeDebug";
import { createChartRuntimeInput } from "./runtimeInputAdapter";
import { createInitialChartRuntimeOutput } from "./useWorkbenchChartRuntime";
import {
  createTraceDisplayRuntimeController,
  resetTraceDisplayRuntimeCache,
  applyTraceDisplayForWindow,
} from "./traceDisplayRuntime";
import { resolveChartEventsRuntimeSnapshot } from "./chartEventsRuntime";
import { createTraceEventsOverlaysHarness } from "./traceEventsOverlaysHarness";

const fetchChartEvents = vi.fn<typeof import("@/api/client").fetchChartEvents>();
const fetchSignalTrace = vi.fn<typeof import("@/api/client").fetchSignalTrace>();

vi.mock("@/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/client")>();
  return {
    ...actual,
    fetchChartEvents: (...args: Parameters<typeof fetchChartEvents>) => fetchChartEvents(...args),
    fetchSignalTrace: (...args: Parameters<typeof fetchSignalTrace>) => fetchSignalTrace(...args),
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

const TRACE_META: SignalTraceBundle["meta"] = {
  variant: "exp_a",
  component_ids: { direction: "d", setups: [], trigger: "t", risk: "r" },
  setup_params: [],
  blocker_instances: [],
};

const CHART_EVENTS_MARKER: ComponentEvent = {
  event_type: "point",
  role: "exit_signal",
  side: "long",
  component_id: "comp_chart_events",
  instance_id: "inst_chart_events",
  label: "from-chart-events",
  time: 1000,
  span_id: null,
  feature_family: null,
  source_timeframe: null,
  base_timeframe: null,
  metadata: {},
};

function makeCandles(count: number, startSec = 1_000): ChartBar[] {
  return Array.from({ length: count }, (_, index) => ({
    time: startSec + index * 300,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
  }));
}

function makeReport(runId = "run-a", variant = makeVariant()): RunReport {
  const candles = makeCandles(200, 1_000);
  const firstMs = candles[0]!.time * 1000;
  const lastMs = candles[candles.length - 1]!.time * 1000;
  return {
    run_id: runId,
    created_at: "2026-01-01T00:00:00Z",
    report_schema_version: 1,
    family: "ema_pullback",
    symbol: "BTCUSDT",
    timeframe: "5m",
    candles: candles.length,
    data_range: { from_open_time_ms: firstMs, to_open_time_ms: lastMs },
    variants: [variant],
  };
}

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
      contexts: {
        htf_1: {
          component_id: "htf_context",
          timeframe: "1h",
          fast_period: 20,
          anchor_period: 50,
          slow_period: 100,
        },
      },
      trade_management: {
        exit_policy: {
          always_on: { exits: [] },
          profiles: { aligned: { exits: [] }, countertrend: { exits: [] }, neutral: { exits: [] } },
        },
      },
    },
    metrics: EMPTY_METRICS,
    component_counters: [],
    trade_records: [],
    ...overrides,
  };
}

function seedMarketBundle(
  report: RunReport,
  variant: RunVariant,
  candles: ChartBar[],
): {
  view: ReturnType<typeof resolveRunMarketView>;
  marketIdentity: string;
  focusWindow: MarketDisplayWindowMs;
  coverageWindow: MarketDisplayWindowMs;
  foundationKey: string;
  bundle: { candles: ChartBar[]; ema_overlays: [] };
} {
  const viewResult = resolveRunMarketView({
    report,
    variant,
    chartTimeframe: "5m",
    reloadToken: 0,
  });
  const view = viewResult;
  const marketIdentity = buildRunMarketViewIdentity(view);
  const focusWindow = resolveMarketTargetWindow(view, null);
  const coverageWindow = focusWindow;
  const focusKey = buildMarketTargetWindowKey(marketIdentity, focusWindow);
  mergeCandlesWindowBundle(view.candlesKey, {
    candles,
    coverage: {
      requested_from_ms: focusWindow.fromMs,
      requested_to_ms: focusWindow.toMs,
      actual_from_ms: focusWindow.fromMs,
      actual_to_ms: focusWindow.toMs,
      truncated: false,
    },
  });
  return {
    view,
    marketIdentity,
    focusWindow,
    coverageWindow,
    foundationKey: focusKey,
    bundle: { candles, ema_overlays: [] },
  };
}

const ONE_POINT_CHART_EVENTS: ChartEventsBundle = {
  times: [1000],
  component_events: [CHART_EVENTS_MARKER],
  htf_context: {
    state: ["neutral"],
    fast: [101],
    anchor: [99],
    slow: [97],
    meta: {},
  },
  meta: TRACE_META,
  coverage: {
    schema_version: 1,
    from_sec: 1000,
    to_sec: 1000,
    bar_count: 1,
    requested_from_sec: 1000,
    requested_to_sec: 1000,
    truncated: false,
    max_bars: 50_000,
  },
};

const DENSE_BUNDLE: SignalTraceBundle = {
  times: [1000],
  meta: TRACE_META,
  long: {
    direction_ok: [],
    blockers_ok: [],
    setup_ok: [],
    trigger_ok: [],
    risk_ok: [],
    signal_entry: [],
    stop_ready: [],
    portfolio_entry: [],
    internals: {},
  },
  short: {
    direction_ok: [],
    blockers_ok: [],
    setup_ok: [],
    trigger_ok: [],
    risk_ok: [],
    signal_entry: [],
    stop_ready: [],
    portfolio_entry: [],
    internals: {},
  },
  component_events: [CHART_EVENTS_MARKER],
  htf_context: {
    state: ["neutral"],
    fast: [101],
    anchor: [99],
    slow: [97],
    meta: {},
  },
};

describe("traceDisplayRuntime", () => {
  it("retains previous display when new slice is empty but prior events exist", () => {
    const controller = createTraceDisplayRuntimeController();
    resetTraceDisplayRuntimeCache(controller, "run:v1:");
    mergeDisplayChunkFromChartEvents(controller.cache, ONE_POINT_CHART_EVENTS);
    controller.componentEvents = [CHART_EVENTS_MARKER];
    controller.lastSlicedHtfOverlayPointCount = 3;

    const candles = makeCandles(5, 5_000);
    applyTraceDisplayForWindow(controller, candles, "loading");

    expect(controller.componentEvents).toHaveLength(1);
    expect(controller.traceDisplayState.status).toBe("loading_missing");
  });

  it("plans missing chunk when cache does not cover render window", () => {
    const controller = createTraceDisplayRuntimeController();
    resetTraceDisplayRuntimeCache(controller, "run:v1:");
    const candles = makeCandles(10, 1_000);
    const plan = controller.cache.missingRange(candles[0]!.time, candles[candles.length - 1]!.time);
    expect(plan).not.toBeNull();
  });
});

describe("chart-events paths in isolated harness", () => {
  beforeEach(() => {
    clearMarketResourceCache();
    resetChartEventsFlagDisabledNoteForTests();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    clearMarketResourceCache();
  });

  it("chart-events enabled: display merge from chart-events API", async () => {
    vi.stubEnv("VITE_CHART_EVENTS_API", "1");
    fetchChartEvents.mockResolvedValue(ONE_POINT_CHART_EVENTS);
    fetchSignalTrace.mockResolvedValue(DENSE_BUNDLE);

    const report = makeReport();
    const variant = makeVariant();
    const candles = makeCandles(200, 1_000);
    const seeded = seedMarketBundle(report, variant, candles);

    const harness = createTraceEventsOverlaysHarness({
      report,
      variant,
      bundle: seeded.bundle,
      foundationKey: seeded.foundationKey,
      view: seeded.view,
      focusWindow: seeded.focusWindow,
      coverageWindow: seeded.coverageWindow,
      marketIdentity: seeded.marketIdentity,
      chartTimeframe: "5m",
      effectiveContextOverlayRef: "htf_1",
    });
    harness.initialize(null);

    const loadResult = await harness.runTraceLoad({
      loadDisplayTraceChunk,
      loadDenseLanesTrace,
    });

    expect(loadResult.outcome).toBe("completed");
    expect(fetchChartEvents).toHaveBeenCalled();
    const snapshot = harness.resolveSnapshot();
    expect(snapshot.traceDisplay.componentEvents).toHaveLength(1);
    expect(snapshot.chartModel.implemented).toBe(true);
    expect(snapshot.chartModel.chartViewModel.componentEvents).toHaveLength(1);

    const chartEvents = resolveChartEventsRuntimeSnapshot({
      componentEventCount: snapshot.traceDisplay.componentEvents.length,
      displayResult: {
        outcome: "committed",
        displayMerged: true,
        mergeSource: "chart-events",
      },
      lanesOnlyFetch: false,
    });
    expect(chartEvents.implemented).toBe(true);
    expect(chartEvents.displayLoadOutcome).toBe("committed");
    expect(chartEvents.displayMergeSource).toBe("chart-events");
  });

  it("chart-events disabled: falls back to dense signal-trace for display", async () => {
    vi.stubEnv("VITE_CHART_EVENTS_API", "0");
    fetchSignalTrace.mockResolvedValue(DENSE_BUNDLE);

    const report = makeReport();
    const variant = makeVariant();
    const candles = makeCandles(200, 1_000);
    const seeded = seedMarketBundle(report, variant, candles);

    const harness = createTraceEventsOverlaysHarness({
      report,
      variant,
      bundle: seeded.bundle,
      foundationKey: seeded.foundationKey,
      view: seeded.view,
      focusWindow: seeded.focusWindow,
      coverageWindow: seeded.coverageWindow,
      marketIdentity: seeded.marketIdentity,
      chartTimeframe: "5m",
      effectiveContextOverlayRef: "htf_1",
    });
    harness.initialize(null);

    const loadResult = await harness.runTraceLoad({
      loadDisplayTraceChunk,
      loadDenseLanesTrace,
    });

    expect(loadResult.outcome).toBe("completed");
    expect(fetchChartEvents).not.toHaveBeenCalled();
    expect(fetchSignalTrace).toHaveBeenCalled();
    const snapshot = harness.resolveSnapshot();
    expect(snapshot.traceDisplay.componentEvents).toHaveLength(1);

    const chartEvents = resolveChartEventsRuntimeSnapshot({
      componentEventCount: snapshot.traceDisplay.componentEvents.length,
      displayResult: {
        outcome: "continue",
        displayMerged: true,
        mergeSource: "signal-trace-fallback",
      },
      lanesOnlyFetch: false,
    });
    expect(chartEvents.chartEventsEnabled).toBe(false);
    expect(chartEvents.displayLoadOutcome).toBe("skipped_flag_off");
  });

  it("HTF context overlays appear for variant with strategy.contexts", async () => {
    vi.stubEnv("VITE_CHART_EVENTS_API", "1");
    fetchChartEvents.mockResolvedValue(ONE_POINT_CHART_EVENTS);
    fetchSignalTrace.mockResolvedValue(DENSE_BUNDLE);

    const report = makeReport();
    const variant = makeVariant();
    const candles = makeCandles(200, 1_000);
    const seeded = seedMarketBundle(report, variant, candles);

    const harness = createTraceEventsOverlaysHarness({
      report,
      variant,
      bundle: seeded.bundle,
      foundationKey: seeded.foundationKey,
      view: seeded.view,
      focusWindow: seeded.focusWindow,
      coverageWindow: seeded.coverageWindow,
      marketIdentity: seeded.marketIdentity,
      chartTimeframe: "5m",
      effectiveContextOverlayRef: "htf_1",
    });
    harness.initialize(null);
    await harness.runTraceLoad({ loadDisplayTraceChunk, loadDenseLanesTrace });

    const snapshot = harness.resolveSnapshot();
    expect(snapshot.auxOverlay.implemented).toBe(true);
    if (!snapshot.auxOverlay.implemented) {
      throw new Error("expected implemented aux overlay snapshot");
    }
    expect(snapshot.auxOverlay.htfOverlayCount).toBeGreaterThan(0);
    expect(
      snapshot.auxOverlay.displayAuxEmaOverlays.some((overlay) => overlay.id.startsWith("htf_")),
    ).toBe(true);
  });
});

describe("chart model parity vs trace display apply", () => {
  it("component event counts match deriveTraceDisplayStateForCandles", async () => {
    vi.stubEnv("VITE_CHART_EVENTS_API", "1");
    fetchChartEvents.mockResolvedValue(ONE_POINT_CHART_EVENTS);
    fetchSignalTrace.mockResolvedValue(DENSE_BUNDLE);

    const report = makeReport();
    const variant = makeVariant();
    const candles = makeCandles(200, 1_000);
    const seeded = seedMarketBundle(report, variant, candles);

    const harness = createTraceEventsOverlaysHarness({
      report,
      variant,
      bundle: seeded.bundle,
      foundationKey: seeded.foundationKey,
      view: seeded.view,
      focusWindow: seeded.focusWindow,
      coverageWindow: seeded.coverageWindow,
      marketIdentity: seeded.marketIdentity,
      chartTimeframe: "5m",
      effectiveContextOverlayRef: "htf_1",
    });
    harness.initialize(null);
    await harness.runTraceLoad({ loadDisplayTraceChunk, loadDenseLanesTrace });

    const snapshot = harness.resolveSnapshot();
    const displayController = harness.context.traceDisplayController;
    const legacyState = deriveTraceDisplayStateForCandles(
      displayController.cache,
      snapshot.displayRender.chartWindow.parts.candles,
      harness.context.traceController.lanesStatus,
    );

    expect(snapshot.traceDisplay.componentEvents.length).toBe(legacyState.events.length);
    expect(snapshot.chartModel.chartViewModel.componentEvents.length).toBe(legacyState.events.length);
  });
});

describe("production-mounted shadow output", () => {
  beforeEach(() => {
    clearMarketResourceCache();
  });

  afterEach(() => {
    clearMarketResourceCache();
  });

  it("produces complete candidate output without production owner flags", () => {
    const report = makeReport();
    const variant = makeVariant();
    const candles = makeCandles(200, 1_000);
    seedMarketBundle(report, variant, candles);

    const input = createChartRuntimeInput({
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
      contextOverlayRef: "htf_1",
      effectiveContextOverlayRef: "htf_1",
      contextOverlayRefOptions: ["htf_1"],
    });

    const output = createInitialChartRuntimeOutput(input);
    expect(output.chartViewModel).toBeDefined();
    expect(output.debug.ownerFlags).toEqual(inactiveChartRuntimeOwnerFlags);
    expect(output.debug.traceRequests.status).toBe("idle");
    expect(output.viewport.command).toBeNull();
    expect(output.display.displayApplyRevision).toBe(0);
  });
});
