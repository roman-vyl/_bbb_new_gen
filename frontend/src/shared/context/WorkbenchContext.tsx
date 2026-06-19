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
  type HtfContextTrace,
  type ComponentEvent,
  type StrategyConfigDraft,
  type WorkbenchTab,
} from "@/api/types";
import { COMPOSER_DEFAULT_FAMILY, createBlankConfigDraft } from "@/features/composer/composerDraft";
import {
  AnchorStackParseError,
  anchorStackPeriodsFromStrategySpec,
} from "@/features/chart/anchorStackFromSpec";
import { mergeAuxOverlayPoints } from "@/features/chart/chartAuxEmaOverlays";
import type { ChartDataWindowManager } from "@/features/chart/chartDataWindowManager";
import { createChartRuntime, type WindowCommitResult } from "@/features/chart/runtime/chartRuntime";
import { buildChartViewModel, type ChartViewModel } from "@/features/chart/runtime/chartViewModel";
import {
  planTraceDisplayLoad,
  queueTraceFetchIntent,
  takeCommittedTraceFetchIntent,
} from "@/features/chart/runtime/traceDisplayOrchestrator";
import {
  buildTraceRequestKey,
  createSignalTraceRequestCoordinator,
} from "@/features/chart/runtime/signalTraceRequestCoordinator";
import { planMissingTraceDisplayChunkFetch } from "@/features/chart/runtime/traceDisplayChunkScheduling";
import { canEmitTradeFocus } from "@/features/chart/runtime/viewportController";
import type { ChartInteractionEvent, ViewportCommand } from "@/features/chart/runtime/types";
import {
  emptyChartViewWindow,
  findBarIndexAtOrBefore,
  type ChartViewMode,
  type ChartViewWindow,
} from "@/features/chart/chartViewWindow";
import {
  auxOverlayFromHtfSlice,
  auxOverlayFromHtfTrace,
  collectAuxEmaSpecs,
} from "@/features/chart/strategySpecAuxEma";
import {
  defaultChartContextOverlayRef,
  strategyContextRefOptions,
} from "@/features/chart/strategyContexts";
import { candleRangeMs } from "@/features/chart/chartMarkers";
import {
  buildAuxOverlaysStabilizeKey,
  buildEmaOverlaysStabilizeKey,
  buildRenderWindowBoundsKey,
  candleTimeBounds,
  displayAuxOverlaysForRenderWindow,
  frozenHtfOverlaysForStorage,
  stabilizeByWindowBoundsKey,
} from "@/features/chart/chartRenderWindowDisplay";
import {
  buildSessionCacheIdentity,
  createSignalTraceBundleSessionCache,
} from "@/features/chart/signalTraceBundleSessionCache";
import {
  buildTraceDisplayCacheKey,
  createSignalTraceDisplayCache,
  computeChunkBoundsFromResponse,
  isTraceResponseTruncated,
  mergeDisplayChunkFromResponse,
} from "@/features/chart/signalTraceDisplayCache";
import {
  deriveTraceDisplayStateForCandles,
  shouldRetainPreviousTraceDisplay,
  type TraceDisplayState,
} from "@/features/chart/traceDisplayApply";
import {
  defaultClosedTradeSelection,
  deriveSelectedVariant,
  findTradeById,
  formatTradeDisplayNumber,
  isTradeInVariant,
  resolveSelectedTradeEntryTimeMs,
  resolveTradeEntryTimeMs,
  resolveVariantKeyForReport,
  tradeIdsEqual,
} from "@/features/chart/tradeLookup";
import { hasTradeManagementEvents } from "@/features/chart/tradeManagementChartEvents";
import {
  buildMarketFetchKey,
  buildRunMarketViewIdentity,
  composePartialRunMarketBundle,
  getMissingMarketResources,
  isRunMarketViewReady,
  resolveRunMarketView,
  seedChartBundleIntoResourceCaches,
  type RunMarketView,
  type RunMarketViewIdentity,
} from "@/features/chart/runMarketView";
import {
  decideSignalTraceLoad,
  lanesSignalTraceError as deriveLanesSignalTraceError,
  lanesSignalTraceStatus as deriveLanesSignalTraceStatus,
  signalTraceMatchesChartWindow,
  type SignalTraceLoadStatus,
} from "@/shared/context/signalTraceLoadPolicy";
import { evaluateSignalTraceBootstrap } from "@/shared/context/signalTraceBootstrap";
import {
  dbgFlush,
  dbgMark,
  dbgScheduleShiftFlush,
  dbgTimedSync,
  PIPELINE_DEBUG_STEPS as DBG,
} from "@/shared/diagnostics/pipelineDebug";
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
  /** Renderer-facing projection; prefer over individual chart* fields in ChartPanel. */
  chartViewModel: ChartViewModel;
  chartCandles: ChartBar[];
  chartEmaOverlays: ChartEmaOverlay[];
  chartAuxEmaOverlays: ChartAuxEmaOverlay[];
  chartDisplayAuxEmaOverlays: ChartAuxEmaOverlay[];
  htfAuxEmaOverlayStale: boolean;
  chartDisplayComponentEvents: ComponentEvent[];
  componentEventsStale: boolean;
  displayApplyRevision: number;
  renderWindowShiftSeq: number;
  chartShowEntryBlockMarkers: boolean;
  setChartShowEntryBlockMarkers: (show: boolean) => void;
  chartShowExitSignalMarkers: boolean;
  setChartShowExitSignalMarkers: (show: boolean) => void;
  chartShowSetupMarkers: boolean;
  setChartShowSetupMarkers: (show: boolean) => void;
  chartShowTradeManagementPhaseMarkers: boolean;
  setChartShowTradeManagementPhaseMarkers: (show: boolean) => void;
  chartShowTradeManagementExitMarkers: boolean;
  setChartShowTradeManagementExitMarkers: (show: boolean) => void;
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
  selectedTradeId: number | string | null;
  selectTrade: (tradeId: number | string | null) => void;
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
  /** Per-window trace for lanes/diagnostics only — null when bundle is for another render window. */
  lanesSignalTrace: SignalTraceBundle | null;
  lanesSignalTraceStatus: SignalTraceLoadStatus;
  lanesSignalTraceError: string | null;
  signalTraceError: string | null;
  contextOverlayRef: string | null;
  setContextOverlayRef: (ref: string | null) => void;
  effectiveContextOverlayRef: string | null;
  contextOverlayRefOptions: string[];
  selectedBarTimeSec: number | null;
  selectBar: (timeSec: number | null) => void;
  dispatchChartInteraction: (event: ChartInteractionEvent) => void;
  chartViewportCommand: ViewportCommand | null;
  chartViewportCommandSeq: number;
  acknowledgeChartViewportCommand: () => void;
  isWindowSwapTransactionCancelled: (swapTransactionId: number) => boolean;
  settleWindowSwapCommit: (shiftSeq: number, swapTransactionId: number) => void;
};

type WorkbenchShellState = Pick<
  WorkbenchState,
  | "activeTab"
  | "setActiveTab"
  | "reportLoadStatus"
  | "reportError"
  | "reloadReport"
>;

type WorkbenchReportState = Pick<
  WorkbenchState,
  | "symbol"
  | "timeframe"
  | "report"
  | "runs"
  | "selectedRunId"
  | "setSelectedRunId"
  | "selectedVariantKey"
  | "setSelectedVariantKey"
  | "selectedTradeId"
  | "selectTrade"
  | "selectedVariant"
  | "candlesSource"
>;

type WorkbenchComposerState = Pick<
  WorkbenchState,
  | "configDraft"
  | "setConfigDraft"
  | "configLoadStatus"
  | "configLoadError"
  | "configList"
  | "selectedConfigPath"
  | "reloadConfig"
  | "selectConfig"
  | "createNewConfig"
  | "refreshRunsAndSelectRun"
  | "setActiveTab"
>;

type WorkbenchChartState = Pick<
  WorkbenchState,
  | "marketLoadStatus"
  | "marketError"
  | "chartViewModel"
  | "chartCandles"
  | "chartEmaOverlays"
  | "chartAuxEmaOverlays"
  | "chartDisplayAuxEmaOverlays"
  | "htfAuxEmaOverlayStale"
  | "chartDisplayComponentEvents"
  | "componentEventsStale"
  | "displayApplyRevision"
  | "renderWindowShiftSeq"
  | "chartShowEntryBlockMarkers"
  | "setChartShowEntryBlockMarkers"
  | "chartShowExitSignalMarkers"
  | "setChartShowExitSignalMarkers"
  | "chartShowSetupMarkers"
  | "setChartShowSetupMarkers"
  | "chartShowTradeManagementPhaseMarkers"
  | "setChartShowTradeManagementPhaseMarkers"
  | "chartShowTradeManagementExitMarkers"
  | "setChartShowTradeManagementExitMarkers"
  | "chartTimeframe"
  | "reportTimeframe"
  | "timeframeMismatch"
  | "chartViewMode"
  | "chartViewCenterTimeSec"
  | "chartViewFirstTimeSec"
  | "chartViewLastTimeSec"
  | "chartViewCount"
  | "chartTradeFocusWarning"
  | "marketCandlesCount"
  | "fullCandleRange"
  | "candlesSource"
  | "selectedVariant"
  | "selectedTradeId"
  | "selectTrade"
  | "signalTrace"
  | "signalTraceStatus"
  | "lanesSignalTrace"
  | "lanesSignalTraceStatus"
  | "lanesSignalTraceError"
  | "signalTraceError"
  | "contextOverlayRef"
  | "setContextOverlayRef"
  | "effectiveContextOverlayRef"
  | "contextOverlayRefOptions"
  | "selectedBarTimeSec"
  | "selectBar"
  | "dispatchChartInteraction"
  | "chartViewportCommand"
  | "chartViewportCommandSeq"
  | "acknowledgeChartViewportCommand"
  | "isWindowSwapTransactionCancelled"
  | "settleWindowSwapCommit"
