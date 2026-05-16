import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  ApiError,
  fetchCandles,
  fetchEma,
  fetchRunReport,
  fetchRunSummaries,
  reportRangeEndMs,
} from "@/api/client";
import {
  CHART_EMA_PERIOD,
  CHART_MARKET_TIMEFRAME,
  type ChartBar,
  type IndicatorPoint,
  type RunReport,
  type RunSummary,
  type RunVariant,
  type StrategyConfigDraft,
  type WorkbenchTab,
} from "@/api/types";
import configDraftFixture from "@/fixtures/config_draft.json";

export type ReportLoadStatus = "loading" | "ready" | "error";
export type CandlesSource = "fixture" | "market";

type WorkbenchState = {
  symbol: string;
  timeframe: string;
  chartTimeframe: string;
  reportTimeframe: string | null;
  timeframeMismatch: boolean;
  activeTab: WorkbenchTab;
  setActiveTab: (tab: WorkbenchTab) => void;
  reportLoadStatus: ReportLoadStatus;
  reportError: string | null;
  marketError: string | null;
  runs: RunSummary[];
  selectedRunId: string | null;
  setSelectedRunId: (runId: string) => void;
  report: RunReport | null;
  candles: ChartBar[];
  emaPoints: IndicatorPoint[];
  candlesSource: CandlesSource;
  selectedVariantKey: string;
  setSelectedVariantKey: (key: string) => void;
  selectedTradeId: number | null;
  selectTrade: (tradeId: number | null) => void;
  selectedVariant: RunVariant | null;
  configDraft: StrategyConfigDraft;
  setConfigDraft: (draft: StrategyConfigDraft) => void;
  reloadReport: () => void;
};

const WorkbenchContext = createContext<WorkbenchState | null>(null);

const EMPTY_RUNS_HINT =
  "No research runs found. Run a backtest locally, e.g. " +
  "python -m research.strategies.ema_pullback.run --config <yaml>, " +
  "then refresh.";

