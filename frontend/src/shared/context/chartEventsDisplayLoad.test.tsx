/**
 * @vitest-environment jsdom
 */
import type { ReactNode } from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ChartEventsBundle,
  ComponentEvent,
  RunReport,
  RunSummary,
  SideMetrics,
  SignalTraceBundle,
  VariantMetrics,
} from "@/api/types";
import { clearMarketCache } from "@/features/chart/marketDataCache";
import { resetChartEventsFlagDisabledNoteForTests } from "@/features/chart/runtime/chartEventsLoad";
import { dbgExport, dbgReset, PIPELINE_DEBUG_STEPS as DBG } from "@/shared/diagnostics/pipelineDebug";
import {
  invalidateTraceDisplayCacheForTests,
  WorkbenchProvider,
  useWorkbenchChart,
  useWorkbenchShell,
} from "@/shared/context/WorkbenchContext";

const fetchRunReport = vi.fn<typeof import("@/api/client").fetchRunReport>();
const fetchRunSummaries = vi.fn<typeof import("@/api/client").fetchRunSummaries>();
const fetchConfigState = vi.fn<typeof import("@/api/client").fetchConfigState>();
const fetchChartMarketBundle = vi.fn<typeof import("@/api/client").fetchChartMarketBundle>();
const fetchSignalTrace = vi.fn<typeof import("@/api/client").fetchSignalTrace>();
const fetchChartEvents = vi.fn<typeof import("@/api/client").fetchChartEvents>();
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
  fetchRunSummaries: (...args: Parameters<typeof fetchRunSummaries>) => fetchRunSummaries(...args),
  fetchConfigState: (...args: Parameters<typeof fetchConfigState>) => fetchConfigState(...args),
  fetchChartMarketBundle: (...args: Parameters<typeof fetchChartMarketBundle>) =>
    fetchChartMarketBundle(...args),
  fetchSignalTrace: (...args: Parameters<typeof fetchSignalTrace>) => fetchSignalTrace(...args),
  fetchChartEvents: (...args: Parameters<typeof fetchChartEvents>) => fetchChartEvents(...args),
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

const TRACE_META: SignalTraceBundle["meta"] = {
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

const ONE_POINT_CHART_EVENTS: ChartEventsBundle = {
  times: [1000],
  component_events: [CHART_EVENTS_MARKER],
  htf_context: {
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

const RUNS: RunSummary[] = [
  {
    run_id: "run-a",
    created_at: "2026-01-01T00:00:00Z",
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
    variants_count: 1,
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
        ],
      },
    ],
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let chartSliceRef: ReturnType<typeof useWorkbenchChart> | null = null;
let shellSliceRef: ReturnType<typeof useWorkbenchShell> | null = null;

function ChartSliceCapture() {
  chartSliceRef = useWorkbenchChart();
  return null;
}

function ShellSliceCapture() {
  shellSliceRef = useWorkbenchShell();
  return null;
}

function Host({ children }: { children?: ReactNode }) {
  return <WorkbenchProvider initialActiveTab="chart">{children}</WorkbenchProvider>;
}

describe("chart-events display load (5A)", () => {
  afterEach(() => {
    cleanup();
    chartSliceRef = null;
    shellSliceRef = null;
    vi.unstubAllEnvs();
    resetChartEventsFlagDisabledNoteForTests();
  });

  beforeEach(() => {
    chartSliceRef = null;
    shellSliceRef = null;
    vi.clearAllMocks();
    clearMarketCache();
    dbgReset();
    vi.stubEnv("VITE_CHART_EVENTS_API", "1");
    vi.stubEnv("VITE_EMA_PIPELINE_DEBUG", "true");
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
    fetchChartOverlayEma.mockResolvedValue([]);
    fetchChartEvents.mockResolvedValue(ONE_POINT_CHART_EVENTS);
  });

  it("applies chart-events display when dense signal-trace fails", async () => {
    fetchSignalTrace.mockRejectedValue(new Error("dense trace unavailable"));

    render(
      <Host>
        <ChartSliceCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(fetchChartEvents).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(fetchSignalTrace).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(chartSliceRef?.chartDisplayComponentEvents).toEqual([CHART_EVENTS_MARKER]);
    });
    expect(chartSliceRef?.lanesSignalTraceStatus).toBe("error");
    expect(chartSliceRef?.lanesSignalTraceError).toContain("dense trace unavailable");
    expect(chartSliceRef?.chartViewModel.componentEvents).toEqual([CHART_EVENTS_MARKER]);

    const mergeMark = dbgExport().find((row) => row.step === DBG.chartEvents.merge);
    expect(mergeMark?.last_meta?.source).toBe("chart-events");
  });

  it("commits display from chart-events before deferred signal-trace resolves", async () => {
    const deferred = createDeferred<SignalTraceBundle>();
    fetchSignalTrace.mockReturnValue(deferred.promise);

    render(
      <Host>
        <ChartSliceCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(fetchChartEvents).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(fetchSignalTrace).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(chartSliceRef?.chartDisplayComponentEvents).toEqual([CHART_EVENTS_MARKER]);
    });
    const revisionBeforeDenseResolve = chartSliceRef?.displayApplyRevision ?? 0;
    expect(revisionBeforeDenseResolve).toBeGreaterThan(0);

    await act(async () => {
      deferred.resolve({
        times: [1000],
        meta: TRACE_META,
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
        component_events: [],
      });
    });

    await waitFor(() => {
      expect(chartSliceRef?.lanesSignalTraceStatus).toBe("ready");
    });
    expect(chartSliceRef?.chartDisplayComponentEvents).toEqual([CHART_EVENTS_MARKER]);
    expect(chartSliceRef?.displayApplyRevision).toBeGreaterThanOrEqual(revisionBeforeDenseResolve);
  });
});