>;

const WorkbenchShellContext = createContext<WorkbenchShellState | null>(null);
const WorkbenchReportContext = createContext<WorkbenchReportState | null>(null);
const WorkbenchComposerContext = createContext<WorkbenchComposerState | null>(null);
const WorkbenchChartContext = createContext<WorkbenchChartState | null>(null);

const EMPTY_TRACE_DISPLAY_STATE: TraceDisplayState = {
  status: "empty",
  fromSec: 0,
  toSec: 0,
  events: [],
  htfSlice: { times: [], htf_context: undefined },
  coveredRanges: [],
  missingRange: null,
};

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

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

export function WorkbenchProvider({
  children,
  initialActiveTab = "chart",
}: {
  children: ReactNode;
  initialActiveTab?: WorkbenchTab;
}) {
  const [activeTab, setActiveTab] = useState<WorkbenchTab>(initialActiveTab);
  const [hasChartEverActivated, setHasChartEverActivated] = useState(false);
  const [configDraft, setConfigDraft] = useState<StrategyConfigDraft | null>(null);
  const [configLoadStatus, setConfigLoadStatus] = useState<ConfigLoadStatus>("loading");
  const [configLoadError, setConfigLoadError] = useState<string | null>(null);
  const [configList, setConfigList] = useState<ConfigListEntry[]>([]);
  const [selectedConfigPath, setSelectedConfigPath] = useState<string | null>(null);

  const [reportLoadStatus, setReportLoadStatus] = useState<ReportLoadStatus>("loading");
  const [reportError, setReportError] = useState<string | null>(null);
  const [marketLoadStatus, setMarketLoadStatus] = useState<MarketLoadStatus>("idle");
  const [marketError, setMarketError] = useState<string | null>(null);
  const [runMarketViewIdentity, setRunMarketViewIdentity] = useState<RunMarketViewIdentity | null>(
    null,
  );
  const [marketResourceRevision, setMarketResourceRevision] = useState(0);
  const [auxEmaOverlays, setAuxEmaOverlays] = useState<ChartAuxEmaOverlay[]>([]);
  const signalTraceDisplayCacheRef = useRef(createSignalTraceDisplayCache());
  const signalTraceBundleSessionCacheRef = useRef(createSignalTraceBundleSessionCache());
  const [displayCacheVersion, setDisplayCacheVersion] = useState(0);
  const [displayApplyRevision, setDisplayApplyRevision] = useState(0);
  const [renderWindowShiftSeq, setRenderWindowShiftSeq] = useState(0);
  const [chartDisplayComponentEvents, setChartDisplayComponentEvents] = useState<ComponentEvent[]>([]);
  const chartDisplayComponentEventsRef = useRef<ComponentEvent[]>([]);
  const [traceDisplayState, setTraceDisplayState] = useState<TraceDisplayState>(
    EMPTY_TRACE_DISPLAY_STATE,
  );
  const [chartShowEntryBlockMarkers, setChartShowEntryBlockMarkers] = useState(true);
  const [chartShowExitSignalMarkers, setChartShowExitSignalMarkers] = useState(true);
  const [chartShowSetupMarkers, setChartShowSetupMarkers] = useState(true);
  const [chartShowTradeManagementPhaseMarkers, setChartShowTradeManagementPhaseMarkers] =
    useState(false);
  const [chartShowTradeManagementExitMarkers, setChartShowTradeManagementExitMarkers] =
    useState(false);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRunId, setSelectedRunIdState] = useState<string | null>(null);
  const [report, setReport] = useState<RunReport | null>(null);
  const [selectedVariantKey, setSelectedVariantKeyState] = useState("");
  const [selectedTradeId, setSelectedTradeId] = useState<number | string | null>(null);
  const [selectedBarTimeSec, setSelectedBarTimeSec] = useState<number | null>(null);
  const [signalTrace, setSignalTrace] = useState<SignalTraceBundle | null>(null);
  const [signalTraceStatus, setSignalTraceStatus] = useState<SignalTraceLoadStatus>("idle");
  const [loadedSignalTraceWindowKey, setLoadedSignalTraceWindowKey] = useState<string | null>(null);
  const [signalTraceError, setSignalTraceError] = useState<string | null>(null);
  const [contextOverlayRef, setContextOverlayRef] = useState<string | null>(null);
  const signalTraceRequestCoordinatorRef = useRef(createSignalTraceRequestCoordinator());
  const signalTraceStatusRef = useRef<SignalTraceLoadStatus>("idle");
  const loadedSignalTraceWindowKeyRef = useRef<string | null>(null);
  const previousChartWindowKeyRef = useRef<string | null>(null);
  /** Last HTF aux overlays for current trace coverage; re-sliced when render window moves before trace key catches up. */
  const lastSlicedHtfOverlaysRef = useRef<ChartAuxEmaOverlay[]>([]);
  const traceLoadGenerationRef = useRef(0);
  const applyTraceDisplayRef = useRef<() => void>(() => {});
  const [reloadToken, setReloadToken] = useState(0);
  const prevVariantKeyRef = useRef("");
  const prevRunIdForTradeBootstrapRef = useRef<string | null>(null);
  const selectedVariantKeyRef = useRef("");
  const marketLoadGenRef = useRef(0);
  const intendedRunMarketViewIdentityRef = useRef<RunMarketViewIdentity | null>(null);
  const marketFetchInFlightKeyRef = useRef<string | null>(null);
  const applyWindowCommitRef = useRef<(commit: WindowCommitResult) => void>(() => {});
  const windowSwapTransactionIdRef = useRef(0);
  const windowSwapCancelledThroughIdRef = useRef(0);
  const chartRuntimeRef = useRef(
    createChartRuntime({
      renderWindow: {
        onCommit: (commit) => applyWindowCommitRef.current(commit),
      },
    }),
  );
  const renderWindowManager = (): ChartDataWindowManager =>
    chartRuntimeRef.current.renderWindow.getManager();
  const chartCandlesCacheRef = useRef<{ key: string; value: ChartBar[] }>({ key: "", value: [] });
  const chartEmaCacheRef = useRef<{ key: string; value: ChartEmaOverlay[] }>({ key: "", value: [] });
  const chartAuxEmaCacheRef = useRef<{ key: string; value: ChartAuxEmaOverlay[] }>({
    key: "",
    value: [],
  });
  const [renderWindowRevision, setRenderWindowRevision] = useState(0);
  const [chartViewportCommand, setChartViewportCommand] = useState<ViewportCommand | null>(null);
  const [chartViewportCommandSeq, setChartViewportCommandSeq] = useState(0);
  const skipTradeWindowRebuildRef = useRef(false);
  const renderWindowShiftSeqRef = useRef(0);
  const chartViewCandlesRef = useRef<ChartBar[]>([]);

  useEffect(() => {
    if (activeTab === "chart") {
      setHasChartEverActivated(true);
    }
  }, [activeTab]);

  const chartHeavyIoEnabled = activeTab === "chart" || hasChartEverActivated;

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
      selectedVariantKeyRef.current = key;
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
      setRunMarketViewIdentity(null);
      setMarketResourceRevision(0);
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
    if (reportLoadStatus === "ready" && selectedRunId !== null) {
      dbgMark(DBG.load.reportReady, { runId: selectedRunId });
    }
  }, [reportLoadStatus, selectedRunId]);

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

  const bumpMarketResourceRevision = useCallback(() => {
    setMarketResourceRevision((revision) => revision + 1);
  }, []);

  useEffect(() => {
    if (report === null || reportLoadStatus !== "ready" || selectedVariant === null) {
      return;
    }
    if (!chartHeavyIoEnabled) {
      dbgMark(DBG.load.chartHeavyIoBlocked, {
        source: "market",
      });
      return;
    }
    const snapshot: RunReport = report;
    const variant = selectedVariant;
    const abortController = new AbortController();

    let periods: AnchorStackPeriods;
    let view: RunMarketView;
    try {
      periods = anchorStackPeriodsFromStrategySpec(variant.strategy_spec);
      view = resolveRunMarketView({
        report: snapshot,
        chartTimeframe,
        variant,
        reloadToken,
      });
    } catch (err) {
      const message =
        err instanceof AnchorStackParseError
          ? err.message
          : "Invalid strategy_spec.anchor_stack in run report";
      setMarketError(message);
      setRunMarketViewIdentity(null);
      setMarketLoadStatus("error");
      return;
    }

    const viewIdentity = buildRunMarketViewIdentity(view);
    const missing = getMissingMarketResources(view);
    const fetchKey = buildMarketFetchKey(view, missing);
    const loadGen = ++marketLoadGenRef.current;
    intendedRunMarketViewIdentityRef.current = viewIdentity;

    async function loadMarket() {
      setMarketError(null);

      if (isRunMarketViewReady(view)) {
        dbgMark(DBG.load.marketFetchCacheHit, {
          viewIdentity,
          candlesCached: true,
          overlaysCached: true,
        });
        if (
          marketLoadGenRef.current !== loadGen &&
          intendedRunMarketViewIdentityRef.current !== viewIdentity
        ) {
          dbgMark(DBG.load.marketFetchStaleResponse, { key: viewIdentity, phase: "cache_hit" });
          return;
        }
        setRunMarketViewIdentity(viewIdentity);
        setMarketLoadStatus("ready");
        return;
      }

      if (!missing.candles) {
        setRunMarketViewIdentity(viewIdentity);
        setMarketLoadStatus("ready");
      } else {
        setMarketLoadStatus("loading");
      }

      if (marketFetchInFlightKeyRef.current === fetchKey) {
        dbgMark(DBG.load.marketFetchSkipInFlight, { key: fetchKey });
        return;
      }
      dbgMark(DBG.load.marketFetchStart, {
        key: fetchKey,
        candlesCached: !missing.candles,
        missingOverlayCount: missing.overlays.length,
      });
      marketFetchInFlightKeyRef.current = fetchKey;

      if (missing.candles) {
        setMarketLoadStatus("loading");
      }
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
          signal: abortController.signal,
        });
        seedChartBundleIntoResourceCaches(view, bundle);
        bumpMarketResourceRevision();
        dbgMark(DBG.load.marketFetchEnd, {
          key: fetchKey,
          barCount: bundle.candles.length,
          overlayCount: bundle.ema_overlays.length,
          candlesCached: !missing.candles,
        });
        if (marketFetchInFlightKeyRef.current === fetchKey) {
          marketFetchInFlightKeyRef.current = null;
        }
        const applyToUi =
          marketLoadGenRef.current === loadGen ||
          intendedRunMarketViewIdentityRef.current === viewIdentity;
        if (!applyToUi) {
          dbgMark(DBG.load.marketFetchStaleResponse, { key: fetchKey, phase: "network" });
          return;
        }
        setRunMarketViewIdentity(viewIdentity);
        setMarketLoadStatus("ready");
      } catch (err) {
        if (marketFetchInFlightKeyRef.current === fetchKey) {
          marketFetchInFlightKeyRef.current = null;
        }
        if (isAbortError(err)) {
          dbgMark(DBG.load.marketFetchAbort, {
            key: fetchKey,
            note: "frontend abort/stale-response protection; backend CPU work may continue",
          });
          return;
        }
        if (
          marketLoadGenRef.current !== loadGen &&
          intendedRunMarketViewIdentityRef.current !== viewIdentity
        ) {
          dbgMark(DBG.load.marketFetchStaleResponse, { key: fetchKey, phase: "error" });
          return;
        }
        setMarketError(marketErrorMessage(err));
        setRunMarketViewIdentity(null);
        setMarketLoadStatus("error");
      }
    }

    void loadMarket();
    return () => {
      abortController.abort();
      if (marketFetchInFlightKeyRef.current === fetchKey) {
        marketFetchInFlightKeyRef.current = null;
      }
      marketLoadGenRef.current += 1;
    };
  }, [
    report,
    reportLoadStatus,
    chartTimeframe,
    reloadToken,
    selectedVariantKey,
    chartHeavyIoEnabled,
    bumpMarketResourceRevision,
  ]);

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
        warning: `Trade #${formatTradeDisplayNumber(selectedVariant.trade_records, selectedTradeId)} not found in variant trade_records.`,
      };
    }
    if (entryTimeMs === null) {
      return {
        trade,
        entryTimeMs: null,
        warning: `Trade #${formatTradeDisplayNumber(selectedVariant.trade_records, trade.trade_id)} has no valid entry_time_ms in report.`,
      };
    }
    return { trade, entryTimeMs, warning: null };
  }, [selectedVariant, selectedTradeId]);

  const selectedTradeEntryTimeMs = selectedTradeResolution.entryTimeMs;
  const chartTradeFocusWarning = selectedTradeResolution.warning;

  const intendedRunMarketView = useMemo((): RunMarketView | null => {
    if (report === null || selectedVariant === null) return null;
    try {
      return resolveRunMarketView({
        report,
        chartTimeframe,
        variant: selectedVariant,
        reloadToken,
      });
    } catch {
      return null;
    }
  }, [report, selectedVariant, chartTimeframe, reloadToken]);

  const intendedRunMarketViewIdentity = useMemo((): RunMarketViewIdentity | null => {
    if (intendedRunMarketView === null) return null;
    return buildRunMarketViewIdentity(intendedRunMarketView);
  }, [intendedRunMarketView]);

  const cachedBundle = useMemo(() => {
    if (intendedRunMarketView === null || marketLoadStatus === "error") {
      return undefined;
    }
    return composePartialRunMarketBundle(intendedRunMarketView) ?? undefined;
  }, [
    intendedRunMarketView,
    intendedRunMarketViewIdentity,
    runMarketViewIdentity,
    marketResourceRevision,
    marketLoadStatus,
  ]);

  useEffect(() => {
    if (marketLoadStatus === "ready" && cachedBundle !== undefined) {
      dbgMark(DBG.load.marketBundleReady, { barCount: cachedBundle.candles.length });
    }
  }, [marketLoadStatus, cachedBundle]);

  const bumpRenderWindow = useCallback(() => {
    setRenderWindowRevision((r) => r + 1);
  }, []);

  const emitChartViewportCommand = useCallback((command: ViewportCommand) => {
    if (command.type === "noViewportChange" || command.type === "preserveUserRange") {
      return;
    }
    if (
      command.type === "focusTrade" &&
      !canEmitTradeFocus(chartRuntimeRef.current.viewport.getState())
    ) {
      dbgMark(DBG.chart.viewportApplySkippedNoFocusIntent, {
        mode: chartRuntimeRef.current.viewport.getState().mode,
        viewportOwner: chartRuntimeRef.current.viewport.getState().viewportOwner,
        activeFocusIntent: chartRuntimeRef.current.viewport.getState().activeFocusIntent,
      });
      return;
    }
    setChartViewportCommand(command);
    setChartViewportCommandSeq((seq) => seq + 1);
  }, []);

  const acknowledgeChartViewportCommand = useCallback(() => {
    setChartViewportCommand(null);
  }, []);

  const applyRenderWindowForTrade = useCallback(
    (entryTimeMs: number | null, forceRebuild: boolean) => {
      if (!cachedBundle || cachedBundle.candles.length === 0) {
        return false;
      }
      let rebuilt = false;
      let skipped = false;
      const didRebuild = dbgTimedSync(
        DBG.renderWindow.tradeSelect,
        () => {
          const manager = renderWindowManager();
          if (entryTimeMs === null) {
            const changed = manager.buildTailWindow();
            if (changed !== null) {
              bumpRenderWindow();
            }
            rebuilt = changed !== null;
            return rebuilt;
          }
          const entryIndex = findBarIndexAtOrBefore(
            cachedBundle.candles,
            Math.floor(entryTimeMs / 1000),
          );
          if (!forceRebuild && !manager.shouldRebuildForTrade(entryIndex)) {
            skipTradeWindowRebuildRef.current = true;
            skipped = true;
            return false;
          }
          skipTradeWindowRebuildRef.current = false;
          const changed = manager.buildWindowAroundIndex(entryIndex);
          if (changed !== null) {
            bumpRenderWindow();
          }
          rebuilt = changed !== null;
          return rebuilt;
        },
        () => ({ rebuilt, skipped }),
      );
      return didRebuild;
    },
    [cachedBundle, bumpRenderWindow],
  );

  useEffect(() => {
    if (!cachedBundle || marketLoadStatus === "error") {
      chartRuntimeRef.current.reset();
      renderWindowManager().reset(0);
      bumpRenderWindow();
      return;
    }
    const manager = renderWindowManager();
    manager.reset(cachedBundle.candles.length);
    if (selectedTradeEntryTimeMs !== null) {
      applyRenderWindowForTrade(selectedTradeEntryTimeMs, true);
    } else {
      manager.buildTailWindow();
      bumpRenderWindow();
    }
    dbgMark(DBG.load.renderWindowInit, {
      fullLength: cachedBundle.candles.length,
      variant: selectedVariantKey,
    });
  }, [
    cachedBundle,
    marketLoadStatus,
    selectedRunId,
    selectedVariantKey,
    runMarketViewIdentity,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only on run/variant/bundle identity
  ]);

  useEffect(() => {
    if (!cachedBundle || marketLoadStatus === "error") {
      return;
    }
    applyRenderWindowForTrade(selectedTradeEntryTimeMs, false);
  }, [selectedTradeEntryTimeMs, cachedBundle, marketLoadStatus, applyRenderWindowForTrade]);

  const isWindowSwapTransactionCancelled = useCallback((swapTransactionId: number) => {
    return swapTransactionId <= windowSwapCancelledThroughIdRef.current;
  }, []);

  const settleWindowSwapCommit = useCallback((shiftSeq: number, swapTransactionId: number) => {
    if (swapTransactionId <= windowSwapCancelledThroughIdRef.current) {
      dbgMark(DBG.renderWindow.shiftRestoreCancelled, { shiftSeq, swapTransactionId });
      return;
    }
    chartRuntimeRef.current.renderWindow.settleWindowSwap(shiftSeq);
    dbgMark(DBG.renderWindow.shiftSettled, { shiftSeq, swapTransactionId });
  }, []);

  const dispatchChartInteraction = useCallback(
    (event: ChartInteractionEvent) => {
      if (event.type === "pointerdown") {
        windowSwapCancelledThroughIdRef.current = windowSwapTransactionIdRef.current;
        setChartViewportCommand(null);
      }
      const command = chartRuntimeRef.current.dispatchInteraction(event);
      if (command !== null && command.type !== "restoreAfterWindowSwap") {
        emitChartViewportCommand(command);
      }
    },
    [emitChartViewportCommand],
  );

  const chartWindowSlice = useMemo(() => {
    if (!cachedBundle || marketLoadStatus === "error") {
      return {
        candles: [] as ChartBar[],
        emaOverlays: [] as ChartEmaOverlay[],
        auxEmaOverlays: [] as ChartAuxEmaOverlay[],
        firstTimeSec: null as number | null,
        lastTimeSec: null as number | null,
        count: 0,
      };
    }
    let barCount = 0;
    let overlayCount = 0;
    const slice = dbgTimedSync(
      DBG.chartWindow.slice,
      () => {
        const manager = renderWindowManager();
        manager.setFullLength(cachedBundle.candles.length);
        const anchorEmaOverlays = cachedBundle.ema_overlays;
        const rawCandles = manager.sliceCandles(cachedBundle.candles);
        const rawEma = manager.sliceEmaOverlays(anchorEmaOverlays, cachedBundle.candles);
        const rawAux = manager.sliceAuxOverlays(auxEmaOverlays, cachedBundle.candles);
        const count = rawCandles.length;
        barCount = count;
        overlayCount = rawEma.length + rawAux.length;
        const firstTimeSec = count > 0 ? rawCandles[0]!.time : null;
        const lastTimeSec = count > 0 ? rawCandles[count - 1]!.time : null;
        const boundsKey = buildRenderWindowBoundsKey(firstTimeSec, lastTimeSec, count);
        const emaStabilizeKey = buildEmaOverlaysStabilizeKey(
          boundsKey,
          rawEma,
          intendedRunMarketViewIdentity ?? "",
        );
        const auxStabilizeKey = buildAuxOverlaysStabilizeKey(boundsKey, rawAux);
        return {
          candles: stabilizeByWindowBoundsKey(chartCandlesCacheRef, boundsKey, rawCandles),
          emaOverlays: stabilizeByWindowBoundsKey(chartEmaCacheRef, emaStabilizeKey, rawEma),
          auxEmaOverlays: stabilizeByWindowBoundsKey(chartAuxEmaCacheRef, auxStabilizeKey, rawAux),
          firstTimeSec,
          lastTimeSec,
          count,
        };
      },
      () => ({ barCount, overlayCount }),
    );
    return slice;
  }, [
    cachedBundle,
    marketLoadStatus,
    auxEmaOverlays,
    intendedRunMarketViewIdentity,
    runMarketViewIdentity,
    renderWindowRevision,
  ]);

  const chartView = useMemo((): ChartViewWindow => {
    if (chartWindowSlice.count === 0) {
      return emptyChartViewWindow();
    }
    const mode: ChartViewMode =
      selectedTradeEntryTimeMs !== null ? "around-trade" : "tail";
    const centerTimeSec =
      selectedTradeEntryTimeMs !== null
        ? Math.floor(selectedTradeEntryTimeMs / 1000)
        : null;
    return {
      mode,
      candles: chartWindowSlice.candles,
      emaOverlays: chartWindowSlice.emaOverlays,
      auxEmaOverlays: chartWindowSlice.auxEmaOverlays,
      centerTimeSec,
      firstTimeSec: chartWindowSlice.firstTimeSec,
      lastTimeSec: chartWindowSlice.lastTimeSec,
      count: chartWindowSlice.count,
    };
  }, [chartWindowSlice, selectedTradeEntryTimeMs]);

  chartViewCandlesRef.current = chartView.candles;

  useEffect(() => {
    chartRuntimeRef.current.setViewportPlan(chartView.mode, chartView.centerTimeSec);
  }, [chartView.mode, chartView.centerTimeSec]);

  useEffect(() => {
    intendedRunMarketViewIdentityRef.current = intendedRunMarketViewIdentity;
  }, [intendedRunMarketViewIdentity]);

  useEffect(() => {
    if (intendedRunMarketViewIdentity === null) return;
    if (!isRunMarketViewReady(intendedRunMarketView!)) return;
    if (runMarketViewIdentity === intendedRunMarketViewIdentity && marketLoadStatus === "ready") {
      return;
    }
    setRunMarketViewIdentity(intendedRunMarketViewIdentity);
    setMarketLoadStatus("ready");
  }, [intendedRunMarketView, intendedRunMarketViewIdentity, runMarketViewIdentity, marketLoadStatus]);

  const contextOverlayRefOptions = useMemo(() => {
    if (!selectedVariant) return [];
    return strategyContextRefOptions(selectedVariant.strategy_spec);
  }, [selectedVariant]);

  const defaultContextOverlayRef = useMemo(() => {
    if (!selectedVariant) return null;
    return defaultChartContextOverlayRef(selectedVariant.strategy_spec);
  }, [selectedVariant]);

  /** Resolved ref for trace + HTF overlays (avoids one-frame null before default effect runs). */
  const effectiveContextOverlayRef = contextOverlayRef ?? defaultContextOverlayRef;

  const applyWindowCommit = useCallback(
    (commit: WindowCommitResult) => {
      if (!cachedBundle || cachedBundle.candles.length === 0) {
        return;
      }
      dbgMark(DBG.renderWindow.shiftApplied, {
        windowStartIndex: commit.bounds.windowStartIndex,
        windowEndIndex: commit.bounds.windowEndIndex,
      });
      renderWindowShiftSeqRef.current = commit.shiftSeq;
      setRenderWindowShiftSeq(commit.shiftSeq);

      const swapTransactionId = ++windowSwapTransactionIdRef.current;
      const viewportCmd = chartRuntimeRef.current.viewport.onWindowSwapCommitted({
        anchorTimeSec: commit.anchorTimeSec,
        previousVisible: commit.previousVisible,
        shiftSeq: commit.shiftSeq,
        windowStartIndex: commit.boundsBefore.windowStartIndex,
        fullLength: cachedBundle.candles.length,
      });
      if (viewportCmd.type === "restoreAfterWindowSwap") {
        emitChartViewportCommand({ ...viewportCmd, swapTransactionId });
      } else {
        emitChartViewportCommand(viewportCmd);
      }

      const slice = cachedBundle.candles.slice(
        commit.bounds.windowStartIndex,
        commit.bounds.windowEndIndex,
      );
      if (slice.length > 0 && selectedRunId !== null) {
        const overlay = effectiveContextOverlayRef ?? "";
        const windowKey = `${selectedRunId}:${selectedVariantKey}:${slice[0]!.time}:${slice[slice.length - 1]!.time}:${overlay}`;
        queueTraceFetchIntent(windowKey);
      }

      bumpRenderWindow();
      dbgScheduleShiftFlush();
    },
    [
      cachedBundle,
      bumpRenderWindow,
      selectedRunId,
      selectedVariantKey,
      effectiveContextOverlayRef,
      emitChartViewportCommand,
    ],
  );

  useEffect(() => {
    applyWindowCommitRef.current = applyWindowCommit;
  }, [applyWindowCommit]);

  useEffect(() => {
    if (contextOverlayRef !== null && !contextOverlayRefOptions.includes(contextOverlayRef)) {
      setContextOverlayRef(null);
    }
  }, [contextOverlayRef, contextOverlayRefOptions]);

  useEffect(() => {
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
        effectiveContextOverlayRef,
      );
    } catch {
      return [];
    }
  }, [selectedVariant, chartTimeframe, effectiveContextOverlayRef]);

  const finalizeTraceDisplayUpdate = useCallback(() => {
    applyTraceDisplayRef.current();
    const traceViewportCmd = chartRuntimeRef.current.viewport.onTraceReady();
    if (traceViewportCmd.type !== "noViewportChange" && traceViewportCmd.type !== "restoreAfterWindowSwap") {
      emitChartViewportCommand(traceViewportCmd);
    }
  }, [emitChartViewportCommand]);

  const applyHtfOverlaysFromDisplaySlice = useCallback(
    (htfSlice: { times: number[]; htf_context?: HtfContextTrace }) => {
      const htfSpecCount = auxEmaSpecs.filter((spec) => spec.source === "htf_trace").length;
      if (htfSpecCount === 0 || htfSlice.times.length === 0 || !htfSlice.htf_context) {
        return;
      }
      const htfOverlays = auxEmaSpecs
        .filter((spec) => spec.source === "htf_trace")
        .map((spec) =>
          auxOverlayFromHtfSlice(spec, htfSlice.times, htfSlice.htf_context!),
        )
        .filter((overlay): overlay is ChartAuxEmaOverlay => overlay !== null);
      if (htfOverlays.length === 0) {
        return;
      }
      lastSlicedHtfOverlaysRef.current = htfOverlays;
      setAuxEmaOverlays((prev) => {
        const nonHtf = prev.filter((overlay) => !overlay.id.startsWith("htf_"));
        return mergeAuxOverlayPoints(nonHtf, htfOverlays);
      });
    },
    [auxEmaSpecs],
  );

  const applyTraceDisplayForCurrentWindow = useCallback(() => {
    const candles = chartViewCandlesRef.current;
    const nextDisplayState = deriveTraceDisplayStateForCandles(
      signalTraceDisplayCacheRef.current,
      candles,
      signalTraceStatusRef.current,
    );
    const shouldRetainPreviousDisplay = shouldRetainPreviousTraceDisplay(nextDisplayState, {
      eventCount: chartDisplayComponentEventsRef.current.length,
      htfOverlayPointCount: lastSlicedHtfOverlaysRef.current.reduce(
        (total, overlay) => total + overlay.points.length,
        0,
      ),
    });
    const retainedDisplayStatus =
      signalTraceStatusRef.current === "loading" ? "loading_missing" : nextDisplayState.status;

    setTraceDisplayState(
      shouldRetainPreviousDisplay
        ? {
            ...nextDisplayState,
            status: retainedDisplayStatus,
            events: chartDisplayComponentEventsRef.current,
          }
        : nextDisplayState,
    );

    if (nextDisplayState.status === "empty") {
      chartDisplayComponentEventsRef.current = [];
      setChartDisplayComponentEvents([]);
      setDisplayApplyRevision((revision) => revision + 1);
      return;
    }

    if (!shouldRetainPreviousDisplay) {
      chartDisplayComponentEventsRef.current = nextDisplayState.events;
      setChartDisplayComponentEvents(nextDisplayState.events);
    }
    setDisplayApplyRevision((revision) => revision + 1);

    dbgMark(DBG.traceDisplay.applyCurrentWindow, {
      fromSec: nextDisplayState.fromSec,
      toSec: nextDisplayState.toSec,
      status: shouldRetainPreviousDisplay ? retainedDisplayStatus : nextDisplayState.status,
      eventCount: shouldRetainPreviousDisplay
        ? chartDisplayComponentEventsRef.current.length
        : nextDisplayState.events.length,
      htfTimeCount: nextDisplayState.htfSlice.times.length,
      coveredRanges: nextDisplayState.coveredRanges,
      missingRange: nextDisplayState.missingRange,
      retainedPreviousDisplay: shouldRetainPreviousDisplay,
    });

    if (!shouldRetainPreviousDisplay || nextDisplayState.htfSlice.times.length > 0) {
      applyHtfOverlaysFromDisplaySlice(nextDisplayState.htfSlice);
    }
  }, [applyHtfOverlaysFromDisplaySlice]);

  applyTraceDisplayRef.current = applyTraceDisplayForCurrentWindow;

  useEffect(() => {
    chartDisplayComponentEventsRef.current = chartDisplayComponentEvents;
  }, [chartDisplayComponentEvents]);

  useEffect(() => {
    signalTraceStatusRef.current = signalTraceStatus;
  }, [signalTraceStatus]);

  useEffect(() => {
    loadedSignalTraceWindowKeyRef.current = loadedSignalTraceWindowKey;
  }, [loadedSignalTraceWindowKey]);

  useEffect(() => {
    if (!chartHeavyIoEnabled) {
      dbgMark(DBG.load.chartHeavyIoBlocked, {
        source: "aux_ema",
      });
      return;
    }
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
    const abortController = new AbortController();
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
              signal: abortController.signal,
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
      } catch (err) {
        if (isAbortError(err)) {
          dbgMark(DBG.load.marketFetchAbort, {
            source: "aux_ema",
            note: "frontend abort/stale-response protection; backend CPU work may continue",
          });
          return;
        }
        if (!cancelled) {
          setAuxEmaOverlays((prev) => prev.filter((overlay) => overlay.id.startsWith("htf_")));
        }
      }
    }

    void loadBffAuxEma();
    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [
    marketLoadStatus,
    report,
    chartTimeframe,
    auxEmaSpecs,
    chartHeavyIoEnabled,
  ]);

  useEffect(() => {
    const htfSpecCount = auxEmaSpecs.filter((spec) => spec.source === "htf_trace").length;
    if (htfSpecCount === 0) {
      return;
    }

    const bounds = candleTimeBounds(chartView.candles);
    if (!bounds) {
      return;
    }

    const htfSlice = signalTraceDisplayCacheRef.current.sliceHtfContextForWindow(
      bounds.fromSec,
      bounds.toSec,
    );

    if (htfSlice.times.length > 0 && htfSlice.htf_context) {
      return;
    }

    if (signalTraceStatus === "ready" && signalTrace !== null) {
      const htfOverlays = auxEmaSpecs
        .filter((spec) => spec.source === "htf_trace")
        .map((spec) => auxOverlayFromHtfTrace(spec, signalTrace))
        .filter((overlay): overlay is ChartAuxEmaOverlay => overlay !== null);

      lastSlicedHtfOverlaysRef.current = htfOverlays;
      setAuxEmaOverlays((prev) => {
        const nonHtf = prev.filter((overlay) => !overlay.id.startsWith("htf_"));
        return mergeAuxOverlayPoints(nonHtf, htfOverlays);
      });
      return;
    }

    if (signalTraceStatus === "loading" || signalTraceStatus === "error") {
      return;
    }

    if (signalTraceStatus === "idle" && htfSpecCount > 0) {
      setAuxEmaOverlays((prev) => prev.filter((overlay) => !overlay.id.startsWith("htf_")));
    }
  }, [
    signalTrace,
    signalTraceStatus,
    auxEmaSpecs,
    chartView.candles,
    displayCacheVersion,
    displayApplyRevision,
  ]);

  const traceDisplayCacheKey = useMemo(() => {
    if (selectedRunId === null || selectedVariantKey === "") {
      return null;
    }
    return buildTraceDisplayCacheKey(
      selectedRunId,
      selectedVariantKey,
      effectiveContextOverlayRef,
    );
  }, [selectedRunId, selectedVariantKey, effectiveContextOverlayRef]);

  useEffect(() => {
    if (traceDisplayCacheKey === null) {
      return;
    }
    signalTraceDisplayCacheRef.current.reset(traceDisplayCacheKey);
    signalTraceRequestCoordinatorRef.current.reset();
    traceLoadGenerationRef.current += 1;
    lastSlicedHtfOverlaysRef.current = [];
    chartDisplayComponentEventsRef.current = [];
    setChartDisplayComponentEvents([]);
    setTraceDisplayState(EMPTY_TRACE_DISPLAY_STATE);
    setDisplayCacheVersion((version) => version + 1);
  }, [traceDisplayCacheKey, reloadToken]);

  const sessionCacheIdentity = useMemo(() => {
    if (selectedRunId === null || selectedVariantKey === "") {
      return null;
    }
    return buildSessionCacheIdentity(
      selectedRunId,
      selectedVariantKey,
      effectiveContextOverlayRef,
      reloadToken,
      intendedRunMarketViewIdentity ?? runMarketViewIdentity,
    );
  }, [
    selectedRunId,
    selectedVariantKey,
    effectiveContextOverlayRef,
    reloadToken,
    intendedRunMarketViewIdentity,
    runMarketViewIdentity,
  ]);

  useEffect(() => {
    if (sessionCacheIdentity === null) {
      return;
    }
    signalTraceBundleSessionCacheRef.current.reset(sessionCacheIdentity);
  }, [sessionCacheIdentity]);

  useEffect(() => {
    chartCandlesCacheRef.current = { key: "", value: [] };
    chartEmaCacheRef.current = { key: "", value: [] };
    chartAuxEmaCacheRef.current = { key: "", value: [] };
    lastSlicedHtfOverlaysRef.current = [];
  }, [selectedRunId, selectedVariantKey]);

  const chartWindowKey = useMemo(() => {
    if (chartView.candles.length === 0) {
      return null;
    }
    const first = chartView.candles[0]!.time;
    const last = chartView.candles[chartView.candles.length - 1]!.time;
    const overlay = effectiveContextOverlayRef ?? "";
    return `${selectedRunId}:${selectedVariantKey}:${first}:${last}:${overlay}`;
  }, [chartView.candles, selectedRunId, selectedVariantKey, effectiveContextOverlayRef]);

  const signalTraceMatchesWindow = signalTraceMatchesChartWindow(
    chartWindowKey,
    loadedSignalTraceWindowKey,
  );

  const lanesSignalTrace = signalTraceMatchesWindow ? signalTrace : null;

  const lanesSignalTraceStatus = useMemo(
    () =>
      deriveLanesSignalTraceStatus(
        chartWindowKey,
        loadedSignalTraceWindowKey,
        signalTraceStatus,
      ),
    [chartWindowKey, loadedSignalTraceWindowKey, signalTraceStatus],
  );

  const lanesSignalTraceError = useMemo(
    () =>
      deriveLanesSignalTraceError(
        chartWindowKey,
        loadedSignalTraceWindowKey,
        signalTraceError,
      ),
    [chartWindowKey, loadedSignalTraceWindowKey, signalTraceError],
  );

  const renderWindowBounds = useMemo(
    () => candleTimeBounds(chartView.candles),
    [chartView.candles],
  );

  const renderWindowBoundsKey = useMemo(() => {
    if (renderWindowBounds === null || chartView.count === 0) {
      return "";
    }
    return buildRenderWindowBoundsKey(
      renderWindowBounds.fromSec,
      renderWindowBounds.toSec,
      chartView.count,
    );
  }, [renderWindowBounds, chartView.count]);

  const displayCacheCoversWindow = useMemo(() => {
    if (renderWindowBounds === null) {
      return false;
    }
    return signalTraceDisplayCacheRef.current.coversRange(
      renderWindowBounds.fromSec,
      renderWindowBounds.toSec,
    );
  }, [renderWindowBounds, displayCacheVersion]);

  const displayCacheHasWindowData = useMemo(() => {
    if (renderWindowBounds === null) {
      return false;
    }
    const { fromSec, toSec } = renderWindowBounds;
    const cache = signalTraceDisplayCacheRef.current;
    const eventCount = dbgTimedSync(
      DBG.traceDisplay.sliceEvents,
      () => cache.sliceEventsForWindow(fromSec, toSec).length,
      () => ({ fromSec, toSec }),
    );
    const htfTimes = dbgTimedSync(
      DBG.traceDisplay.sliceHtf,
      () => cache.sliceHtfContextForWindow(fromSec, toSec).times.length,
      () => ({ fromSec, toSec }),
    );
    return eventCount > 0 || htfTimes > 0;
  }, [renderWindowBounds, displayCacheVersion]);

  const htfAuxEmaOverlayStale = useMemo(() => {
    const hasHtfSpecs = auxEmaSpecs.some((spec) => spec.source === "htf_trace");
    if (!hasHtfSpecs) return false;
    if (displayCacheCoversWindow) return false;
    if (signalTraceStatus === "loading") {
      return displayCacheHasWindowData || auxEmaOverlays.some((overlay) => overlay.id.startsWith("htf_"));
    }
    return displayCacheHasWindowData || auxEmaOverlays.some((overlay) => overlay.id.startsWith("htf_"));
  }, [
    auxEmaSpecs,
    auxEmaOverlays,
    displayCacheCoversWindow,
    displayCacheHasWindowData,
    signalTraceStatus,
  ]);

  const chartDisplayAuxEmaOverlays = useMemo(() => {
    const sliced = chartView.auxEmaOverlays;
    const frozenHtf = lastSlicedHtfOverlaysRef.current;
    const display = displayAuxOverlaysForRenderWindow(
      sliced,
      frozenHtf,
      signalTraceMatchesWindow,
      chartView.candles,
    );

    if (signalTraceMatchesWindow) {
      const htfForStorage = frozenHtfOverlaysForStorage(sliced);
      if (htfForStorage.some((overlay) => overlay.points.length > 0)) {
        lastSlicedHtfOverlaysRef.current = htfForStorage;
      }
    }

    return display;
  }, [
    chartView.auxEmaOverlays,
    chartView.candles,
    signalTraceMatchesWindow,
    displayApplyRevision,
  ]);

  useEffect(() => {
    applyTraceDisplayForCurrentWindow();
  }, [renderWindowBounds, displayCacheVersion, applyTraceDisplayForCurrentWindow]);

  const componentEventsStale = useMemo(() => {
    if (
      traceDisplayState.status === "current" ||
      traceDisplayState.status === "empty" ||
      chartDisplayComponentEvents.length === 0
    ) {
      return false;
    }
    return true;
  }, [chartDisplayComponentEvents.length, traceDisplayState.status]);

  const chartViewModel = useMemo(
    () =>
      buildChartViewModel({
        candles: chartView.candles,
        emaOverlays: chartView.emaOverlays,
        auxEmaOverlays: chartView.auxEmaOverlays,
        displayAuxEmaOverlays: chartDisplayAuxEmaOverlays,
        componentEvents: chartDisplayComponentEvents,
        htfOverlayStale: htfAuxEmaOverlayStale,
        componentEventsStale,
        traceDisplayStatus: traceDisplayState.status,
        traceDisplayMissingRange: traceDisplayState.missingRange,
        viewMode: chartView.mode,
        centerTimeSec: chartView.centerTimeSec,
        firstTimeSec: chartView.firstTimeSec,
        lastTimeSec: chartView.lastTimeSec,
        count: chartView.count,
      }),
    [
      chartView,
      chartDisplayAuxEmaOverlays,
      chartDisplayComponentEvents,
      htfAuxEmaOverlayStale,
      componentEventsStale,
      traceDisplayState.status,
      traceDisplayState.missingRange,
    ],
  );

  const fullCandleRange = useMemo(
    () => (cachedBundle ? candleRangeMs(cachedBundle.candles) : null),
    [cachedBundle],
  );

  const marketCandlesCount = cachedBundle?.candles.length ?? 0;
  const candlesSource: CandlesSource =
    cachedBundle !== undefined && marketLoadStatus !== "error" ? "market" : "unavailable";

  const selectTrade = useCallback(
    (tradeId: number | string | null) => {
      let entryTimeSec: number | null = null;
      if (tradeId !== null && selectedVariant) {
        const trade = findTradeById(selectedVariant.trade_records, tradeId);
        const entryTimeMs = resolveTradeEntryTimeMs(trade);
        if (entryTimeMs !== null) {
          entryTimeSec = Math.floor(entryTimeMs / 1000);
        }
      }
      if (entryTimeSec !== null) {
        chartRuntimeRef.current.setViewportPlan("around-trade", entryTimeSec);
      }
      const command = chartRuntimeRef.current.dispatchInteraction({
        type: "trade_selected",
        entryTimeSec,
      });
      if (command !== null && command.type !== "restoreAfterWindowSwap") {
        emitChartViewportCommand(command);
      }
      setSelectedTradeId(tradeId);
      if (
        tradeId !== null &&
        selectedVariant &&
        hasTradeManagementEvents(selectedVariant.trade_management_events) &&
        selectedVariant.trade_management_events!.some((event) =>
          tradeIdsEqual(tradeId, event.trade_id),
        )
      ) {
        setChartShowTradeManagementPhaseMarkers(true);
        setChartShowTradeManagementExitMarkers(true);
      }
      if (tradeId !== null && entryTimeSec !== null) {
        setSelectedBarTimeSec(entryTimeSec);
        if (hasChartEverActivated) {
          setActiveTab("chart");
        }
      }
    },
    [selectedVariant, emitChartViewportCommand, hasChartEverActivated],
  );

  const selectBar = useCallback((timeSec: number | null) => {
    setSelectedBarTimeSec(timeSec);
  }, []);

  useEffect(() => {
    if (!chartHeavyIoEnabled) {
      dbgMark(DBG.load.chartHeavyIoBlocked, {
        source: "signal_trace",
      });
      setSignalTrace(null);
      setSignalTraceStatus("idle");
      setLoadedSignalTraceWindowKey(null);
      setSignalTraceError(null);
      previousChartWindowKeyRef.current = null;
      return;
    }

    const displayCacheCoversWindow =
      renderWindowBounds !== null &&
      signalTraceDisplayCacheRef.current.coversRange(
        renderWindowBounds.fromSec,
        renderWindowBounds.toSec,
      );
    const displayCacheMissingRange =
      renderWindowBounds !== null
        ? signalTraceDisplayCacheRef.current.missingRange(
            renderWindowBounds.fromSec,
            renderWindowBounds.toSec,
          )
        : null;

    if (renderWindowBounds !== null) {
      dbgMark(DBG.traceDisplay.coverage, {
        fromSec: renderWindowBounds.fromSec,
        toSec: renderWindowBounds.toSec,
        coversWindow: displayCacheCoversWindow,
        missingRange: displayCacheMissingRange,
      });
    }

    const bootstrap = evaluateSignalTraceBootstrap({
      report: reportLoadStatus === "ready" ? report : null,
      selectedRunId,
      selectedVariantKey: selectedVariantKey || null,
      marketLoadStatus,
      chartWindowKey,
      candles: chartView.candles,
      renderWindowBounds,
      previousWindowKey: previousChartWindowKeyRef.current,
    });

    if (!bootstrap.ready) {
      dbgMark(DBG.signalTrace.bootstrapBlocked, { reason: bootstrap.reason });
      setSignalTrace(null);
      setSignalTraceStatus("idle");
      setLoadedSignalTraceWindowKey(null);
      setSignalTraceError(null);
      previousChartWindowKeyRef.current = null;
      return;
    }

    const { windowKey, request, fetchSource } = bootstrap;
    const committedWindowKey = windowKey;
    const windowTraceRequestKey = buildTraceRequestKey({
      runId: request.runId,
      variant: request.variant,
      fromMs: request.fromMs,
      toOpenTimeMs: request.toOpenTimeMs,
      contextOverlayRef: effectiveContextOverlayRef,
    });
    const coordinator = signalTraceRequestCoordinatorRef.current;

    dbgMark(DBG.signalTrace.bootstrapReady, {
      windowKey: committedWindowKey,
      traceRequestKey: windowTraceRequestKey,
      renderWindowRevision,
      boundsKey: renderWindowBoundsKey,
    });

    const coalescedFetchKey = takeCommittedTraceFetchIntent();
    const runtime = chartRuntimeRef.current.renderWindow;
    const sessionCacheHasWindow = signalTraceBundleSessionCacheRef.current.has(committedWindowKey);
    const loadDecision = decideSignalTraceLoad({
      chartWindowKey: committedWindowKey,
      sessionCacheHasWindow,
      loadedSignalTraceWindowKey: loadedSignalTraceWindowKeyRef.current,
      request,
    });

    const plan = planTraceDisplayLoad({
      bootstrap,
      coalescedWindowKey: coalescedFetchKey,
      committedWindowKey,
      panScheduling: {
        interactionState: runtime.getInteractionState(),
        hasPendingShift: runtime.getPendingShift() !== null,
        displayCacheCoversWindow,
        committedWindowKey,
        loadedWindowKey: loadedSignalTraceWindowKeyRef.current,
        status: signalTraceStatusRef.current,
      },
      loadDecision,
    });

    const logCoordinatorDecision = (
      coordDecision: ReturnType<typeof coordinator.evaluate>,
      requestKey: string,
      extra?: Record<string, unknown>,
    ) => {
      const ledger = coordinator.ledgerSnapshotForKey(requestKey);
      dbgMark(DBG.signalTrace.decision, {
        traceRequestKey: requestKey,
        decisionReason: coordDecision.action === "fetch" ? "fetch" : coordDecision.reason,
        skipReason: coordDecision.action === "skip" ? coordDecision.reason : undefined,
        plan: plan.action,
        policyAction: loadDecision.action,
        cacheCoverage: displayCacheCoversWindow ? "hit" : "miss",
        missingRange: displayCacheMissingRange,
        requestedFrom: request.fromMs,
        requestedTo: request.toOpenTimeMs,
        coverageFrom: renderWindowBounds?.fromSec,
        coverageTo: renderWindowBounds?.toSec,
        inFlightKeysCount: ledger.inFlightKeysCount,
        inFlightKey: ledger.inFlightKey,
        mergedKeysHit: ledger.mergedKeysHit,
        failedKeysHit: ledger.failedKeysHit,
        windowKey: committedWindowKey,
        sessionCacheHasWindow,
        fetchSource,
        ...extra,
      });
    };

    if (plan.action === "bootstrap_blocked") {
      return;
    }

    if (plan.action === "fetch_superseded") {
      dbgMark(DBG.traceDisplay.fetchSuperseded, {
        coalesced: coalescedFetchKey,
        windowKey: committedWindowKey,
        traceRequestKey: windowTraceRequestKey,
      });
      return;
    }

    if (plan.action === "pan_block") {
      if (plan.applyDisplayFromCache) {
        dbgMark(DBG.traceDisplay.cacheHit, {
          windowKey: committedWindowKey,
          source: "active_pan_block",
        });
        finalizeTraceDisplayUpdate();
      }
      return;
    }

    previousChartWindowKeyRef.current = committedWindowKey;

    if (plan.action === "restore_session") {
      const sessionBundle = signalTraceBundleSessionCacheRef.current.get(committedWindowKey);
      if (sessionBundle === null) {
        return;
      }
      coordinator.markMerged(windowTraceRequestKey, "session_restore");
      dbgMark(DBG.signalTrace.fetchStart, {
        source: "session_restore",
        windowKey: committedWindowKey,
        traceRequestKey: windowTraceRequestKey,
      });
      dbgTimedSync(
        DBG.traceDisplay.mergeChunk,
        () => {
          mergeDisplayChunkFromResponse(signalTraceDisplayCacheRef.current, sessionBundle);
        },
        () => ({
          eventCount: sessionBundle.component_events?.length ?? 0,
          timeCount: sessionBundle.times.length,
        }),
      );
      setDisplayCacheVersion((version) => version + 1);
      setSignalTrace(sessionBundle);
      setLoadedSignalTraceWindowKey(committedWindowKey);
      loadedSignalTraceWindowKeyRef.current = committedWindowKey;
      setSignalTraceStatus("ready");
      signalTraceStatusRef.current = "ready";
      setSignalTraceError(null);
      dbgMark(DBG.traceDisplay.sessionHit, {
        windowKey: committedWindowKey,
        traceRequestKey: windowTraceRequestKey,
      });
      logCoordinatorDecision(
        coordinator.evaluate({
          key: windowTraceRequestKey,
          generation: traceLoadGenerationRef.current,
          displayCacheCoversWindow,
        }),
        windowTraceRequestKey,
        { afterSessionRestore: true },
      );
      finalizeTraceDisplayUpdate();
      return;
    }

    if (plan.action === "defer") {
      if (!displayCacheCoversWindow) {
        dbgMark(DBG.traceDisplay.cacheMiss, {
          windowKey: committedWindowKey,
          traceRequestKey: windowTraceRequestKey,
        });
      }
      return;
    }

    if (plan.action !== "evaluate_network") {
      return;
    }

    if (displayCacheCoversWindow) {
      dbgMark(DBG.traceDisplay.cacheHit, {
        windowKey: committedWindowKey,
        source: "display_cache_covers_window",
      });
      finalizeTraceDisplayUpdate();
      return;
    }

    const chunkPlan = planMissingTraceDisplayChunkFetch({
      cache: signalTraceDisplayCacheRef.current,
      candles: chartView.candles,
      runId: request.runId,
      variant: request.variant,
      contextOverlayRef: effectiveContextOverlayRef,
      chartTimeframe,
    });

    if (chunkPlan === null) {
      finalizeTraceDisplayUpdate();
      return;
    }

    const traceDisplayChunkKey = chunkPlan.traceDisplayChunkKey;
    const traceRequestKey = buildTraceRequestKey({
      runId: request.runId,
      variant: request.variant,
      fromMs: chunkPlan.fromMs,
      toOpenTimeMs: chunkPlan.toOpenTimeMs,
      contextOverlayRef: effectiveContextOverlayRef,
    });

    const coordDecision = coordinator.evaluate({
      key: traceRequestKey,
      generation: traceLoadGenerationRef.current,
      displayCacheCoversWindow: false,
    });
    logCoordinatorDecision(coordDecision, traceRequestKey, { traceDisplayChunkKey, chunkPlan });

    if (coordDecision.action !== "fetch") {
      if (
        coordDecision.reason === "already_merged" ||
        coordDecision.reason === "cache_hit"
      ) {
        dbgMark(DBG.traceDisplay.cacheHit, {
          windowKey: committedWindowKey,
          traceRequestKey,
          traceDisplayChunkKey,
          source: "coordinator_skip",
          reason: coordDecision.reason,
        });
        finalizeTraceDisplayUpdate();
      }
      return;
    }

    dbgMark(DBG.traceDisplay.cacheMiss, {
      windowKey: committedWindowKey,
      traceRequestKey,
      traceDisplayChunkKey,
      missingRange: chunkPlan.missingRange,
      chunkFromSec: chunkPlan.fromSec,
      chunkToSec: chunkPlan.toSec,
    });

    const fetchGeneration = ++traceLoadGenerationRef.current;
    const abortController = new AbortController();
    const runId = request.runId;
    const variantKey = request.variant;
    const { fromMs, toOpenTimeMs } = chunkPlan;

    coordinator.markInFlight(traceRequestKey, fetchGeneration);
    setSignalTraceStatus("loading");
    signalTraceStatusRef.current = "loading";
    setSignalTraceError(null);
    dbgMark(DBG.signalTrace.fetchStart, {
      source: fetchSource,
      windowKey,
      traceRequestKey,
      traceDisplayChunkKey,
    });

    async function loadTrace() {
      try {
        const bundle = await fetchSignalTrace({
          runId,
          variant: variantKey,
          fromMs,
          toOpenTimeMs,
          contextOverlayRef: effectiveContextOverlayRef,
          signal: abortController.signal,
        });
        if (!coordinator.isResponseCurrent(traceRequestKey, fetchGeneration)) {
          dbgMark(DBG.signalTrace.fetchStaleResponse, {
            windowKey,
            traceRequestKey,
            phase: "response",
          });
          return;
        }
        dbgMark(DBG.signalTrace.fetchEnd, {
          windowKey,
          traceRequestKey,
          timeCount: bundle.times.length,
          eventCount: bundle.component_events?.length ?? 0,
        });
        const requestedBounds = {
          fromSec: Math.floor(fromMs / 1000),
          toSec: Math.floor(toOpenTimeMs / 1000),
        };
        const actualBounds = computeChunkBoundsFromResponse(bundle);
        const truncated = isTraceResponseTruncated(requestedBounds, actualBounds);
        dbgTimedSync(
          DBG.traceDisplay.mergeChunk,
          () => {
            mergeDisplayChunkFromResponse(signalTraceDisplayCacheRef.current, bundle);
          },
          () => ({
            eventCount: bundle.component_events?.length ?? 0,
            timeCount: bundle.times.length,
          }),
        );
        coordinator.markMerged(traceRequestKey, "network");
        setDisplayCacheVersion((version) => version + 1);
        finalizeTraceDisplayUpdate();
        dbgMark("wb.signal_trace_merge", {
          windowKey,
          traceRequestKey,
          truncated,
          requested: requestedBounds,
          actual: actualBounds,
        });
        setSignalTrace(bundle);
        setLoadedSignalTraceWindowKey(windowKey);
        loadedSignalTraceWindowKeyRef.current = windowKey;
        setSignalTraceStatus("ready");
        signalTraceStatusRef.current = "ready";
        signalTraceBundleSessionCacheRef.current.set(windowKey, bundle);
        dbgFlush("workbench-after-signal-trace");
      } catch (err) {
        if (isAbortError(err)) {
          dbgMark(DBG.signalTrace.fetchAbort, {
            windowKey,
            traceRequestKey,
            note: "frontend abort/stale-response protection; backend CPU work may continue",
          });
          return;
        }
        if (!coordinator.isResponseCurrent(traceRequestKey, fetchGeneration)) {
          dbgMark(DBG.signalTrace.fetchStaleResponse, {
            windowKey,
            traceRequestKey,
            phase: "error",
          });
          return;
        }
        coordinator.markFailed(traceRequestKey);
        setSignalTrace(null);
        setLoadedSignalTraceWindowKey(windowKey);
        loadedSignalTraceWindowKeyRef.current = windowKey;
        setSignalTraceStatus("error");
        signalTraceStatusRef.current = "error";
        setSignalTraceError(
          err instanceof ApiError
            ? err.detail
            : err instanceof Error
              ? err.message
              : "Failed to load signal trace.",
        );
      } finally {
        coordinator.clearInFlight(traceRequestKey, fetchGeneration);
      }
    }

    void loadTrace();
    return () => {
      abortController.abort();
      coordinator.clearInFlight(traceRequestKey, fetchGeneration);
      traceLoadGenerationRef.current += 1;
    };
  }, [
    reportLoadStatus,
    selectedRunId,
    selectedVariantKey,
    chartWindowKey,
    renderWindowRevision,
    renderWindowBoundsKey,
    marketLoadStatus,
    effectiveContextOverlayRef,
    finalizeTraceDisplayUpdate,
    chartHeavyIoEnabled,
    displayCacheVersion,
    chartTimeframe,
  ]);

  const symbol = report?.symbol ?? "—";
  const timeframe = chartTimeframe;

  const shellValue = useMemo<WorkbenchShellState>(
    () => ({
      activeTab,
      setActiveTab,
      reportLoadStatus,
      reportError,
      reloadReport,
    }),
    [activeTab, reportLoadStatus, reportError, reloadReport],
  );

  const reportValue = useMemo<WorkbenchReportState>(
    () => ({
      symbol,
      timeframe,
      report,
      runs,
      selectedRunId,
      setSelectedRunId,
      selectedVariantKey,
      setSelectedVariantKey,
      selectedTradeId,
      selectTrade,
      selectedVariant,
      candlesSource,
    }),
    [
      symbol,
      timeframe,
      report,
      runs,
      selectedRunId,
      selectedVariantKey,
      selectedTradeId,
      selectTrade,
      selectedVariant,
      candlesSource,
    ],
  );

  const composerValue = useMemo<WorkbenchComposerState>(
    () => ({
      configDraft,
      setConfigDraft,
      configLoadStatus,
      configLoadError,
      configList,
      selectedConfigPath,
      reloadConfig,
      selectConfig,
      createNewConfig,
      refreshRunsAndSelectRun,
      setActiveTab,
    }),
    [
      configDraft,
      configLoadStatus,
      configLoadError,
      configList,
      selectedConfigPath,
      reloadConfig,
      selectConfig,
      createNewConfig,
      refreshRunsAndSelectRun,
    ],
  );

  const chartValue = useMemo<WorkbenchChartState>(
    () => ({
      marketLoadStatus,
      marketError,
      chartViewModel,
      chartCandles: chartView.candles,
      chartEmaOverlays: chartView.emaOverlays,
      chartAuxEmaOverlays: chartView.auxEmaOverlays,
      chartDisplayAuxEmaOverlays,
      htfAuxEmaOverlayStale,
      chartDisplayComponentEvents,
      componentEventsStale,
      displayApplyRevision,
      renderWindowShiftSeq,
      chartShowEntryBlockMarkers,
      setChartShowEntryBlockMarkers,
      chartShowExitSignalMarkers,
      setChartShowExitSignalMarkers,
      chartShowSetupMarkers,
      setChartShowSetupMarkers,
      chartShowTradeManagementPhaseMarkers,
      setChartShowTradeManagementPhaseMarkers,
      chartShowTradeManagementExitMarkers,
      setChartShowTradeManagementExitMarkers,
      chartTimeframe,
      reportTimeframe,
      timeframeMismatch,
      chartViewMode: chartView.mode,
      chartViewCenterTimeSec: chartView.centerTimeSec,
      chartViewFirstTimeSec: chartView.firstTimeSec,
      chartViewLastTimeSec: chartView.lastTimeSec,
      chartViewCount: chartView.count,
      chartTradeFocusWarning,
      marketCandlesCount,
      fullCandleRange,
      candlesSource,
      selectedTradeId,
      selectTrade,
      selectedVariant,
      signalTrace,
      signalTraceStatus,
      lanesSignalTrace,
      lanesSignalTraceStatus,
      lanesSignalTraceError,
      signalTraceError,
      contextOverlayRef,
      setContextOverlayRef,
      effectiveContextOverlayRef,
      contextOverlayRefOptions,
      selectedBarTimeSec,
      selectBar,
      dispatchChartInteraction,
      chartViewportCommand,
      chartViewportCommandSeq,
      acknowledgeChartViewportCommand,
      isWindowSwapTransactionCancelled,
      settleWindowSwapCommit,
    }),
    [
      chartTimeframe,
      reportTimeframe,
      timeframeMismatch,
      marketLoadStatus,
      marketError,
      chartViewModel,
      chartView.candles,
      chartView.emaOverlays,
      chartView.auxEmaOverlays,
      chartDisplayAuxEmaOverlays,
      htfAuxEmaOverlayStale,
      chartDisplayComponentEvents,
      componentEventsStale,
      displayApplyRevision,
      renderWindowShiftSeq,
      chartShowEntryBlockMarkers,
      chartShowExitSignalMarkers,
      chartShowSetupMarkers,
      chartShowTradeManagementPhaseMarkers,
      chartShowTradeManagementExitMarkers,
      chartView.mode,
      chartView.centerTimeSec,
      chartView.firstTimeSec,
      chartView.lastTimeSec,
      chartView.count,
      chartTradeFocusWarning,
      marketCandlesCount,
      fullCandleRange,
      candlesSource,
      selectedTradeId,
      selectTrade,
      selectedVariant,
      signalTrace,
      signalTraceStatus,
      lanesSignalTrace,
      lanesSignalTraceStatus,
      lanesSignalTraceError,
      signalTraceError,
      contextOverlayRef,
      effectiveContextOverlayRef,
      contextOverlayRefOptions,
      selectedBarTimeSec,
      selectBar,
      dispatchChartInteraction,
      chartViewportCommand,
      chartViewportCommandSeq,
      acknowledgeChartViewportCommand,
      isWindowSwapTransactionCancelled,
      settleWindowSwapCommit,
      displayApplyRevision,
      renderWindowShiftSeq,
    ],
  );

  return (
    <WorkbenchShellContext.Provider value={shellValue}>
      <WorkbenchReportContext.Provider value={reportValue}>
        <WorkbenchComposerContext.Provider value={composerValue}>
          <WorkbenchChartContext.Provider value={chartValue}>{children}</WorkbenchChartContext.Provider>
        </WorkbenchComposerContext.Provider>
      </WorkbenchReportContext.Provider>
    </WorkbenchShellContext.Provider>
  );
}

