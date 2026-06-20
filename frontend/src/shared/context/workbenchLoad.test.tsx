/**
 * @vitest-environment jsdom
 */
import type { ReactNode } from "react";
import { StrictMode } from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  RunReport,
  RunSummary,
  SideMetrics,
  SignalTraceBundle,
  VariantMetrics,
  WorkbenchTab,
} from "@/api/types";
import { clearMarketResourceCache } from "@/features/chart/marketResourceCache";
import {
  WorkbenchProvider,
  useWorkbench,
  useWorkbenchChart,
  useWorkbenchReport,
} from "@/shared/context/WorkbenchContext";

const fetchRunReport = vi.fn<typeof import("@/api/client").fetchRunReport>();
const fetchRunSummaries = vi.fn<typeof import("@/api/client").fetchRunSummaries>();
const fetchConfigState = vi.fn<typeof import("@/api/client").fetchConfigState>();
const fetchChartMarketBundle = vi.fn<typeof import("@/api/client").fetchChartMarketBundle>();
const fetchSignalTrace = vi.fn<typeof import("@/api/client").fetchSignalTrace>();
const fetchChartOverlayEma = vi.fn<typeof import("@/api/client").fetchChartOverlayEma>();

vi.mock("@/api/client", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    detail: string;
    constructor(status: number, detail: string) {
      super(detail);
      this.status = status;
      this.detail = detail;
    }
  },
  fetchRunReport: (...args: Parameters<typeof fetchRunReport>) => fetchRunReport(...args),
  fetchRunSummaries: (...args: Parameters<typeof fetchRunSummaries>) =>
    fetchRunSummaries(...args),
  fetchConfigState: (...args: Parameters<typeof fetchConfigState>) =>
    fetchConfigState(...args),
  fetchChartMarketBundle: (...args: Parameters<typeof fetchChartMarketBundle>) =>
    fetchChartMarketBundle(...args),
  fetchSignalTrace: (...args: Parameters<typeof fetchSignalTrace>) =>
    fetchSignalTrace(...args),
  fetchChartOverlayEma: (...args: Parameters<typeof fetchChartOverlayEma>) =>
    fetchChartOverlayEma(...args),
  selectSavedConfig: vi.fn(),
}));

const EMPTY_SIDE: SideMetrics = {
  trades: 0,
  pnl: 0,
  return_pct: 0,
  profit_factor: null,
  win_rate: null,
};

const EMPTY_METRICS: VariantMetrics = {
  long: EMPTY_SIDE,
  short: EMPTY_SIDE,
  total: { ...EMPTY_SIDE, sharpe: 0, max_drawdown: 0 },
  open_trades: { long: 0, short: 0, total: 0 },
};

const EMPTY_SIGNAL_TRACE: SignalTraceBundle = {
  times: [],
  meta: {
    variant: "exp_a",
    component_ids: {
      direction: "d",
      setups: [{ instance_id: "setup", component_id: "s" }],
      trigger: "t",
      risk: "r",
    },
    setup_params: [
      {
        instance_id: "setup",
        component_id: "s",
        lookback: 50,
        active_bars: 3,
      },
    ],
    blocker_instances: [],
  },
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
};

const ONE_POINT_SIGNAL_TRACE: SignalTraceBundle = {
  ...EMPTY_SIGNAL_TRACE,
  times: [1000],
  long: {
    direction_ok: [false],
    blockers_ok: [false],
    setup_ok: [false],
    trigger_ok: [false],
    risk_ok: [false],
    signal_entry: [false],
    stop_ready: [false],
    portfolio_entry: [false],
    internals: {},
  },
  short: {
    direction_ok: [false],
    blockers_ok: [false],
    setup_ok: [false],
    trigger_ok: [false],
    risk_ok: [false],
    signal_entry: [false],
    stop_ready: [false],
    portfolio_entry: [false],
    internals: {},
  },
};

const ONE_POINT_HTF_SIGNAL_TRACE: SignalTraceBundle = {
  ...ONE_POINT_SIGNAL_TRACE,
  htf_context: {
    state: ["up"],
    fast: [101],
    anchor: [99],
    slow: [97],
    meta: {},
  },
};