describe("lazy dense lanes (5B)", () => {
  afterEach(() => {
    cleanup();
    chartSliceRef = null;
    shellSliceRef = null;
    vi.unstubAllEnvs();
    resetChartEventsFlagDisabledNoteForTests();
  });

  beforeEach(() => {
    chartSliceRef = null;
    shellSliceRef = null;
    vi.clearAllMocks();
    clearMarketCache();
    dbgReset();
    vi.stubEnv("VITE_CHART_EVENTS_API", "1");
    vi.stubEnv("VITE_EMA_PIPELINE_DEBUG", "true");
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
    fetchChartOverlayEma.mockResolvedValue([]);
    fetchChartEvents.mockResolvedValue(ONE_POINT_CHART_EVENTS);
  });

  it("preserves lanes error on policy skip after display commit (no second dense fetch)", async () => {
    fetchSignalTrace.mockRejectedValue(new Error("dense trace unavailable"));

    render(
      <Host>
        <ChartSliceCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(chartSliceRef?.lanesSignalTraceStatus).toBe("error");
    });
    expect(fetchSignalTrace).toHaveBeenCalledTimes(1);
    expect(fetchChartEvents).toHaveBeenCalledTimes(1);

    await act(async () => {
      invalidateTraceDisplayCacheForTests();
    });

    await waitFor(() => {
      expect(fetchChartEvents).toHaveBeenCalledTimes(2);
    });
    expect(fetchSignalTrace).toHaveBeenCalledTimes(1);
    expect(chartSliceRef?.lanesSignalTraceStatus).toBe("error");
    expect(chartSliceRef?.lanesSignalTraceError).toContain("dense trace unavailable");

    const skipMark = dbgExport().find((row) => row.step === DBG.lanesTrace.skip);
    expect(skipMark?.last_meta?.reason).toBe("lanes_ready");
  });

  it("flag off performs single combined signal-trace fetch (no chart-events)", async () => {
    vi.stubEnv("VITE_CHART_EVENTS_API", "0");
    fetchSignalTrace.mockResolvedValue({
      times: [1000],
      meta: TRACE_META,
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
      component_events: [CHART_EVENTS_MARKER],
    });

    render(
      <Host>
        <ChartSliceCapture />
        <ShellSliceCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(fetchSignalTrace).toHaveBeenCalledTimes(1);
    });
    expect(fetchChartEvents).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(chartSliceRef?.lanesSignalTraceStatus).toBe("ready");
    });
  });
});