export function useWorkbench(): WorkbenchState {
  const shell = useWorkbenchShell();
  const report = useWorkbenchReport();
  const composer = useWorkbenchComposer();
  const chart = useWorkbenchChart();
  return useMemo(
    () => ({
      ...shell,
      ...report,
      ...composer,
      ...chart,
    }),
    [shell, report, composer, chart],
  );
}

export function useWorkbenchShell(): WorkbenchShellState {
  const ctx = useContext(WorkbenchShellContext);
  if (!ctx) {
    throw new Error("useWorkbenchShell must be used within WorkbenchProvider");
  }
  return ctx;
}

export function useWorkbenchReport(): WorkbenchReportState {
  const ctx = useContext(WorkbenchReportContext);
  if (!ctx) {
    throw new Error("useWorkbenchReport must be used within WorkbenchProvider");
  }
  return ctx;
}

export function useWorkbenchComposer(): WorkbenchComposerState {
  const ctx = useContext(WorkbenchComposerContext);
  if (!ctx) {
    throw new Error("useWorkbenchComposer must be used within WorkbenchProvider");
  }
  return ctx;
}

export function useWorkbenchChart(): WorkbenchChartState {
  const ctx = useContext(WorkbenchChartContext);
  if (!ctx) {
    throw new Error("useWorkbenchChart must be used within WorkbenchProvider");
  }
  return ctx;
}