function pickDefaultRunId(runs: RunSummary[]): string | null {
  if (runs.length === 0) return null;
  return runs[0].run_id;
}

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTab] = useState<WorkbenchTab>("chart");
  const [configDraft, setConfigDraft] = useState(
    () => configDraftFixture as StrategyConfigDraft,
  );

  const [reportLoadStatus, setReportLoadStatus] = useState<ReportLoadStatus>("loading");
  const [reportError, setReportError] = useState<string | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRunId, setSelectedRunIdState] = useState<string | null>(null);
  const [report, setReport] = useState<RunReport | null>(null);
  const [candles, setCandles] = useState<ChartBar[]>([]);
  const [emaPoints, setEmaPoints] = useState<IndicatorPoint[]>([]);
  const [candlesSource, setCandlesSource] = useState<CandlesSource>("fixture");
  const [selectedVariantKey, setSelectedVariantKey] = useState("");
  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const chartTimeframe = CHART_MARKET_TIMEFRAME;
  const reportTimeframe = report?.timeframe ?? null;
  const timeframeMismatch =
    reportTimeframe !== null && reportTimeframe !== chartTimeframe;

  const loadReport = useCallback(async (runId: string) => {
    setReportLoadStatus("loading");
    setReportError(null);
    setMarketError(null);
    try {
      const loaded = await fetchRunReport(runId);
      setReport(loaded);
      setSelectedVariantKey((prev) => {
        if (loaded.variants.some((v) => v.variant === prev)) {
          return prev;
        }
        return loaded.variants[0]?.variant ?? "";
      });
      setSelectedTradeId(null);
      setReportLoadStatus("ready");
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.detail
          : err instanceof Error
            ? err.message
            : "Failed to load run report.";
      setReport(null);
      setReportError(message);
      setReportLoadStatus("error");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setReportLoadStatus("loading");
      setReportError(null);
      try {
        const listed = await fetchRunSummaries();
        if (cancelled) return;

        setRuns(listed);
        const runId = pickDefaultRunId(listed);
        if (runId === null) {
          setReport(null);
          setReportError(EMPTY_RUNS_HINT);
          setReportLoadStatus("error");
          return;
        }

        setSelectedRunIdState(runId);
        await loadReport(runId);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof ApiError
            ? err.detail
            : err instanceof Error
              ? err.message
              : "Failed to reach Research API.";
        setReportError(message);
        setReportLoadStatus("error");
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [loadReport, reloadToken]);

  useEffect(() => {
    if (report === null || reportLoadStatus !== "ready") {
      return;
    }
    const snapshot: RunReport = report;

    let cancelled = false;

    async function loadMarket() {
      setMarketError(null);
      const fromMs = snapshot.data_range.from_open_time_ms;
      const toMs = reportRangeEndMs(snapshot.data_range.to_open_time_ms, chartTimeframe);

      try {
        const [loadedCandles, loadedEma] = await Promise.all([
          fetchCandles({
            symbol: snapshot.symbol,
            timeframe: chartTimeframe,
            fromMs,
            toMs,
          }),
          fetchEma({
            symbol: snapshot.symbol,
            timeframe: chartTimeframe,
            period: CHART_EMA_PERIOD,
            fromMs,
            toMs,
          }),
        ]);
        if (cancelled) return;
        setCandles(loadedCandles);
        setEmaPoints(loadedEma);
        setCandlesSource("market");
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof ApiError
            ? err.detail
            : err instanceof Error
              ? err.message
              : "Failed to load market data.";
        setMarketError(message);
        setCandles([]);
        setEmaPoints([]);
        setCandlesSource("fixture");
      }
    }

    void loadMarket();
    return () => {
      cancelled = true;
    };
  }, [report, reportLoadStatus, chartTimeframe]);

  const setSelectedRunId = useCallback(
    (runId: string) => {
      setSelectedRunIdState(runId);
      void loadReport(runId);
    },
    [loadReport],
  );

  const reloadReport = useCallback(() => {
    setReloadToken((t) => t + 1);
  }, []);

  const selectedVariant = useMemo(() => {
    if (!report) return null;
    const found = report.variants.find((v) => v.variant === selectedVariantKey);
    return found ?? report.variants[0] ?? null;
  }, [report, selectedVariantKey]);

  const selectTrade = useCallback((tradeId: number | null) => {
    setSelectedTradeId(tradeId);
    if (tradeId !== null) {
      setActiveTab("chart");
    }
  }, []);

  const symbol = report?.symbol ?? "—";
  const timeframe = chartTimeframe;

  const value = useMemo<WorkbenchState>(
    () => ({
      symbol,
      timeframe,
      chartTimeframe,
      reportTimeframe,
      timeframeMismatch,
      activeTab,
      setActiveTab,
      reportLoadStatus,
      reportError,
      marketError,
      runs,
      selectedRunId,
      setSelectedRunId,
      report,
      candles,
      emaPoints,
      candlesSource,
      selectedVariantKey,
      setSelectedVariantKey,
      selectedTradeId,
      selectTrade,
      selectedVariant,
      configDraft,
      setConfigDraft,
      reloadReport,
    }),
    [
      symbol,
      timeframe,
      chartTimeframe,
      reportTimeframe,
      timeframeMismatch,
      activeTab,
      reportLoadStatus,
      reportError,
      marketError,
      runs,
      selectedRunId,
      setSelectedRunId,
      report,
      candles,
      emaPoints,
      candlesSource,
      selectedVariantKey,
      selectedTradeId,
      selectTrade,
      selectedVariant,
      configDraft,
      reloadReport,
    ],
  );

  return <WorkbenchContext.Provider value={value}>{children}</WorkbenchContext.Provider>;
}

export function useWorkbench(): WorkbenchState {
  const ctx = useContext(WorkbenchContext);
  if (!ctx) {
    throw new Error("useWorkbench must be used within WorkbenchProvider");
  }
  return ctx;
}