const RUNS: RunSummary[] = [
  {
    run_id: "run-a",
    created_at: "2026-01-01T00:00:00Z",
    family: "ema_pullback",
    symbol: "BTCUSDT",
    timeframe: "5m",
  },
  {
    run_id: "run-b",
    created_at: "2026-01-02T00:00:00Z",
    family: "ema_pullback",
    symbol: "BTCUSDT",
    timeframe: "5m",
  },
];

function makeReport(runId: string): RunReport {
  return {
    run_id: runId,
    created_at: "2026-01-01T00:00:00Z",
    report_schema_version: 1,
    family: "ema_pullback",
    symbol: "BTCUSDT",
    timeframe: "5m",
    candles: 100,
    data_range: { from_open_time_ms: 1_000_000, to_open_time_ms: 2_000_000 },
    variants_count: 2,
    variants: [
      {
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
      },
      {
        variant: "exp_b",
        config_id: "cfg_b",
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
        trade_records: [
          {
            trade_id: 10,
            direction: "long",
            status: "closed",
            entry_time_ms: 1_500_000,
            exit_time_ms: 1_600_000,
            entry_price: 100,
            exit_price: 101,
            exit_reason: "signal:exit",
            size: 1,
            pnl: 1,
            return_pct: 0.01,
          },
        ],
      },
    ],
  };
}

function makeHtfReport(runId: string): RunReport {
  const report = makeReport(runId);
  return {
    ...report,
    variants: report.variants.map((variant) =>
      variant.variant === "exp_a"
        ? {
            ...variant,
            strategy_spec: {
              ...variant.strategy_spec,
              contexts: {
                htf_1: {
                  component_id: "htf_context",
                  timeframe: "4h",
                  fast_period: 21,
                  anchor_period: 55,
                  slow_period: 144,
                },
              },
              trade_management: {
                exit_policy: {
                  context_consumption: {
                    context_ref: "htf_1",
                  },
                  always_on: {
                    exits: [],
                  },
                },
              },
            },
          }
        : variant,
    ),
  };
}

let workbenchRef: ReturnType<typeof useWorkbench> | null = null;
let reportSliceRenderCount = 0;
let chartSliceRef: ReturnType<typeof useWorkbenchChart> | null = null;

function WorkbenchCapture() {
  workbenchRef = useWorkbench();
  return (
    <div
      data-report-status={workbenchRef.reportLoadStatus}
      data-variant-key={workbenchRef.selectedVariantKey}
      data-active-tab={workbenchRef.activeTab}
    />
  );
}

function ReportSliceCapture() {
  const reportSlice = useWorkbenchReport();
  reportSliceRenderCount += 1;
  return <div data-report-run-id={reportSlice.report?.run_id ?? ""} />;
}

function ChartSliceCapture() {
  chartSliceRef = useWorkbenchChart();
  return null;
}

function Host({
  children,
  initialActiveTab,
}: {
  children?: ReactNode;
  initialActiveTab?: WorkbenchTab;
}) {
  return <WorkbenchProvider initialActiveTab={initialActiveTab}>{children}</WorkbenchProvider>;
}

