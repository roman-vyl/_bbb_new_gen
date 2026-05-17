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
  fetchChartMarketBundle,
  fetchRunReport,
  fetchRunSummaries,
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
import { buildChartViewWindow } from "@/features/chart/chartViewWindow";
import { candleRangeMs } from "@/features/chart/chartMarkers";
import {
  buildMarketCacheKey,
  getMarketCache,
  hasMarketCache,
  setMarketCacheIfAbsent,
  type MarketCacheKey,
} from "@/features/chart/marketDataCache";
import configDraftFixture from "@/fixtures/config_draft.json";

export type ReportLoadStatus = "loading" | "ready" | "error";
export type MarketLoadStatus = "idle" | "loading" | "ready" | "error";
export type CandlesSource = "market" | "unavailable";

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
  marketLoadStatus: MarketLoadStatus;
  marketError: string | null;
  runs: RunSummary[];
  selectedRunId: string | null;
  setSelectedRunId: (runId: string) => void;
  report: RunReport | null;
  chartCandles: ChartBar[];
  chartEma: IndicatorPoint[];
  marketCandlesCount: number;
  fullCandleRange: { min: number; max: number } | null;
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

function marketErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 404) {
      return `${err.detail} — перезапустите BFF (uvicorn) после обновления кода; нужен /api/market/chart-bundle`;
    }
    return err.detail;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return "Failed to load market data.";
}

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTab] = useState<WorkbenchTab>("chart");
  const [configDraft, setConfigDraft] = useState(
    () => configDraftFixture as StrategyConfigDraft,
  );

  const [reportLoadStatus, setReportLoadStatus] = useState<ReportLoadStatus>("loading");
  const [reportError, setReportError] = useState<string | null>(null);
  const [marketLoadStatus, setMarketLoadStatus] = useState<MarketLoadStatus>("idle");
  const [marketError, setMarketError] = useState<string | null>(null);
  const [marketCacheKey, setMarketCacheKey] = useState<MarketCacheKey | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRunId, setSelectedRunIdState] = useState<string | null>(null);
  const [report, setReport] = useState<RunReport | null>(null);
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
    setMarketLoadStatus("idle");
    setMarketCacheKey(null);
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
    const key = buildMarketCacheKey(snapshot, chartTimeframe, reloadToken);

    let cancelled = false;

    async function loadMarket() {
      setMarketError(null);

      if (hasMarketCache(key)) {
        if (cancelled) return;
        setMarketCacheKey(key);
        setMarketLoadStatus("ready");
        return;
      }

      setMarketLoadStatus("loading");
      const fromMs = snapshot.data_range.from_open_time_ms;
      const toOpenTimeMs = snapshot.data_range.to_open_time_ms;

      try {
        const bundle = await fetchChartMarketBundle({
          symbol: snapshot.symbol,
          timeframe: chartTimeframe,
          fromMs,
          toOpenTimeMs,
          emaPeriod: CHART_EMA_PERIOD,
        });
        if (cancelled) return;
        setMarketCacheIfAbsent(key, bundle);
        setMarketCacheKey(key);
        setMarketLoadStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setMarketError(marketErrorMessage(err));
        setMarketCacheKey(null);
        setMarketLoadStatus("error");
      }
    }

    void loadMarket();
    return () => {
      cancelled = true;
    };
  }, [report, reportLoadStatus, chartTimeframe, reloadToken]);

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

  const selectedTradeEntryTimeMs = useMemo(() => {
    if (selectedTradeId === null || !selectedVariant) {
      return null;
    }
    const trade = selectedVariant.trade_records.find((t) => t.trade_id === selectedTradeId);
    return trade?.entry_time_ms ?? null;
  }, [selectedVariant, selectedTradeId]);

  const cachedBundle = marketCacheKey !== null ? getMarketCache(marketCacheKey) : undefined;

  const chartView = useMemo(() => {
    if (!cachedBundle || marketLoadStatus !== "ready") {
      return { candles: [] as ChartBar[], ema: [] as IndicatorPoint[] };
    }
    return buildChartViewWindow({
      candles: cachedBundle.candles,
      ema: cachedBundle.ema,
      selectedTradeEntryTimeMs,
    });
  }, [cachedBundle, marketLoadStatus, selectedTradeEntryTimeMs]);

  const fullCandleRange = useMemo(
    () => (cachedBundle ? candleRangeMs(cachedBundle.candles) : null),
    [cachedBundle],
  );

  const marketCandlesCount = cachedBundle?.candles.length ?? 0;
  const candlesSource: CandlesSource =
    marketLoadStatus === "ready" && cachedBundle !== undefined ? "market" : "unavailable";

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
      marketLoadStatus,
      marketError,
      runs,
      selectedRunId,
      setSelectedRunId,
      report,
      chartCandles: chartView.candles,
      chartEma: chartView.ema,
      marketCandlesCount,
      fullCandleRange,
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
      marketLoadStatus,
      marketError,
      runs,
      selectedRunId,
      setSelectedRunId,
      report,
      chartView.candles,
      chartView.ema,
      marketCandlesCount,
      fullCandleRange,
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
