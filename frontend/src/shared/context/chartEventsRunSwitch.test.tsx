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
  WorkbenchProvider,
  useWorkbenchChart,
  useWorkbenchReport,
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

function chartEventsForTime(timeSec: number): ChartEventsBundle {
  return {
    times: [timeSec],
    component_events: [{ ...CHART_EVENTS_MARKER, time: timeSec }],
    htf_context: {
      fast: [101],
      anchor: [99],
      slow: [97],
      meta: {},
    },
    meta: TRACE_META,
    coverage: {
      schema_version: 1,
      from_sec: timeSec,
      to_sec: timeSec,
      bar_count: 1,
      requested_from_sec: timeSec,
      requested_to_sec: timeSec,
      truncated: false,
      max_bars: 50_000,
    },
  };
}

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
  const range =
    runId === "run-b"
      ? { from_open_time_ms: 2_000_000, to_open_time_ms: 3_000_000 }
      : { from_open_time_ms: 1_000_000, to_open_time_ms: 2_000_000 };
  return {
    run_id: runId,
    created_at: "2026-01-01T00:00:00Z",
    report_schema_version: 1,
    family: "ema_pullback",
    symbol: "BTCUSDT",
    timeframe: "5m",
    candles: 100,
    data_range: range,
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
let reportSliceRef: ReturnType<typeof useWorkbenchReport> | null = null;

function ChartSliceCapture() {
  chartSliceRef = useWorkbenchChart();
  return null;
}

function ReportSliceCapture() {
  reportSliceRef = useWorkbenchReport();
  return null;
}

function Host({ children }: { children?: ReactNode }) {
  return <WorkbenchProvider initialActiveTab="chart">{children}</WorkbenchProvider>;
}

describe("chart-events run switch bootstrap", () => {
  afterEach(() => {
    cleanup();
    chartSliceRef = null;
    reportSliceRef = null;
    vi.unstubAllEnvs();
    resetChartEventsFlagDisabledNoteForTests();
  });

  beforeEach(() => {
    chartSliceRef = null;
    reportSliceRef = null;
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
    fetchChartMarketBundle.mockImplementation(async ({ fromMs }: { fromMs: number }) => ({
      candles: [
        {
          time: Math.floor(fromMs / 1000),
          open: 1,
          high: 2,
          low: 0.5,
          close: 1.5,
        },
      ],
      ema_overlays: [],
    }));
    fetchChartOverlayEma.mockResolvedValue([]);
    fetchChartEvents.mockImplementation(async ({ runId }: { runId: string }) =>
      chartEventsForTime(runId === "run-b" ? 2000 : 1000),
    );
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
      component_events: [],
    });
  });

  it("does not fetch chart-events/signal-trace until report and render window align after run switch", async () => {
    render(
      <Host>
        <ChartSliceCapture />
        <ReportSliceCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(fetchChartEvents).toHaveBeenCalledTimes(1);
    });
    expect(fetchChartEvents.mock.calls[0]?.[0]?.runId).toBe("run-a");

    fetchChartEvents.mockClear();
    fetchSignalTrace.mockClear();
    dbgReset();

    const deferredRunBReport = createDeferred<RunReport>();
    fetchRunReport.mockImplementation(async (runId: string) => {
      if (runId === "run-b") {
        return deferredRunBReport.promise;
      }
      return makeReport(runId);
    });

    await act(async () => {
      reportSliceRef?.setSelectedRunId("run-b");
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(fetchChartEvents).not.toHaveBeenCalled();
    expect(fetchSignalTrace).not.toHaveBeenCalled();
    expect(
      dbgExport().some(
        (row) =>
          row.step === DBG.signalTrace.bootstrapBlocked &&
          (row.last_meta?.reason === "report_run_mismatch" ||
            row.last_meta?.reason === "run_switch_not_ready" ||
            row.last_meta?.reason === "market_not_ready" ||
            row.last_meta?.reason === "render_window_not_ready"),
      ),
    ).toBe(true);

    await act(async () => {
      deferredRunBReport.resolve(makeReport("run-b"));
    });

    await waitFor(() => {
      expect(fetchChartEvents).toHaveBeenCalledTimes(1);
    });
    expect(fetchChartEvents.mock.calls[0]?.[0]?.runId).toBe("run-b");
    await waitFor(() => {
      expect(chartSliceRef?.chartDisplayComponentEvents[0]?.time).toBe(2000);
    });
  });

  it("ignores stale chart-events 404 after run switch and loads the new run normally", async () => {
    const deferredChartEvents = createDeferred<ChartEventsBundle>();
    fetchChartEvents.mockReturnValueOnce(deferredChartEvents.promise);

    render(
      <Host>
        <ChartSliceCapture />
        <ReportSliceCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(fetchChartEvents).toHaveBeenCalledTimes(1);
    });

    const deferredRunBReport = createDeferred<RunReport>();
    fetchRunReport.mockImplementation(async (runId: string) => {
      if (runId === "run-b") {
        return deferredRunBReport.promise;
      }
      return makeReport(runId);
    });

    fetchChartEvents.mockImplementation(async ({ runId }: { runId: string }) =>
      chartEventsForTime(runId === "run-b" ? 2000 : 1000),
    );
    dbgReset();

    await act(async () => {
      reportSliceRef?.setSelectedRunId("run-b");
    });

    await act(async () => {
      const { ApiError } = await import("@/api/client");
      deferredChartEvents.reject(new ApiError(404, "run not found"));
    });

    expect(dbgExport().some((row) => row.step === DBG.chartEvents.fetchFail)).toBe(false);
    expect(dbgExport().some((row) => row.step === DBG.chartEvents.fallback)).toBe(false);

    await act(async () => {
      deferredRunBReport.resolve(makeReport("run-b"));
    });

    await waitFor(() => {
      expect(fetchChartEvents.mock.calls.some((call) => call[0]?.runId === "run-b")).toBe(true);
    });
    await waitFor(() => {
      expect(chartSliceRef?.chartDisplayComponentEvents[0]?.time).toBe(2000);
    });
  });
});