describe("Workbench report-load invariant", () => {
  afterEach(() => {
    cleanup();
    workbenchRef = null;
    chartSliceRef = null;
    reportSliceRenderCount = 0;
  });

  beforeEach(() => {
    workbenchRef = null;
    chartSliceRef = null;
    reportSliceRenderCount = 0;
    vi.clearAllMocks();
    clearMarketResourceCache();
    fetchRunSummaries.mockResolvedValue(RUNS);
    fetchConfigState.mockResolvedValue({
      family: "ema_pullback",
      selected_experiment_id: null,
      configs: [],
      selected_path: null,
      draft: null,
    });
    fetchRunReport.mockImplementation(async (runId: string) => makeReport(runId));
    fetchChartMarketBundle.mockResolvedValue({
      candles: [{ time: 1000, open: 1, high: 2, low: 0.5, close: 1.5 }],
      ema_overlays: [],
    });
    fetchSignalTrace.mockResolvedValue(EMPTY_SIGNAL_TRACE);
    fetchChartOverlayEma.mockResolvedValue([]);
  });

  it("calls fetchRunReport exactly once on mount", async () => {
    render(
      <Host>
        <WorkbenchCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(fetchRunReport).toHaveBeenCalledTimes(1);
    });
    expect(fetchRunReport).toHaveBeenCalledWith("run-a");
  });

  it("does not refetch report when variant changes", async () => {
    render(
      <Host>
        <WorkbenchCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(workbenchRef?.reportLoadStatus).toBe("ready");
    });
    const callsAfterReady = fetchRunReport.mock.calls.length;

    act(() => {
      workbenchRef!.setSelectedVariantKey("exp_b");
    });

    await waitFor(() => {
      expect(workbenchRef?.selectedVariantKey).toBe("exp_b");
    });
    expect(fetchRunReport.mock.calls.length).toBe(callsAfterReady);
  });

  it("does not refetch report when trade is selected", async () => {
    render(
      <Host>
        <WorkbenchCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(workbenchRef?.reportLoadStatus).toBe("ready");
    });
    await waitFor(() => {
      expect(workbenchRef?.selectedTradeId).toBe(2);
    });
    const callsAfterReady = fetchRunReport.mock.calls.length;

    act(() => {
      workbenchRef!.selectTrade(1);
    });

    await waitFor(() => {
      expect(workbenchRef?.selectedTradeId).toBe(1);
    });
    expect(fetchRunReport.mock.calls.length).toBe(callsAfterReady);
  });

  it("fetches report again when run changes", async () => {
    render(
      <Host>
        <WorkbenchCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(workbenchRef?.reportLoadStatus).toBe("ready");
    });
    expect(fetchRunReport).toHaveBeenCalledTimes(1);

    act(() => {
      workbenchRef!.setSelectedRunId("run-b");
    });

    await waitFor(() => {
      expect(fetchRunReport).toHaveBeenCalledTimes(2);
    });
    expect(fetchRunReport).toHaveBeenLastCalledWith("run-b");
  });

  it("defers chart-heavy IO until Chart activation and preserves Reports trade selection", async () => {
    render(
      <Host initialActiveTab="reports">
        <WorkbenchCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(workbenchRef?.reportLoadStatus).toBe("ready");
    });
    await waitFor(() => {
      expect(workbenchRef?.selectedTradeId).toBe(2);
    });
    expect(fetchChartMarketBundle).not.toHaveBeenCalled();
    expect(fetchSignalTrace).not.toHaveBeenCalled();

    act(() => {
      workbenchRef!.selectTrade(1);
    });

    await waitFor(() => {
      expect(workbenchRef?.selectedTradeId).toBe(1);
    });
    expect(fetchChartMarketBundle).not.toHaveBeenCalled();
    expect(fetchSignalTrace).not.toHaveBeenCalled();

    act(() => {
      workbenchRef!.setActiveTab("chart");
    });

    await waitFor(() => {
      expect(workbenchRef?.activeTab).toBe("chart");
    });
    await waitFor(() => {
      expect(fetchChartMarketBundle).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(fetchSignalTrace).toHaveBeenCalledTimes(1);
    });
    expect(workbenchRef?.selectedTradeId).toBe(1);
  });

  it("does not notify report slice consumers when chart display revision changes", async () => {
    fetchChartMarketBundle.mockResolvedValue({
      candles: [{ time: 1000, open: 1, high: 2, low: 0.5, close: 1.5 }],
      ema_overlays: [],
    });
    const deferred = createDeferred<SignalTraceBundle>();
    fetchSignalTrace.mockReturnValue(deferred.promise);

    render(
      <Host>
        <ReportSliceCapture />
        <ChartSliceCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(fetchSignalTrace).toHaveBeenCalledTimes(1);
    });
    const rendersBeforeTraceApply = reportSliceRenderCount;
    const revisionBeforeTraceApply = chartSliceRef?.displayApplyRevision ?? 0;

    await act(async () => {
      deferred.resolve(ONE_POINT_SIGNAL_TRACE);
    });

    await waitFor(() => {
      expect(chartSliceRef?.displayApplyRevision).toBeGreaterThan(revisionBeforeTraceApply);
    });
    expect(reportSliceRenderCount).toBe(rendersBeforeTraceApply);
  });

  it("keeps HTF context EMA overlays sourced from signal trace after context split", async () => {
    fetchRunReport.mockImplementation(async (runId: string) => makeHtfReport(runId));
    fetchChartMarketBundle.mockResolvedValue({
      candles: [{ time: 1000, open: 1, high: 2, low: 0.5, close: 1.5 }],
      ema_overlays: [],
    });
    fetchSignalTrace.mockResolvedValue(ONE_POINT_HTF_SIGNAL_TRACE);

    render(
      <Host>
        <ChartSliceCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(fetchSignalTrace).toHaveBeenCalledTimes(1);
    });
    expect(fetchSignalTrace.mock.calls[0]![0].contextOverlayRef).toBe("htf_1");

    await waitFor(() => {
      expect(
        chartSliceRef?.chartViewModel.displayAuxEmaOverlays.some(
          (overlay) => overlay.id === "htf_fast" && overlay.dashed && overlay.points[0]?.value === 101,
        ),
      ).toBe(true);
    });
  });
});

