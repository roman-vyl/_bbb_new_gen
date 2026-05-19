import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  ApiError,
  fetchChartMarketBundle,
  fetchConfigState,
  fetchRunReport,
  fetchRunSummaries,
  fetchSignalTrace,
  selectSavedConfig,
} from "@/api/client";
import {
  CHART_MARKET_TIMEFRAME,
  type AnchorStackPeriods,
  type ChartBar,
  type ChartEmaOverlay,
  type ConfigListEntry,
  type ConfigStateResponse,
  type RunReport,
  type RunSummary,
  type RunVariant,
  type TradeRecord,
  type SignalTraceBundle,
  type StrategyConfigDraft,
  type WorkbenchTab,
} from "@/api/types";
import { COMPOSER_DEFAULT_FAMILY, createBlankConfigDraft } from "@/features/composer/composerDraft";
import {
  AnchorStackParseError,
  anchorStackPeriodsFromStrategySpec,
} from "@/features/chart/anchorStackFromSpec";
import { buildChartViewWindow, emptyChartViewWindow, type ChartViewMode } from "@/features/chart/chartViewWindow";
import { candleRangeMs } from "@/features/chart/chartMarkers";
import {
  defaultClosedTradeSelection,
  findTradeById,
  resolveSelectedTradeEntryTimeMs,
  resolveTradeEntryTimeMs,
} from "@/features/chart/tradeLookup";
import {
  buildMarketCacheKey,
  getMarketCache,
  hasMarketCache,
  setMarketCacheIfAbsent,
  type MarketCacheKey,
} from "@/features/chart/marketDataCache";
export type ReportLoadStatus = "loading" | "ready" | "error";
export type ConfigLoadStatus = "loading" | "ready" | "empty" | "error";
export type MarketLoadStatus = "idle" | "loading" | "ready" | "error";
export type CandlesSource = "market" | "unavailable";
export type SignalTraceLoadStatus = "idle" | "loading" | "ready" | "error";

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
  chartEmaOverlays: ChartEmaOverlay[];
  chartViewMode: ChartViewMode;
  chartViewCenterTimeSec: number | null;
  chartViewFirstTimeSec: number | null;
  chartViewLastTimeSec: number | null;
  chartViewCount: number;
  chartTradeFocusWarning: string | null;
  marketCandlesCount: number;
  fullCandleRange: { min: number; max: number } | null;
  candlesSource: CandlesSource;
  selectedVariantKey: string;
  setSelectedVariantKey: (key: string) => void;
  selectedTradeId: number | null;
  selectTrade: (tradeId: number | null) => void;
  selectedVariant: RunVariant | null;
  configDraft: StrategyConfigDraft | null;
  setConfigDraft: (draft: StrategyConfigDraft) => void;
  configLoadStatus: ConfigLoadStatus;
  configLoadError: string | null;
  configList: ConfigListEntry[];
  selectedConfigPath: string | null;
  reloadConfig: () => Promise<void>;
  selectConfig: (experimentId: string) => Promise<void>;
  createNewConfig: () => void;
  reloadReport: () => void;
  refreshRunsAndSelectRun: (runId: string) => Promise<void>;
  signalTrace: SignalTraceBundle | null;
  signalTraceStatus: SignalTraceLoadStatus;
  signalTraceError: string | null;
  selectedBarTimeSec: number | null;
  selectBar: (timeSec: number | null) => void;
};

const WorkbenchContext = createContext<WorkbenchState | null>(null);

