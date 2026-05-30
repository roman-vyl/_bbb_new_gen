import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  ApiError,
  fetchChartMarketBundle,
  fetchChartOverlayEma,
  fetchConfigState,
  fetchRunReport,
  fetchRunSummaries,
  fetchSignalTrace,
  selectSavedConfig,
} from "@/api/client";
import {
  CHART_MARKET_TIMEFRAME,
  type AnchorStackPeriods,
  type ChartAuxEmaOverlay,
  type ChartBar,
  type ChartEmaOverlay,
  type ConfigListEntry,
  type ConfigStateResponse,
  type RunReport,
  type RunSummary,
  type RunVariant,
  type TradeRecord,
  type SignalTraceBundle,
  type ComponentEventMarker,
  type StrategyConfigDraft,
  type WorkbenchTab,
} from "@/api/types";
import { COMPOSER_DEFAULT_FAMILY, createBlankConfigDraft } from "@/features/composer/composerDraft";
import {
  AnchorStackParseError,
  anchorStackPeriodsFromStrategySpec,
} from "@/features/chart/anchorStackFromSpec";
import { mergeAuxOverlayPoints } from "@/features/chart/chartAuxEmaOverlays";
import { buildChartViewWindow, emptyChartViewWindow, type ChartViewMode } from "@/features/chart/chartViewWindow";
import {
  auxOverlayFromHtfTrace,
  collectAuxEmaSpecs,
} from "@/features/chart/strategySpecAuxEma";
import {
  defaultChartContextOverlayRef,
  strategyContextRefOptions,
} from "@/features/chart/strategyContexts";
import { candleRangeMs } from "@/features/chart/chartMarkers";
import { filterComponentEventMarkersToTimeRange } from "@/features/chart/chartComponentEventMarkers";
import {
  defaultClosedTradeSelection,
  deriveSelectedVariant,
  findTradeById,
  isTradeInVariant,
  resolveSelectedTradeEntryTimeMs,
  resolveTradeEntryTimeMs,
  resolveVariantKeyForReport,
} from "@/features/chart/tradeLookup";
import {
  buildMarketCacheKey,
  getMarketCache,
  hasMarketCache,
  setMarketCacheIfAbsent,
  type MarketCacheKey,
} from "@/features/chart/marketDataCache";
import {
  decideSignalTraceLoad,
  type SignalTraceLoadStatus,
  type SignalTraceRequest,
} from "@/shared/context/signalTraceLoadPolicy";
export type ReportLoadStatus = "loading" | "ready" | "error";
export type ConfigLoadStatus = "loading" | "ready" | "empty" | "error";
export type MarketLoadStatus = "idle" | "loading" | "ready" | "error";
export type CandlesSource = "market" | "unavailable";
export type { SignalTraceLoadStatus };

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
  chartAuxEmaOverlays: ChartAuxEmaOverlay[];
  chartDisplayAuxEmaOverlays: ChartAuxEmaOverlay[];
  htfAuxEmaOverlayStale: boolean;
  chartDisplayComponentEventMarkers: ComponentEventMarker[];
  componentEventMarkersStale: boolean;
  chartShowEntryBlockMarkers: boolean;
  setChartShowEntryBlockMarkers: (show: boolean) => void;
  chartShowExitSignalMarkers: boolean;
  setChartShowExitSignalMarkers: (show: boolean) => void;
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
  contextOverlayRef: string | null;
  setContextOverlayRef: (ref: string | null) => void;
  contextOverlayRefOptions: string[];
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
  const [auxEmaOverlays, setAuxEmaOverlays] = useState<ChartAuxEmaOverlay[]>([]);
  const lastSlicedHtfOverlaysRef = useRef<ChartAuxEmaOverlay[]>([]);
  const lastSlicedComponentMarkersRef = useRef<ComponentEventMarker[]>([]);
  const [chartShowEntryBlockMarkers, setChartShowEntryBlockMarkers] = useState(true);
  const [chartShowExitSignalMarkers, setChartShowExitSignalMarkers] = useState(true);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRunId, setSelectedRunIdState] = useState<string | null>(null);
  const [report, setReport] = useState<RunReport | null>(null);
  const [selectedVariantKey, setSelectedVariantKeyState] = useState("");
  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null);
  const [selectedBarTimeSec, setSelectedBarTimeSec] = useState<number | null>(null);
  const [signalTrace, setSignalTrace] = useState<SignalTraceBundle | null>(null);
  const [signalTraceStatus, setSignalTraceStatus] = useState<SignalTraceLoadStatus>("idle");
  const [signalTraceError, setSignalTraceError] = useState<string | null>(null);
  const [loadedTraceWindowKey, setLoadedTraceWindowKey] = useState<string | null>(null);
  const [contextOverlayRef, setContextOverlayRef] = useState<string | null>(null);
  const loadingTraceWindowKeyRef = useRef<string | null>(null);
  const inFlightTraceRequestRef = useRef<SignalTraceRequest | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const prevVariantKeyRef = useRef("");
  const prevRunIdForTradeBootstrapRef = useRef<string | null>(null);
  const selectedVariantKeyRef = useRef("");
  const marketLoadGenRef = useRef(0);
  const intendedMarketCacheKeyRef = useRef<MarketCacheKey | null>(null);
  const marketFetchInFlightKeyRef = useRef<MarketCacheKey | null>(null);

  useEffect(() => {
    selectedVariantKeyRef.current = selectedVariantKey;
  }, [selectedVariantKey]);

  const applyTradeFocusSelection = useCallback((trades: readonly TradeRecord[]) => {
    const { tradeId, barTimeSec } = defaultClosedTradeSelection(trades);
    setSelectedTradeId(tradeId);
    setSelectedBarTimeSec(barTimeSec);
  }, []);

  const setSelectedVariantKey = useCallback(
    (key: string) => {
      setSelectedVariantKeyState(key);
      if (report === null) {
        return;
      }
      const variant = deriveSelectedVariant(report, key);
      if (variant !== null) {
        applyTradeFocusSelection(variant.trade_records);
      }
    },
    [report, applyTradeFocusSelection],
  );

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

  // REPORT_LOAD_DEPS: selectedRunId, reloadToken only — do not add UI/report/market state.
  useEffect(() => {
    if (selectedRunId === null) {
      return;
    }
    const runId = selectedRunId;
    let cancelled = false;

    async function loadReportRemote() {
      setReportLoadStatus("loading");
      setReportError(null);
      setMarketError(null);
      setMarketLoadStatus("idle");
      setMarketCacheKey(null);
      try {
        const loaded = await fetchRunReport(runId);
        if (cancelled) return;
        setReport(loaded);
        setReportLoadStatus("ready");
      } catch (err) {
        if (cancelled) return;
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
    }

    void loadReportRemote();
    return () => {
      cancelled = true;
    };
  }, [selectedRunId, reloadToken]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapRuns() {
      try {
        const listed = await fetchRunSummaries();
        if (cancelled) return;

        setRuns(listed);
        const defaultRunId = pickDefaultRunId(listed);
        if (defaultRunId === null) {
          setReport(null);
          setSelectedRunIdState(null);
          setReportError(EMPTY_RUNS_HINT);
          setReportLoadStatus("error");
          return;
        }

        setSelectedRunIdState((prev) => {
          if (prev !== null && listed.some((r) => r.run_id === prev)) {
            return prev;
          }
          return defaultRunId;
        });
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

    void bootstrapRuns();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const selectedVariant = useMemo(
    () => deriveSelectedVariant(report, selectedVariantKey),
    [report, selectedVariantKey],
  );

  useEffect(() => {
    if (report === null) {
      return;
    }
    const next = resolveVariantKeyForReport(report, selectedVariantKeyRef.current);
    setSelectedVariantKeyState(next);
    selectedVariantKeyRef.current = next;
  }, [report]);

  useEffect(() => {
    if (report === null) {
      return;
    }
    const variant = deriveSelectedVariant(report, selectedVariantKey);
    if (variant === null) {
      return;
    }
    const runId = report.run_id;
    const variantChanged = prevVariantKeyRef.current !== selectedVariantKey;
    const runChanged = prevRunIdForTradeBootstrapRef.current !== runId;
    if (!variantChanged && !runChanged) {
      return;
    }
    prevVariantKeyRef.current = selectedVariantKey;
    prevRunIdForTradeBootstrapRef.current = runId;
    applyTradeFocusSelection(variant.trade_records);
  }, [report, report?.run_id, selectedVariantKey, applyTradeFocusSelection]);

  useLayoutEffect(() => {
    if (!selectedVariant || selectedTradeId === null) {
      return;
    }
    if (isTradeInVariant(selectedVariant.trade_records, selectedTradeId)) {
      return;
    }
    applyTradeFocusSelection(selectedVariant.trade_records);
  }, [selectedVariant, selectedTradeId, selectedVariantKey, applyTradeFocusSelection]);

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

    const loadGen = ++marketLoadGenRef.current;
    intendedMarketCacheKeyRef.current = key;

    async function loadMarket() {
      setMarketError(null);

      if (hasMarketCache(key)) {
        if (marketLoadGenRef.current !== loadGen && intendedMarketCacheKeyRef.current !== key) {
          return;
        }
        setMarketCacheKey(key);
        setMarketLoadStatus("ready");
        return;
      }

      if (marketFetchInFlightKeyRef.current === key) {
        return;
      }
      marketFetchInFlightKeyRef.current = key;

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
        setMarketCacheIfAbsent(key, bundle);
        if (marketFetchInFlightKeyRef.current === key) {
          marketFetchInFlightKeyRef.current = null;
        }
        const applyToUi =
          marketLoadGenRef.current === loadGen || intendedMarketCacheKeyRef.current === key;
        if (!applyToUi) {
          return;
        }
        setMarketCacheKey(key);
        setMarketLoadStatus("ready");
      } catch (err) {
        if (marketFetchInFlightKeyRef.current === key) {
          marketFetchInFlightKeyRef.current = null;
        }
        if (marketLoadGenRef.current !== loadGen && intendedMarketCacheKeyRef.current !== key) {
          return;
        }
        setMarketError(marketErrorMessage(err));
        setMarketCacheKey(null);
        setMarketLoadStatus("error");
      }
    }

    void loadMarket();
    return () => {
      marketLoadGenRef.current += 1;
    };
  }, [report, reportLoadStatus, chartTimeframe, reloadToken, selectedVariantKey]);

  const setSelectedRunId = useCallback((runId: string) => {
    setSelectedRunIdState(runId);
  }, []);

  const reloadReport = useCallback(() => {
    setReloadToken((t) => t + 1);
  }, []);

  const refreshRunsAndSelectRun = useCallback(async (runId: string) => {
    const listed = await fetchRunSummaries();
    setRuns(listed);
    setSelectedRunIdState(runId);
  }, []);

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

  const intendedMarketCacheKey = useMemo((): MarketCacheKey | null => {
    if (report === null || selectedVariant === null) return null;
    try {
      const periods = anchorStackPeriodsFromStrategySpec(selectedVariant.strategy_spec);
      return buildMarketCacheKey(
        report,
        chartTimeframe,
        selectedVariant.variant,
        periods,
        reloadToken,
      );
    } catch {
      return null;
    }
  }, [report, selectedVariant, chartTimeframe, reloadToken]);

  useEffect(() => {
    intendedMarketCacheKeyRef.current = intendedMarketCacheKey;
  }, [intendedMarketCacheKey]);

  useEffect(() => {
    if (intendedMarketCacheKey === null) return;
    if (!hasMarketCache(intendedMarketCacheKey)) return;
    if (marketCacheKey === intendedMarketCacheKey && marketLoadStatus === "ready") {
      return;
    }
    setMarketCacheKey(intendedMarketCacheKey);
    setMarketLoadStatus("ready");
  }, [intendedMarketCacheKey, marketCacheKey, marketLoadStatus]);

  const contextOverlayRefOptions = useMemo(() => {
    if (!selectedVariant) return [];
    return strategyContextRefOptions(selectedVariant.strategy_spec);
  }, [selectedVariant]);

  useEffect(() => {
    if (contextOverlayRef !== null && !contextOverlayRefOptions.includes(contextOverlayRef)) {
      setContextOverlayRef(null);
    }
  }, [contextOverlayRef, contextOverlayRefOptions]);

  useEffect(() => {
    setLoadedTraceWindowKey(null);
    if (!selectedVariant) {
      setContextOverlayRef(null);
      return;
    }
    setContextOverlayRef(defaultChartContextOverlayRef(selectedVariant.strategy_spec));
  }, [selectedRunId, selectedVariantKey, selectedVariant]);

  const auxEmaSpecs = useMemo(() => {
    if (!selectedVariant) return [];
    try {
      const periods = anchorStackPeriodsFromStrategySpec(selectedVariant.strategy_spec);
      return collectAuxEmaSpecs(
        selectedVariant.strategy_spec,
        chartTimeframe,
        periods,
        contextOverlayRef,
      );
    } catch {
      return [];
    }
  }, [selectedVariant, chartTimeframe, contextOverlayRef]);

  useEffect(() => {
    if (marketLoadStatus !== "ready" || report === null || auxEmaSpecs.length === 0) {
      setAuxEmaOverlays([]);
      return;
    }

    const bffSpecs = auxEmaSpecs.filter((spec) => spec.source === "bff");
    if (bffSpecs.length === 0) {
      setAuxEmaOverlays((prev) => prev.filter((overlay) => overlay.id.startsWith("htf_")));
      return;
    }

    let cancelled = false;
    const snapshot = report;
    const fromMs = snapshot.data_range.from_open_time_ms;
    const toOpenTimeMs = snapshot.data_range.to_open_time_ms;

    async function loadBffAuxEma() {
      try {
        const loaded = await Promise.all(
          bffSpecs.map(async (spec) => {
            const points = await fetchChartOverlayEma({
              symbol: snapshot.symbol,
              timeframe: chartTimeframe,
              period: spec.period,
              fromMs,
              toOpenTimeMs,
            });
            return {
              id: spec.id,
              label: spec.label,
              period: spec.period,
              timeframe: spec.timeframe,
              points,
              dashed: false,
            } satisfies ChartAuxEmaOverlay;
          }),
        );
        if (cancelled) return;
        setAuxEmaOverlays((prev) => {
          const htfOnly = prev.filter((overlay) => overlay.id.startsWith("htf_"));
          return mergeAuxOverlayPoints(htfOnly, loaded);
        });
      } catch {
        if (!cancelled) {
          setAuxEmaOverlays((prev) => prev.filter((overlay) => overlay.id.startsWith("htf_")));
        }
      }
    }

    void loadBffAuxEma();
    return () => {
      cancelled = true;
    };
  }, [marketLoadStatus, report, chartTimeframe, auxEmaSpecs]);

  useEffect(() => {
    const htfSpecCount = auxEmaSpecs.filter((spec) => spec.source === "htf_trace").length;

    if (signalTraceStatus === "ready" && signalTrace !== null) {
      const htfOverlays = auxEmaSpecs
        .filter((spec) => spec.source === "htf_trace")
        .map((spec) => auxOverlayFromHtfTrace(spec, signalTrace))
        .filter((overlay): overlay is ChartAuxEmaOverlay => overlay !== null);

      setAuxEmaOverlays((prev) => {
        const nonHtf = prev.filter((overlay) => !overlay.id.startsWith("htf_"));
        return mergeAuxOverlayPoints(nonHtf, htfOverlays);
      });
      return;
    }

    if (signalTraceStatus === "loading" || signalTraceStatus === "error") {
      // Keep stale htf_* overlays — do not strip during trace reload (avoids flicker).
      return;
    }

    if (signalTraceStatus === "idle" && htfSpecCount > 0) {
      setAuxEmaOverlays((prev) => prev.filter((overlay) => !overlay.id.startsWith("htf_")));
    }
  }, [signalTrace, signalTraceStatus, auxEmaSpecs]);

  const chartView = useMemo(() => {
    // Keep chart focus usable while a new variant's market bundle loads: marketCacheKey
    // still points at the previous cached bundle (same run candles) until fetch completes.
    if (!cachedBundle || marketLoadStatus === "error") {
      return emptyChartViewWindow();
    }
    const intendedBundle =
      intendedMarketCacheKey !== null ? getMarketCache(intendedMarketCacheKey) : undefined;
    const anchorEmaOverlays = intendedBundle?.ema_overlays ?? [];
    return buildChartViewWindow({
      candles: cachedBundle.candles,
      emaOverlays: anchorEmaOverlays,
      auxEmaOverlays,
      selectedTradeEntryTimeMs,
    });
  }, [
    cachedBundle,
    marketLoadStatus,
    selectedTradeEntryTimeMs,
    auxEmaOverlays,
    intendedMarketCacheKey,
    marketCacheKey,
  ]);

  useEffect(() => {
    lastSlicedHtfOverlaysRef.current = [];
    lastSlicedComponentMarkersRef.current = [];
  }, [selectedRunId, selectedVariantKey]);

  const chartWindowKey = useMemo(() => {
    if (chartView.candles.length === 0) {
      return null;
    }
    const first = chartView.candles[0]!.time;
    const last = chartView.candles[chartView.candles.length - 1]!.time;
    const overlay = contextOverlayRef ?? "";
    return `${selectedRunId}:${selectedVariantKey}:${first}:${last}:${overlay}`;
  }, [chartView.candles, selectedRunId, selectedVariantKey, contextOverlayRef]);

  const traceMatchesWindow =
    signalTraceStatus === "ready" &&
    chartWindowKey !== null &&
    loadedTraceWindowKey === chartWindowKey;

  const htfAuxEmaOverlayStale = useMemo(() => {
    const hasHtfSpecs = auxEmaSpecs.some((spec) => spec.source === "htf_trace");
    if (!hasHtfSpecs) return false;
    if (traceMatchesWindow) return false;
    return (
      auxEmaOverlays.some((overlay) => overlay.id.startsWith("htf_")) ||
      lastSlicedHtfOverlaysRef.current.length > 0
    );
  }, [auxEmaSpecs, auxEmaOverlays, traceMatchesWindow]);

  const chartDisplayAuxEmaOverlays = useMemo(() => {
    const sliced = chartView.auxEmaOverlays;
    const bffOverlays = sliced.filter((overlay) => !overlay.id.startsWith("htf_"));
    const htfSliced = sliced.filter((overlay) => overlay.id.startsWith("htf_"));

    const useFrozenHtf =
      !traceMatchesWindow && lastSlicedHtfOverlaysRef.current.length > 0;

    let htfDisplay = htfSliced;
    if (useFrozenHtf) {
      htfDisplay = lastSlicedHtfOverlaysRef.current;
    } else if (htfSliced.some((overlay) => overlay.points.length > 0)) {
      lastSlicedHtfOverlaysRef.current = htfSliced;
    }

    return [...bffOverlays, ...htfDisplay];
  }, [chartView.auxEmaOverlays, traceMatchesWindow]);

  const chartDisplayComponentEventMarkers = useMemo(() => {
    if (chartView.candles.length === 0) {
      return [];
    }
    const fromSec = chartView.candles[0]!.time;
    const toSec = chartView.candles[chartView.candles.length - 1]!.time;
    const source = signalTrace?.component_event_markers ?? [];
    const sliced = filterComponentEventMarkersToTimeRange(source, fromSec, toSec);

    if (traceMatchesWindow) {
      if (sliced.length > 0 || source.length === 0) {
        lastSlicedComponentMarkersRef.current = sliced;
      }
      return sliced;
    }

    if (lastSlicedComponentMarkersRef.current.length > 0) {
      return lastSlicedComponentMarkersRef.current;
    }

    return sliced;
  }, [chartView.candles, signalTrace?.component_event_markers, traceMatchesWindow]);

  const componentEventMarkersStale = useMemo(() => {
    const hasMarkers =
      (signalTrace?.component_event_markers?.length ?? 0) > 0 ||
      chartDisplayComponentEventMarkers.length > 0;
    if (!hasMarkers) {
      return false;
    }
    if (traceMatchesWindow) {
      return false;
    }
    return true;
  }, [signalTrace?.component_event_markers, chartDisplayComponentEventMarkers, traceMatchesWindow]);

  const fullCandleRange = useMemo(
    () => (cachedBundle ? candleRangeMs(cachedBundle.candles) : null),
    [cachedBundle],
  );

  const marketCandlesCount = cachedBundle?.candles.length ?? 0;
  const candlesSource: CandlesSource =
    cachedBundle !== undefined && marketLoadStatus !== "error" ? "market" : "unavailable";

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
    [selectedVariant, selectedTradeId],
  );

  const selectBar = useCallback((timeSec: number | null) => {
    setSelectedBarTimeSec(timeSec);
  }, []);

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
      setLoadedTraceWindowKey(null);
      loadingTraceWindowKeyRef.current = null;
      inFlightTraceRequestRef.current = null;
      return;
    }

    const candles = chartView.candles;
    if (candles.length === 0) {
      return;
    }

    const fromMs = candles[0]!.time * 1000;
    const toOpenTimeMs = candles[candles.length - 1]!.time * 1000;
    const runId = selectedRunId;
    const variantKey = selectedVariant.variant;
    const windowKey = chartWindowKey;
    const request: SignalTraceRequest = {
      windowKey,
      runId,
      variant: variantKey,
      fromMs,
      toOpenTimeMs,
    };

    const decision = decideSignalTraceLoad({
      chartWindowKey: windowKey,
      loadedTraceWindowKey,
      loadingTraceWindowKey: loadingTraceWindowKeyRef.current,
      signalTraceStatus,
      inFlightRequest: inFlightTraceRequestRef.current,
      request,
    });

    if (
      decision.action === "skip_already_loaded" ||
      decision.action === "skip_already_loading" ||
      decision.action === "skip_identical_in_flight" ||
      decision.action === "skip_idle"
    ) {
      return;
    }

    loadingTraceWindowKeyRef.current = windowKey;
    inFlightTraceRequestRef.current = request;
    setSignalTraceStatus("loading");
    setSignalTraceError(null);

    let cancelled = false;

    async function loadTrace() {
      try {
        const bundle = await fetchSignalTrace({
          runId,
          variant: variantKey,
          fromMs,
          toOpenTimeMs,
          contextOverlayRef,
        });
        if (cancelled) return;
        setSignalTrace(bundle);
        setLoadedTraceWindowKey(windowKey);
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
      } finally {
        if (!cancelled) {
          loadingTraceWindowKeyRef.current = null;
          inFlightTraceRequestRef.current = null;
        }
      }
    }

    void loadTrace();
    return () => {
      cancelled = true;
    };
  }, [
    report,
    selectedRunId,
    selectedVariant?.variant,
    chartWindowKey,
    marketLoadStatus,
    contextOverlayRef,
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
      chartAuxEmaOverlays: chartView.auxEmaOverlays,
      chartDisplayAuxEmaOverlays,
      htfAuxEmaOverlayStale,
      chartDisplayComponentEventMarkers,
      componentEventMarkersStale,
      chartShowEntryBlockMarkers,
      setChartShowEntryBlockMarkers,
      chartShowExitSignalMarkers,
      setChartShowExitSignalMarkers,
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
      contextOverlayRef,
      setContextOverlayRef,
      contextOverlayRefOptions,
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
      chartDisplayAuxEmaOverlays,
      htfAuxEmaOverlayStale,
      chartDisplayComponentEventMarkers,
      componentEventMarkersStale,
      chartShowEntryBlockMarkers,
      chartShowExitSignalMarkers,
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
      contextOverlayRef,
      contextOverlayRefOptions,
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