describe("Workbench missing-range trace scheduling", () => {
  afterEach(() => {
    cleanup();
    workbenchRef = null;
    chartSliceRef = null;
  });

  beforeEach(() => {
    workbenchRef = null;
    chartSliceRef = null;
    vi.clearAllMocks();
    clearMarketResourceCache();
    fetchRunSummaries.mockResolvedValue(RUNS);
    fetchConfigState.mockResolvedValue({
      family: "ema_pullback",
      selected_experiment_id: null,
      configs: [],
      selected_path: null,
      draft: null,
    });
    fetchRunReport.mockImplementation(async (runId: string) => makeReport(runId));
    fetchChartOverlayEma.mockResolvedValue([]);
  });

  it("schedules one normalized chunk fetch on full display cache miss", async () => {
    fetchChartMarketBundle.mockResolvedValue({
      candles: [{ time: 1000, open: 1, high: 2, low: 0.5, close: 1.5 }],
      ema_overlays: [],
    });
    fetchSignalTrace.mockResolvedValue(ONE_POINT_SIGNAL_TRACE);

    render(
      <Host>
        <WorkbenchCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(fetchSignalTrace).toHaveBeenCalledTimes(1);
    });
    expect(fetchSignalTrace.mock.calls[0]![0]).toMatchObject({
      fromMs: 1_000_000,
      toOpenTimeMs: 1_000_000,
    });
  });

  it("does not duplicate fetch once display cache covers the committed window", async () => {
    fetchChartMarketBundle.mockResolvedValue({
      candles: [{ time: 1000, open: 1, high: 2, low: 0.5, close: 1.5 }],
      ema_overlays: [],
    });
    fetchSignalTrace.mockResolvedValue(ONE_POINT_SIGNAL_TRACE);

    render(
      <Host>
        <WorkbenchCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(fetchSignalTrace).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(workbenchRef?.signalTraceStatus).toBe("ready");
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(fetchSignalTrace).toHaveBeenCalledTimes(1);
  });
});

const ANCHOR_EMA_OVERLAYS = [
  {
    role: "fast" as const,
    period: 200,
    points: [{ time: 1000, value: 1, kind: "chart_overlay_ema" as const }],
  },
  {
    role: "anchor" as const,
    period: 500,
    points: [{ time: 1000, value: 2, kind: "chart_overlay_ema" as const }],
  },
  {
    role: "slow" as const,
    period: 1000,
    points: [{ time: 1000, value: 3, kind: "chart_overlay_ema" as const }],
  },
];

