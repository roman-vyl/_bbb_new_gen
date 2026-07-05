/**
 * @vitest-environment jsdom
 */
import type { ReactNode } from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ChartEventsBundle,
  RunReport,
  RunSummary,
  SideMetrics,
  VariantMetrics,
} from "@/api/types";
import { selectedTradeEntryMarkerInView } from "@/features/chart/chartMarkers";
import { clearMarketResourceCache } from "@/features/chart/marketResourceCache";
import { resetChartEventsFlagDisabledNoteForTests } from "@/features/chart/runtime/chartEventsLoad";
import { dbgExport, dbgReset, PIPELINE_DEBUG_STEPS as DBG } from "@/shared/diagnostics/pipelineDebug";
import { installSplitMarketWindowMocks } from "@/test/marketWindowApiMocks";
import {
  WorkbenchProvider,
  useWorkbench,
  useWorkbenchChart,
} from "@/shared/context/WorkbenchContext";

const fetchRunReport = vi.fn<typeof import("@/api/client").fetchRunReport>();
const fetchRunSummaries = vi.fn<typeof import("@/api/client").fetchRunSummaries>();
const fetchConfigState = vi.fn<typeof import("@/api/client").fetchConfigState>();
const fetchCandlesWindow = vi.fn<typeof import("@/api/client").fetchCandlesWindow>();
const fetchEmaWindow = vi.fn<typeof import("@/api/client").fetchEmaWindow>();
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
  fetchCandlesWindow: (...args: Parameters<typeof fetchCandlesWindow>) =>
    fetchCandlesWindow(...args),
  fetchEmaWindow: (...args: Parameters<typeof fetchEmaWindow>) => fetchEmaWindow(...args),
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

const THREE_BAR_MARKET = [
  { time: 1100, open: 1, high: 2, low: 0.5, close: 1.5 },
  { time: 1200, open: 1.1, high: 2.1, low: 0.6, close: 1.6 },
  { time: 1300, open: 1.2, high: 2.2, low: 0.7, close: 1.7 },
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
    data_range: { from_open_time_ms: 1_100_000, to_open_time_ms: 1_300_000 },
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
            exit_time_ms: 1_150_000,
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
            exit_time_ms: 1_350_000,
            entry_price: 102,
            exit_price: 103,
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
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const RUNS: RunSummary[] = [
  {
    run_id: "run-a",
    created_at: "2026-01-01T00:00:00Z",
    family: "ema_pullback",
    symbol: "BTCUSDT",
    timeframe: "5m",
  },
];

let workbenchRef: ReturnType<typeof useWorkbench> | null = null;
let chartSliceRef: ReturnType<typeof useWorkbenchChart> | null = null;

function WorkbenchCapture() {
  workbenchRef = useWorkbench();
  return null;
}

function ChartSliceCapture() {
  chartSliceRef = useWorkbenchChart();
  return null;
}

function Host({ children }: { children?: ReactNode }) {
  return <WorkbenchProvider initialActiveTab="chart">{children}</WorkbenchProvider>;
}

describe("chart-events distant trade display apply", () => {
  afterEach(() => {
    cleanup();
    workbenchRef = null;
    chartSliceRef = null;
    vi.unstubAllEnvs();
    resetChartEventsFlagDisabledNoteForTests();
  });

  beforeEach(() => {
    workbenchRef = null;
    chartSliceRef = null;
    vi.clearAllMocks();
    clearMarketResourceCache();
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
    installSplitMarketWindowMocks({
      fetchCandlesWindow,
      fetchEmaWindow,
      candles: THREE_BAR_MARKET,
      emaOverlays: [],
    });
    fetchChartOverlayEma.mockResolvedValue([]);
    fetchSignalTrace.mockResolvedValue({
      times: [1100, 1200, 1300],
      meta: {
        variant: "exp_a",
        component_ids: { direction: "d", setups: [], trigger: "t", risk: "r" },
        setup_params: [],
        blocker_instances: [],
      },
      long: {
        direction_ok: [false, false, false],
        blockers_ok: [false, false, false],
        setup_ok: [false, false, false],
        trigger_ok: [false, false, false],
        risk_ok: [false, false, false],
        signal_entry: [false, false, false],
        stop_ready: [false, false, false],
        portfolio_entry: [false, false, false],
        internals: {},
      },
      short: {
        direction_ok: [false, false, false],
        blockers_ok: [false, false, false],
        setup_ok: [false, false, false],
        trigger_ok: [false, false, false],
        risk_ok: [false, false, false],
        signal_entry: [false, false, false],
        stop_ready: [false, false, false],
        portfolio_entry: [false, false, false],
        internals: {},
      },
      component_events: [],
    });
  });

  it("shows selected trade entry marker after deferred chart-events merge without re-selecting trade", async () => {
    const deferredChartEvents = createDeferred<ChartEventsBundle>();
    fetchChartEvents.mockReturnValue(deferredChartEvents.promise);

    render(
      <Host>
        <WorkbenchCapture />
        <ChartSliceCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(fetchChartEvents).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(chartSliceRef?.selectedTradeId).toBe(2);
    });

    await act(async () => {
      workbenchRef!.selectTrade(1);
    });

    await waitFor(() => {
      expect(chartSliceRef?.selectedTradeId).toBe(1);
    });

    await act(async () => {
      deferredChartEvents.resolve({
        times: [1100, 1200, 1300],
        component_events: [],
        htf_context: { fast: [1], anchor: [1], slow: [1], meta: {} },
        meta: {
          variant: "exp_a",
          component_ids: { direction: "d", setups: [], trigger: "t", risk: "r" },
          setup_params: [],
          blocker_instances: [],
        },
        coverage: {
          schema_version: 1,
          from_sec: 1100,
          to_sec: 1300,
          bar_count: 3,
          requested_from_sec: 1100,
          requested_to_sec: 1300,
          truncated: false,
          max_bars: 50_000,
        },
      });
    });

    await waitFor(() => {
      expect(chartSliceRef?.selectedTradeId).toBe(1);
      const candles = chartSliceRef!.chartViewModel.candles;
      expect(
        selectedTradeEntryMarkerInView(
          chartSliceRef!.selectedVariant!.trade_records,
          1,
          candles,
        ),
      ).toBe(true);
    });

    const applyMark = dbgExport().steps
      .filter((row) => row.step === DBG.traceDisplay.applyCurrentWindow)
      .at(-1);
    expect(applyMark?.last_meta?.selectedTradeId).toBe(1);
    expect(applyMark?.last_meta?.selectedTradeEntryMarkerInView).toBe(true);
    expect(fetchChartEvents.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