const EMPTY_RUNS_HINT =
  "No research runs found. Run a backtest from Strategy Composer or locally, e.g. " +
  "python -m research.strategies.ema_pullback.run --config <path>, " +
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
  const [configDraft, setConfigDraft] = useState<StrategyConfigDraft | null>(null);
  const [configLoadStatus, setConfigLoadStatus] = useState<ConfigLoadStatus>("loading");
  const [configLoadError, setConfigLoadError] = useState<string | null>(null);
  const [configList, setConfigList] = useState<ConfigListEntry[]>([]);
  const [selectedConfigPath, setSelectedConfigPath] = useState<string | null>(null);

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
  const [selectedBarTimeSec, setSelectedBarTimeSec] = useState<number | null>(null);
  const [signalTrace, setSignalTrace] = useState<SignalTraceBundle | null>(null);
  const [signalTraceStatus, setSignalTraceStatus] = useState<SignalTraceLoadStatus>("idle");
  const [signalTraceError, setSignalTraceError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const prevVariantKeyRef = useRef("");

  const applyTradeFocusSelection = useCallback((trades: readonly TradeRecord[]) => {
    const { tradeId, barTimeSec } = defaultClosedTradeSelection(trades);
    setSelectedTradeId(tradeId);
    setSelectedBarTimeSec(barTimeSec);
  }, []);

  const applyConfigState = useCallback((state: ConfigStateResponse) => {
    setConfigList(state.configs);
    setSelectedConfigPath(state.selected_path);
    if (state.draft) {
      setConfigDraft(state.draft);
      setConfigLoadStatus("ready");
      setConfigLoadError(null);
      return;
    }
    setConfigDraft(null);
    if (state.configs.length === 0) {
      setConfigLoadStatus("empty");
      setConfigLoadError(null);
      return;
    }
    setConfigLoadStatus("error");
    setConfigLoadError("Saved config could not be loaded.");
  }, []);

  const reloadConfig = useCallback(async () => {
    setConfigLoadStatus((status) => (status === "ready" ? status : "loading"));
    try {
      const state = await fetchConfigState(COMPOSER_DEFAULT_FAMILY);
      applyConfigState(state);
    } catch (err) {
      setConfigLoadError(
        err instanceof ApiError ? err.detail : "Failed to load saved strategy config.",
      );
      setConfigLoadStatus("error");
    }
  }, [applyConfigState]);

  const selectConfig = useCallback(
    async (experimentId: string) => {
      try {
        const state = await selectSavedConfig(COMPOSER_DEFAULT_FAMILY, experimentId);
        applyConfigState(state);
        setConfigLoadError(null);
      } catch (err) {
        setConfigLoadError(
          err instanceof ApiError ? err.detail : "Failed to switch strategy config.",
        );
      }
    },
    [applyConfigState],
  );

  const createNewConfig = useCallback(() => {
    setConfigDraft(createBlankConfigDraft(COMPOSER_DEFAULT_FAMILY));
    setSelectedConfigPath(null);
    setConfigLoadStatus("ready");
    setConfigLoadError(null);
  }, []);

  useEffect(() => {
    void reloadConfig();
  }, [reloadConfig]);

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

      let nextVariantKey = "";
      setSelectedVariantKey((prev) => {
        nextVariantKey = loaded.variants.some((v) => v.variant === prev)
          ? prev
          : (loaded.variants[0]?.variant ?? "");
        return nextVariantKey;
      });
      prevVariantKeyRef.current = nextVariantKey;
      const variant =
        loaded.variants.find((v) => v.variant === nextVariantKey) ?? loaded.variants[0];
      if (variant) {
        applyTradeFocusSelection(variant.trade_records);
      } else {
        setSelectedTradeId(null);
        setSelectedBarTimeSec(null);
      }
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
  }, [applyTradeFocusSelection]);

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

  const selectedVariant = useMemo(() => {
    if (!report) return null;
    const found = report.variants.find((v) => v.variant === selectedVariantKey);
    return found ?? report.variants[0] ?? null;
  }, [report, selectedVariantKey]);

  useEffect(() => {
    if (reportLoadStatus !== "ready" || selectedVariant === null) {
      return;
    }
    if (prevVariantKeyRef.current === selectedVariantKey) {
      return;
    }
    prevVariantKeyRef.current = selectedVariantKey;
    applyTradeFocusSelection(selectedVariant.trade_records);
  }, [
    selectedVariantKey,
    selectedVariant,
    reportLoadStatus,
    applyTradeFocusSelection,
  ]);

  useEffect(() => {
    if (report === null || reportLoadStatus !== "ready" || selectedVariant === null) {
      return;
    }
    const snapshot: RunReport = report;
    const variant = selectedVariant;

    let periods: AnchorStackPeriods;
    try {
      periods = anchorStackPeriodsFromStrategySpec(variant.strategy_spec);
    } catch (err) {
      const message =
        err instanceof AnchorStackParseError
          ? err.message
          : "Invalid strategy_spec.anchor_stack in run report";
      setMarketError(message);
      setMarketCacheKey(null);
      setMarketLoadStatus("error");
      return;
    }

    const key = buildMarketCacheKey(
      snapshot,
      chartTimeframe,
      variant.variant,
      periods,
      reloadToken,
    );

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
          emaFast: periods.fast,
          emaAnchor: periods.anchor,
          emaSlow: periods.slow,
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
  }, [report, reportLoadStatus, chartTimeframe, reloadToken, selectedVariant]);

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

  const refreshRunsAndSelectRun = useCallback(
    async (runId: string) => {
      const listed = await fetchRunSummaries();
      setRuns(listed);
      setSelectedRunIdState(runId);
      await loadReport(runId);
    },
    [loadReport],
  );

  const selectedTradeResolution = useMemo(() => {
    if (selectedTradeId === null || !selectedVariant) {
      return {
        trade: undefined,
        entryTimeMs: null as number | null,
        warning: null as string | null,
      };
    }
    const { trade, entryTimeMs } = resolveSelectedTradeEntryTimeMs(
      selectedVariant.trade_records,
      selectedTradeId,
    );
    if (!trade) {
      return {
        trade: undefined,
        entryTimeMs: null,
        warning: `Trade #${selectedTradeId} not found in variant trade_records.`,
      };
    }
    if (entryTimeMs === null) {
      return {
        trade,
        entryTimeMs: null,
        warning: `Trade #${trade.trade_id} has no valid entry_time_ms in report.`,
      };
    }
    return { trade, entryTimeMs, warning: null };
  }, [selectedVariant, selectedTradeId]);

  const selectedTradeEntryTimeMs = selectedTradeResolution.entryTimeMs;
  const chartTradeFocusWarning = selectedTradeResolution.warning;

  const cachedBundle = marketCacheKey !== null ? getMarketCache(marketCacheKey) : undefined;

  const chartView = useMemo(() => {
    if (!cachedBundle || marketLoadStatus !== "ready") {
      return emptyChartViewWindow();
    }
    return buildChartViewWindow({
      candles: cachedBundle.candles,
      emaOverlays: cachedBundle.ema_overlays,
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

  const selectTrade = useCallback(
    (tradeId: number | null) => {
      setSelectedTradeId(tradeId);
      if (tradeId !== null && selectedVariant) {
        const trade = findTradeById(selectedVariant.trade_records, tradeId);
        const entryTimeMs = resolveTradeEntryTimeMs(trade);
        if (entryTimeMs !== null) {
          setSelectedBarTimeSec(Math.floor(entryTimeMs / 1000));
        }
        setActiveTab("chart");
      }
    },
    [selectedVariant],
  );

  const selectBar = useCallback((timeSec: number | null) => {
    setSelectedBarTimeSec(timeSec);
  }, []);

  const chartWindowKey = useMemo(() => {
    if (chartView.candles.length === 0) {
      return null;
    }
    const first = chartView.candles[0]!.time;
    const last = chartView.candles[chartView.candles.length - 1]!.time;
    return `${selectedRunId}:${selectedVariantKey}:${first}:${last}`;
  }, [chartView.candles, selectedRunId, selectedVariantKey]);

  useEffect(() => {
    if (
      report === null ||
      selectedRunId === null ||
      selectedVariant === null ||
      chartWindowKey === null ||
      marketLoadStatus !== "ready"
    ) {
      setSignalTrace(null);
      setSignalTraceStatus("idle");
      setSignalTraceError(null);
      return;
    }

    const candles = chartView.candles;
    const fromMs = candles[0]!.time * 1000;
    const toOpenTimeMs = candles[candles.length - 1]!.time * 1000;
    const runId = selectedRunId;
    const variantKey = selectedVariant.variant;
    let cancelled = false;

    async function loadTrace() {
      setSignalTraceStatus("loading");
      setSignalTraceError(null);
      try {
        const bundle = await fetchSignalTrace({
          runId,
          variant: variantKey,
          fromMs,
          toOpenTimeMs,
        });
        if (cancelled) return;
        setSignalTrace(bundle);
        setSignalTraceStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setSignalTrace(null);
        setSignalTraceStatus("error");
        setSignalTraceError(
          err instanceof ApiError
            ? err.detail
            : err instanceof Error
              ? err.message
              : "Failed to load signal trace.",
        );
      }
    }

    void loadTrace();
    return () => {
      cancelled = true;
    };
  }, [
    report,
    selectedRunId,
    selectedVariant,
    chartWindowKey,
    marketLoadStatus,
    chartView.candles,
  ]);

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
      chartEmaOverlays: chartView.emaOverlays,
      chartViewMode: chartView.mode,
      chartViewCenterTimeSec: chartView.centerTimeSec,
      chartViewFirstTimeSec: chartView.firstTimeSec,
      chartViewLastTimeSec: chartView.lastTimeSec,
      chartViewCount: chartView.count,
      chartTradeFocusWarning,
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
      configLoadStatus,
      configLoadError,
      configList,
      selectedConfigPath,
      reloadConfig,
      selectConfig,
      createNewConfig,
      reloadReport,
      refreshRunsAndSelectRun,
      signalTrace,
      signalTraceStatus,
      signalTraceError,
      selectedBarTimeSec,
      selectBar,
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
      chartView.emaOverlays,
      chartView.mode,
      chartView.centerTimeSec,
      chartView.firstTimeSec,
      chartView.lastTimeSec,
      chartView.count,
      chartTradeFocusWarning,
      marketCandlesCount,
      fullCandleRange,
      candlesSource,
      selectedVariantKey,
      selectedTradeId,
      selectTrade,
      selectedVariant,
      configDraft,
      configLoadStatus,
      configLoadError,
      configList,
      selectedConfigPath,
      reloadConfig,
      selectConfig,
      createNewConfig,
      reloadReport,
      refreshRunsAndSelectRun,
      signalTrace,
      signalTraceStatus,
      signalTraceError,
      selectedBarTimeSec,
      selectBar,
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

