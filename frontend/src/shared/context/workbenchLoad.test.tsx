/**
 * @vitest-environment jsdom
 */
import type { ReactNode } from "react";
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
import { clearMarketCache } from "@/features/chart/marketDataCache";
import { WorkbenchProvider, useWorkbench } from "@/shared/context/WorkbenchContext";

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

let workbenchRef: ReturnType<typeof useWorkbench> | null = null;

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
  });

  beforeEach(() => {
    workbenchRef = null;
    vi.clearAllMocks();
    clearMarketCache();
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
});