const ALT_ANCHOR_EMA_OVERLAYS = [
  {
    role: "fast" as const,
    period: 100,
    points: [{ time: 1000, value: 4, kind: "chart_overlay_ema" as const }],
  },
  {
    role: "anchor" as const,
    period: 300,
    points: [{ time: 1000, value: 5, kind: "chart_overlay_ema" as const }],
  },
  {
    role: "slow" as const,
    period: 600,
    points: [{ time: 1000, value: 6, kind: "chart_overlay_ema" as const }],
  },
];

function makeReportWithDistinctVariantPeriods(runId: string): RunReport {
  const report = makeReport(runId);
  return {
    ...report,
    variants: report.variants.map((variant) =>
      variant.variant === "exp_b"
        ? {
            ...variant,
            strategy_spec: {
              anchor_stack: {
                fast: { period: 100 },
                anchor: { period: 300 },
                slow: { period: 600 },
              },
            },
          }
        : variant,
    ),
  };
}

describe("Workbench split market resource cache", () => {
  afterEach(() => {
    cleanup();
    workbenchRef = null;
  });

  beforeEach(() => {
    workbenchRef = null;
    vi.clearAllMocks();
    clearMarketResourceCache();
    fetchRunSummaries.mockResolvedValue(RUNS);
    fetchConfigState.mockResolvedValue({
      family: "ema_pullback",
      selected_experiment_id: null,
      configs: [],
      selected_path: null,
      draft: null,
    });
    fetchRunReport.mockImplementation(async (runId: string) => makeReport(runId));
    fetchChartOverlayEma.mockResolvedValue([]);
    fetchSignalTrace.mockResolvedValue(EMPTY_SIGNAL_TRACE);
  });

  it("reuses cached candles and overlays when switching variants with identical anchor-stack periods", async () => {
    fetchChartMarketBundle.mockResolvedValue({
      candles: [{ time: 1000, open: 1, high: 2, low: 0.5, close: 1.5 }],
      ema_overlays: ANCHOR_EMA_OVERLAYS,
    });

    render(
      <Host>
        <WorkbenchCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(workbenchRef?.marketLoadStatus).toBe("ready");
    });
    expect(fetchChartMarketBundle).toHaveBeenCalledTimes(1);

    await act(async () => {
      workbenchRef!.setSelectedVariantKey("exp_b");
    });

    await waitFor(() => {
      expect(workbenchRef?.selectedVariantKey).toBe("exp_b");
      expect(workbenchRef?.marketLoadStatus).toBe("ready");
    });
    expect(fetchChartMarketBundle).toHaveBeenCalledTimes(1);
    expect(workbenchRef?.marketCandlesCount).toBe(1);
  });

  it("reuses cached candles and refetches overlays when variant anchor-stack periods change", async () => {
    fetchRunReport.mockImplementation(async (runId: string) =>
      makeReportWithDistinctVariantPeriods(runId),
    );
    const deferredOverlayBundle = createDeferred<{
      candles: { time: number; open: number; high: number; low: number; close: number }[];
      ema_overlays: typeof ALT_ANCHOR_EMA_OVERLAYS;
    }>();
    fetchChartMarketBundle
      .mockResolvedValueOnce({
        candles: [{ time: 1000, open: 1, high: 2, low: 0.5, close: 1.5 }],
        ema_overlays: ANCHOR_EMA_OVERLAYS,
      })
      .mockReturnValueOnce(deferredOverlayBundle.promise);

    render(
      <Host>
        <WorkbenchCapture />
        <ChartSliceCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(workbenchRef?.marketLoadStatus).toBe("ready");
      expect(chartSliceRef?.chartEmaOverlays).toHaveLength(3);
    });
    expect(fetchChartMarketBundle).toHaveBeenCalledTimes(1);

    await act(async () => {
      workbenchRef!.setSelectedVariantKey("exp_b");
    });

    await waitFor(() => {
      expect(workbenchRef?.selectedVariantKey).toBe("exp_b");
      expect(fetchChartMarketBundle).toHaveBeenCalledTimes(2);
      expect(workbenchRef?.marketCandlesCount).toBe(1);
    });
    expect(chartSliceRef?.chartEmaOverlays).toHaveLength(0);

    await act(async () => {
      deferredOverlayBundle.resolve({
        candles: [{ time: 2000, open: 2, high: 3, low: 1.5, close: 2.5 }],
        ema_overlays: ALT_ANCHOR_EMA_OVERLAYS,
      });
    });

    await waitFor(() => {
      expect(chartSliceRef?.chartEmaOverlays).toHaveLength(3);
      expect(workbenchRef?.marketLoadStatus).toBe("ready");
      expect(workbenchRef?.marketCandlesCount).toBe(1);
    });
  });

  it("keeps cachedBundle reference stable across unrelated renders", async () => {
    fetchChartMarketBundle.mockResolvedValue({
      candles: [{ time: 1000, open: 1, high: 2, low: 0.5, close: 1.5 }],
      ema_overlays: ANCHOR_EMA_OVERLAYS,
    });

    render(
      <Host>
        <WorkbenchCapture />
        <ChartSliceCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(workbenchRef?.marketLoadStatus).toBe("ready");
      expect(chartSliceRef?.chartEmaOverlays).toHaveLength(3);
    });

    const initialEma = chartSliceRef?.chartEmaOverlays;
    await act(async () => {
      workbenchRef!.setChartShowSetupMarkers(false);
    });
    expect(chartSliceRef?.chartEmaOverlays).toBe(initialEma);
  });
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("Workbench abort + in-flight dedupe", () => {
  afterEach(() => {
    cleanup();
    workbenchRef = null;
  });

  beforeEach(() => {
    workbenchRef = null;
    vi.clearAllMocks();
    clearMarketResourceCache();
    fetchRunSummaries.mockResolvedValue(RUNS);
    fetchConfigState.mockResolvedValue({
      family: "ema_pullback",
      selected_experiment_id: null,
      configs: [],
      selected_path: null,
      draft: null,
    });
    fetchRunReport.mockImplementation(async (runId: string) => makeReport(runId));
    fetchChartOverlayEma.mockResolvedValue([]);
    fetchSignalTrace.mockResolvedValue(EMPTY_SIGNAL_TRACE);
  });

  it("market: StrictMode remount with same key does not leave marketLoadStatus loading", async () => {
    const marketBundle = {
      candles: [{ time: 1000, open: 1, high: 2, low: 0.5, close: 1.5 }],
      ema_overlays: [],
    };
    const deferred = createDeferred<typeof marketBundle>();
    fetchChartMarketBundle.mockReturnValue(deferred.promise);

    render(
      <StrictMode>
        <Host>
          <WorkbenchCapture />
        </Host>
      </StrictMode>,
    );

    await waitFor(() => {
      expect(fetchChartMarketBundle.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    await act(async () => {
      deferred.resolve(marketBundle);
    });

    await waitFor(() => {
      expect(workbenchRef?.marketLoadStatus).toBe("ready");
    });
    expect(workbenchRef?.marketLoadStatus).not.toBe("loading");
  });

  it("signalTrace: StrictMode remount with same traceRequestKey does not leave signalTraceStatus loading", async () => {
    fetchChartMarketBundle.mockResolvedValue({
      candles: [{ time: 1000, open: 1, high: 2, low: 0.5, close: 1.5 }],
      ema_overlays: [],
    });
    const deferred = createDeferred<SignalTraceBundle>();
    fetchSignalTrace.mockReturnValue(deferred.promise);

    render(
      <StrictMode>
        <Host>
          <WorkbenchCapture />
        </Host>
      </StrictMode>,
    );

    await waitFor(() => {
      expect(fetchSignalTrace.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    await act(async () => {
      deferred.resolve(EMPTY_SIGNAL_TRACE);
    });

    await waitFor(() => {
      expect(workbenchRef?.signalTraceStatus).toBe("ready");
    });
    expect(workbenchRef?.signalTraceStatus).not.toBe("loading");
  });
});

