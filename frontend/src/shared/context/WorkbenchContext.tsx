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
  fetchChartOverlayEma,
  fetchConfigState,
  fetchRunReport,
  fetchRunSummaries,
  selectSavedConfig,
} from "@/api/client";
import {
  CHART_MARKET_TIMEFRAME,
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
import { resolveChartTimeframeMs } from "@/features/chart/chartTimeframeMs";
import {
  AnchorStackParseError,
  anchorStackPeriodsFromStrategySpec,
} from "@/features/chart/anchorStackFromSpec";
import {
  executeMarketWindowLoad,
  buildMarketTargetWindowKey,
  evaluateMarketPanPrefetchExpansion,
  marketCandlesReadyForTarget,
  resolveMarketTargetWindow,
  type MarketDisplayWindowMs,
} from "@/features/chart/workbenchMarketLoad";
import { getCandles } from "@/features/chart/marketResourceCache";
import { mergeAuxOverlayPoints } from "@/features/chart/chartAuxEmaOverlays";
import type { WindowCommitResult } from "@/features/chart/runtime/chartRuntime";
import type { ChartViewModel } from "@/features/chart/runtime/chartViewModel";
import {
  queueTraceFetchIntent,
  takeCommittedTraceFetchIntent,
} from "@/features/chart/runtime/traceDisplayOrchestrator";
import { flushLanesLoadDebug } from "@/features/chart/runtime/workbenchTraceNetworkLoad";
import type { ChartInteractionEvent, ViewportCommand } from "@/features/chart/runtime/types";
import {
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
import { candleRangeMs, selectedTradeEntryMarkerInView } from "@/features/chart/chartMarkers";
import {
  buildRenderWindowBoundsKey,
  candleTimeBounds,
  displayAuxOverlaysForRenderWindow,
  frozenHtfOverlaysForStorage,
} from "@/features/chart/chartRenderWindowDisplay";
import {
  buildSessionCacheIdentity,
} from "@/features/chart/signalTraceBundleSessionCache";
import {
  buildTraceDisplayCacheKey,
} from "@/features/chart/signalTraceDisplayCache";
import {
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
  buildRunMarketViewIdentity,
  composeDisplayMarketWindowBundle,
  resolveRunMarketView,
  type RunMarketView,
  type RunMarketViewIdentity,
} from "@/features/chart/runMarketView";
import {
  lanesSignalTraceError as deriveLanesSignalTraceError,
  lanesSignalTraceStatus as deriveLanesSignalTraceStatus,
  signalTraceMatchesChartWindow,
  type SignalTraceLoadStatus,
} from "@/shared/context/signalTraceLoadPolicy";
import { evaluateSignalTraceBootstrap } from "@/shared/context/signalTraceBootstrap";
import {
  dbgMark,
  dbgScheduleShiftFlush,
  PIPELINE_DEBUG_STEPS as DBG,
} from "@/shared/diagnostics/pipelineDebug";
import {
  dbgMarkCutover,
  dbgTimedSyncCutover,
  emitCutoverDomainOwnersSnapshot,
} from "@/features/workbenchChartRuntime/chartRuntimeCutoverTelemetry";
import { resolvePhase63AModelRuntimeSlice } from "@/features/workbenchChartRuntime/phase63AModelAdapterBridge";
import {
  buildChartViewWindowFromPhase63BSlice,
  createPhase63BRenderWindowOwnerState,
  resolvePhase63BChartWindowSlice,
  runPhase63BApplyTrade,
  runPhase63BOffsetPrepend,
  runPhase63BRenderWindowInit,
  type Phase63BRenderWindowOwnerState,
} from "@/features/workbenchChartRuntime/phase63BRenderWindowBridge";
import { applyRenderWindowShiftCommit } from "@/features/workbenchChartRuntime/renderWindowRuntime";
import {
  createPhase63CViewportOwnerState,
  runPhase63CAcknowledgeViewportCommand,
  runPhase63CCancelViewportOnPointerDown,
  runPhase63CDispatchViewportInteraction,
  runPhase63CIsWindowSwapTransactionCancelled,
  runPhase63COnTraceReady,
  runPhase63COnWindowSwapCommitted,
  runPhase63CSelectTradeFocusCommand,
  runPhase63CSettleWindowSwapCommit,
  runPhase63CSetViewportPlan,
  type Phase63CViewportOwnerState,
} from "@/features/workbenchChartRuntime/phase63CViewportCommandBridge";
import { resetTraceCoordinator } from "@/features/workbenchChartRuntime/traceRuntime";
import {
  createPhase63DTraceEventsOwnerState,
  logPhase63DTraceCoverage,
  resetPhase63DTraceDisplayCache,
  resetPhase63DTraceSessionCache,
  resolvePhase63DLanesSnapshot,
  runPhase63DApplyTraceDisplayForWindow,
  runPhase63DTraceLoadCycle,
  shouldPhase63DFinalizeTraceDisplay,
  type Phase63DTraceEventsOwnerState,
} from "@/features/workbenchChartRuntime/phase63DTraceEventsBridge";
import { derivePhase63AModelDomainFieldsFromRuntime } from "@/features/workbenchChartRuntime/runtimeOutputAdapter.contract";
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
      return `${err.detail} — перезапустите BFF (uvicorn) после обновления кода; нужны /api/market/candles-window и /api/market/ema-window`;
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
  const [marketCandlesRevision, setMarketCandlesRevision] = useState(0);
  const [marketOverlayRevision, setMarketOverlayRevision] = useState(0);
  const marketReadyTargetKeyRef = useRef<string | null>(null);
  const cachedBundleCandlesRef = useRef<ChartBar[]>([]);
  const marketFocusWindowRef = useRef<MarketDisplayWindowMs | null>(null);
  const marketCoverageWindowRef = useRef<MarketDisplayWindowMs | null>(null);
  const intendedRunMarketViewRef = useRef<RunMarketView | null>(null);
  const lastPanPrefetchLogKeyRef = useRef<string | null>(null);
  const lastPanPrefetchExpansionKeyRef = useRef<string | null>(null);
  const lastVisiblePrefetchSampleRef = useRef<string | null>(null);
  const prevBundleFirstTimeSecRef = useRef<number | null>(null);
  const lastComposeFallbackKeyRef = useRef<string | null>(null);
  const marketComposeSourceRef = useRef<"coverage" | "focus" | null>(null);
  const [marketFocusWindow, setMarketFocusWindow] = useState<MarketDisplayWindowMs | null>(null);
  const [marketCoverageWindow, setMarketCoverageWindow] = useState<MarketDisplayWindowMs | null>(
    null,
  );
  const [auxEmaOverlays, setAuxEmaOverlays] = useState<ChartAuxEmaOverlay[]>([]);
  const phase63DTraceOwnerRef = useRef<Phase63DTraceEventsOwnerState | null>(null);
  if (phase63DTraceOwnerRef.current === null) {
    phase63DTraceOwnerRef.current = createPhase63DTraceEventsOwnerState();
  }
  const phase63DTraceOwner = (): Phase63DTraceEventsOwnerState => phase63DTraceOwnerRef.current!;
  const traceDisplayCache = () => phase63DTraceOwner().traceDisplayController.cache;
  const [displayCacheVersion, setDisplayCacheVersion] = useState(0);
  const [traceSchedulingTick, setTraceSchedulingTick] = useState(0);
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
  const signalTraceStatusRef = useRef<SignalTraceLoadStatus>("idle");
  const signalTraceRef = useRef<SignalTraceBundle | null>(null);
  const signalTraceErrorRef = useRef<string | null>(null);
  const selectedTradeIdRef = useRef<number | string | null>(null);
  const loadedSignalTraceWindowKeyRef = useRef<string | null>(null);
  /** Last HTF aux overlays for current trace coverage; re-sliced when render window moves before trace key catches up. */
  const lastSlicedHtfOverlaysRef = useRef<ChartAuxEmaOverlay[]>([]);
  const applyTraceDisplayRef = useRef<() => void>(() => {});
  const [reloadToken, setReloadToken] = useState(0);
  const prevVariantKeyRef = useRef("");
  const prevRunIdForTradeBootstrapRef = useRef<string | null>(null);
  const selectedVariantKeyRef = useRef("");
  const marketLoadGenRef = useRef(0);
  const intendedRunMarketViewIdentityRef = useRef<RunMarketViewIdentity | null>(null);
  const marketFetchInFlightKeysRef = useRef<Set<string>>(new Set());
  const applyWindowCommitRef = useRef<(commit: WindowCommitResult) => void>(() => {});
  const phase63BRenderWindowOwnerRef = useRef<Phase63BRenderWindowOwnerState | null>(null);
  if (phase63BRenderWindowOwnerRef.current === null) {
    phase63BRenderWindowOwnerRef.current = createPhase63BRenderWindowOwnerState((commit) =>
      applyWindowCommitRef.current(commit),
    );
  }
  const phase63CViewportOwnerRef = useRef<Phase63CViewportOwnerState | null>(null);
  if (phase63CViewportOwnerRef.current === null) {
    phase63CViewportOwnerRef.current = createPhase63CViewportOwnerState(
      phase63BRenderWindowOwnerRef.current!,
    );
  }
  const phase63BRenderWindowOwner = (): Phase63BRenderWindowOwnerState =>
    phase63BRenderWindowOwnerRef.current!;
  const phase63CViewportOwner = (): Phase63CViewportOwnerState => phase63CViewportOwnerRef.current!;
  const v2ChartRuntime = () => phase63BRenderWindowOwner().controller.chartRuntime;
  const v2RenderWindow = () => v2ChartRuntime().renderWindow;
  const [renderWindowRevision, setRenderWindowRevision] = useState(0);
  const [chartViewportCommand, setChartViewportCommand] = useState<ViewportCommand | null>(null);
  const [chartViewportCommandSeq, setChartViewportCommandSeq] = useState(0);
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
      marketReadyTargetKeyRef.current = null;
      setMarketCandlesRevision(0);
      setMarketOverlayRevision(0);
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
    phase63DTraceOwner().traceController.loadGeneration += 1;
    resetTraceCoordinator(phase63DTraceOwner().traceController);
    phase63DTraceOwner().traceController.previousWindowKey = null;
  }, [selectedRunId]);

  useEffect(() => {
    if (reportLoadStatus === "ready" && selectedRunId !== null) {
      dbgMarkCutover(DBG.load.reportReady, "market", { runId: selectedRunId });
    }
  }, [reportLoadStatus, selectedRunId]);

  useEffect(() => {
    if (chartHeavyIoEnabled) {
      emitCutoverDomainOwnersSnapshot();
    }
  }, [chartHeavyIoEnabled]);

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

  const expectedRunMarketViewIdentity = useMemo((): RunMarketViewIdentity | null => {
    if (
      reportLoadStatus !== "ready" ||
      report === null ||
      selectedVariant === null ||
      selectedRunId === null ||
      report.run_id !== selectedRunId
    ) {
      return null;
    }
    try {
      return buildRunMarketViewIdentity(
        resolveRunMarketView({
          report,
          chartTimeframe,
          variant: selectedVariant,
          reloadToken,
        }),
      );
    } catch {
      return null;
    }
  }, [reportLoadStatus, report, selectedVariant, selectedRunId, chartTimeframe, reloadToken]);

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

  const bumpMarketCandlesRevision = useCallback(() => {
    setMarketCandlesRevision((revision) => revision + 1);
  }, []);

  const bumpMarketOverlayRevision = useCallback(() => {
    setMarketOverlayRevision((revision) => revision + 1);
  }, []);

  const chartTimeframeMs = useMemo(
    () => resolveChartTimeframeMs(chartTimeframe),
    [chartTimeframe],
  );

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

  useEffect(() => {
    if (intendedRunMarketView === null) {
      setMarketFocusWindow(null);
      setMarketCoverageWindow(null);
      marketReadyTargetKeyRef.current = null;
      lastPanPrefetchExpansionKeyRef.current = null;
      lastPanPrefetchLogKeyRef.current = null;
      lastVisiblePrefetchSampleRef.current = null;
      prevBundleFirstTimeSecRef.current = null;
      lastComposeFallbackKeyRef.current = null;
      return;
    }
    const nextFocus = resolveMarketTargetWindow(
      intendedRunMarketView,
      selectedTradeEntryTimeMs,
    );
    setMarketFocusWindow((previous) => {
      if (
        previous !== null &&
        previous.fromMs === nextFocus.fromMs &&
        previous.toMs === nextFocus.toMs &&
        previous.toOpenTimeMs === nextFocus.toOpenTimeMs
      ) {
        return previous;
      }
      marketReadyTargetKeyRef.current = null;
      lastPanPrefetchExpansionKeyRef.current = null;
      lastPanPrefetchLogKeyRef.current = null;
      lastVisiblePrefetchSampleRef.current = null;
      prevBundleFirstTimeSecRef.current = null;
      lastComposeFallbackKeyRef.current = null;
      return nextFocus;
    });
    setMarketCoverageWindow((previous) => {
      if (
        previous !== null &&
        previous.fromMs === nextFocus.fromMs &&
        previous.toMs === nextFocus.toMs &&
        previous.toOpenTimeMs === nextFocus.toOpenTimeMs
      ) {
        return previous;
      }
      return nextFocus;
    });
  }, [
    intendedRunMarketView,
    intendedRunMarketViewIdentity,
    selectedTradeEntryTimeMs,
    reloadToken,
  ]);

  const marketFocusWindowKey = useMemo(() => {
    if (intendedRunMarketViewIdentity === null || marketFocusWindow === null) {
      return null;
    }
    return buildMarketTargetWindowKey(intendedRunMarketViewIdentity, marketFocusWindow);
  }, [intendedRunMarketViewIdentity, marketFocusWindow]);

  const marketCoverageWindowKey = useMemo(() => {
    if (intendedRunMarketViewIdentity === null || marketCoverageWindow === null) {
      return null;
    }
    return buildMarketTargetWindowKey(intendedRunMarketViewIdentity, marketCoverageWindow);
  }, [intendedRunMarketViewIdentity, marketCoverageWindow]);

  marketFocusWindowRef.current = marketFocusWindow;
  marketCoverageWindowRef.current = marketCoverageWindow;
  intendedRunMarketViewRef.current = intendedRunMarketView;

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
    if (marketFocusWindow === null || marketCoverageWindow === null) {
      return;
    }

    const snapshot: RunReport = report;
    const variant = selectedVariant;
    const abortController = new AbortController();

    let view: RunMarketView;
    try {
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
    const focusWindow = marketFocusWindow;
    const coverageWindow = marketCoverageWindow;
    const focusKey = buildMarketTargetWindowKey(viewIdentity, focusWindow);
    const coverageKey = buildMarketTargetWindowKey(viewIdentity, coverageWindow);
    const loadGen = ++marketLoadGenRef.current;
    intendedRunMarketViewIdentityRef.current = viewIdentity;

    async function loadMarket() {
      setMarketError(null);

      const focusCandlesReady = marketCandlesReadyForTarget(view, focusWindow);
      if (focusCandlesReady) {
        dbgMarkCutover(DBG.load.marketFetchCacheHit, "market", {
          viewIdentity,
          candlesCached: true,
          targetFromMs: coverageWindow.fromMs,
          targetToMs: coverageWindow.toMs,
        });
        if (
          marketLoadGenRef.current !== loadGen &&
          intendedRunMarketViewIdentityRef.current !== viewIdentity
        ) {
          dbgMark(DBG.load.marketFetchStaleResponse, { key: viewIdentity, phase: "cache_hit" });
          return;
        }
        if (marketReadyTargetKeyRef.current !== focusKey) {
          marketReadyTargetKeyRef.current = focusKey;
          setRunMarketViewIdentity(viewIdentity);
          setMarketLoadStatus("ready");
        }
      } else if (marketReadyTargetKeyRef.current === null) {
        setMarketLoadStatus("loading");
      }

      dbgMarkCutover(DBG.load.marketFetchStart, "market", {
        key: coverageKey,
        candlesCached: focusCandlesReady,
        targetFromMs: coverageWindow.fromMs,
        targetToMs: coverageWindow.toMs,
      });

      try {
        const result = await executeMarketWindowLoad({
          view,
          targetWindow: coverageWindow,
          symbol: snapshot.symbol,
          timeframe: chartTimeframe,
          signal: abortController.signal,
          inFlightKeys: marketFetchInFlightKeysRef.current,
          onChunkSeeded: (kind) => {
            if (kind === "candles") {
              bumpMarketCandlesRevision();
              if (
                marketCandlesReadyForTarget(view, focusWindow) &&
                marketReadyTargetKeyRef.current !== focusKey
              ) {
                marketReadyTargetKeyRef.current = focusKey;
                setRunMarketViewIdentity(viewIdentity);
                setMarketLoadStatus("ready");
              }
            } else {
              bumpMarketOverlayRevision();
            }
          },
        });
        dbgMarkCutover(DBG.load.marketFetchEnd, "market", {
          key: coverageKey,
          candlesFetched: result.candlesFetched,
          emaFetched: result.emaFetched,
        });
        const applyToUi =
          marketLoadGenRef.current === loadGen ||
          intendedRunMarketViewIdentityRef.current === viewIdentity;
        if (!applyToUi) {
          dbgMark(DBG.load.marketFetchStaleResponse, {
            key: viewIdentity,
            phase: "network",
          });
          return;
        }
        if (
          marketCandlesReadyForTarget(view, focusWindow) &&
          marketReadyTargetKeyRef.current !== focusKey
        ) {
          marketReadyTargetKeyRef.current = focusKey;
          setRunMarketViewIdentity(viewIdentity);
          setMarketLoadStatus("ready");
        }
      } catch (err) {
        if (isAbortError(err)) {
          dbgMark(DBG.load.marketFetchAbort, {
            key: viewIdentity,
            note: "frontend abort/stale-response protection; backend CPU work may continue",
          });
          return;
        }
        if (
          marketLoadGenRef.current !== loadGen &&
          intendedRunMarketViewIdentityRef.current !== viewIdentity
        ) {
          dbgMark(DBG.load.marketFetchStaleResponse, { key: viewIdentity, phase: "error" });
          return;
        }
        setMarketError(marketErrorMessage(err));
        setRunMarketViewIdentity(null);
        marketReadyTargetKeyRef.current = null;
        setMarketLoadStatus("error");
      }
    }

    void loadMarket();
    return () => {
      abortController.abort();
      marketLoadGenRef.current += 1;
    };
  }, [
    report,
    reportLoadStatus,
    chartTimeframe,
    reloadToken,
    selectedVariantKey,
    chartHeavyIoEnabled,
    marketCoverageWindowKey,
  ]);

  const cachedBundle = useMemo(() => {
    if (
      intendedRunMarketView === null ||
      marketFocusWindow === null ||
      marketCoverageWindow === null ||
      marketLoadStatus === "error"
    ) {
      return undefined;
    }
    if (!marketCandlesReadyForTarget(intendedRunMarketView, marketFocusWindow)) {
      return undefined;
    }
    const composed = composeDisplayMarketWindowBundle(
      intendedRunMarketView,
      marketFocusWindow,
      marketCoverageWindow,
    );
    marketComposeSourceRef.current = composed?.source ?? null;
    return composed?.bundle;
  }, [
    intendedRunMarketView,
    intendedRunMarketViewIdentity,
    runMarketViewIdentity,
    marketCandlesRevision,
    marketOverlayRevision,
    marketLoadStatus,
    marketFocusWindowKey,
    marketCoverageWindowKey,
  ]);

  const renderWindowFoundationKey = useMemo(() => {
    if (
      intendedRunMarketView === null ||
      marketFocusWindow === null ||
      marketLoadStatus !== "ready" ||
      marketFocusWindowKey === null
    ) {
      return null;
    }
    const candles = getCandles(
      intendedRunMarketView.candlesKey,
      marketFocusWindow.fromMs,
      marketFocusWindow.toMs,
    );
    if (candles === undefined || candles.length === 0) {
      return null;
    }
    return `${marketFocusWindowKey}:${candles.length}`;
  }, [
    intendedRunMarketView,
    marketFocusWindow,
    marketFocusWindowKey,
    marketLoadStatus,
    marketCandlesRevision,
  ]);

  useEffect(() => {
    if (
      renderWindowFoundationKey === null ||
      intendedRunMarketView === null ||
      marketCoverageWindow === null
    ) {
      return;
    }
    const candles = getCandles(
      intendedRunMarketView.candlesKey,
      marketCoverageWindow.fromMs,
      marketCoverageWindow.toMs,
    );
    if (candles !== undefined) {
      cachedBundleCandlesRef.current = candles;
    }
  }, [renderWindowFoundationKey, intendedRunMarketView, marketCoverageWindow, marketCandlesRevision]);

  useEffect(() => {
    if (
      marketComposeSourceRef.current === "focus" &&
      marketFocusWindow !== null &&
      marketCoverageWindow !== null &&
      marketCoverageWindowKey !== null &&
      marketFocusWindowKey !== null &&
      marketCoverageWindowKey !== marketFocusWindowKey
    ) {
      const fallbackKey = `${marketCoverageWindowKey}:${marketCandlesRevision}`;
      if (fallbackKey !== lastComposeFallbackKeyRef.current) {
        lastComposeFallbackKeyRef.current = fallbackKey;
        dbgMark(DBG.market.composeFocusFallback, {
          focusFromMs: marketFocusWindow.fromMs,
          focusToMs: marketFocusWindow.toMs,
          coverageFromMs: marketCoverageWindow.fromMs,
          coverageToMs: marketCoverageWindow.toMs,
        });
      }
    } else if (marketComposeSourceRef.current === "coverage") {
      lastComposeFallbackKeyRef.current = null;
    }
  }, [
    marketFocusWindow,
    marketCoverageWindow,
    marketFocusWindowKey,
    marketCoverageWindowKey,
    marketCandlesRevision,
    cachedBundle,
  ]);

  useEffect(() => {
    if (marketLoadStatus === "ready" && cachedBundle !== undefined) {
      dbgMarkCutover(DBG.load.marketBundleReady, "market", { barCount: cachedBundle.candles.length });
    }
  }, [marketLoadStatus, cachedBundle]);

  const bumpRenderWindow = useCallback(() => {
    setRenderWindowRevision((r) => r + 1);
  }, []);

  useEffect(() => {
    if (
      intendedRunMarketView === null ||
      cachedBundle === undefined ||
      cachedBundle.candles.length === 0
    ) {
      return;
    }
    const firstTimeSec = cachedBundle.candles[0]!.time;
    const prevFirstTimeSec = prevBundleFirstTimeSecRef.current;
    if (prevFirstTimeSec !== null && firstTimeSec < prevFirstTimeSec) {
      const changed = runPhase63BOffsetPrepend(phase63BRenderWindowOwner(), {
        bundleCandles: cachedBundle.candles,
        previousFirstTimeSec: prevFirstTimeSec,
      });
      if (changed) {
        bumpRenderWindow();
      }
    }
    prevBundleFirstTimeSecRef.current = firstTimeSec;
  }, [marketCandlesRevision, cachedBundle, intendedRunMarketView, bumpRenderWindow]);

  const emitChartViewportCommand = useCallback((command: ViewportCommand) => {
    setChartViewportCommand(command);
    setChartViewportCommandSeq(phase63CViewportOwner().viewportState.commandSeq);
  }, []);

  const acknowledgeChartViewportCommand = useCallback(() => {
    runPhase63CAcknowledgeViewportCommand(phase63CViewportOwner());
    setChartViewportCommand(null);
  }, []);

  const applyRenderWindowForTrade = useCallback(
    (entryTimeMs: number | null, forceRebuild: boolean) => {
      const bundleCandles = cachedBundleCandlesRef.current;
      if (bundleCandles.length === 0) {
        return false;
      }
      const changed = runPhase63BApplyTrade(phase63BRenderWindowOwner(), {
        bundleCandles,
        selectedTradeEntryTimeMs: entryTimeMs,
        forceRebuild,
      });
      if (changed) {
        bumpRenderWindow();
      }
      return changed;
    },
    [bumpRenderWindow],
  );

  useEffect(() => {
    if (marketLoadStatus === "error" || renderWindowFoundationKey === null) {
      if (marketLoadStatus === "error") {
        v2ChartRuntime().reset();
        bumpRenderWindow();
      }
      runPhase63BRenderWindowInit(phase63BRenderWindowOwner(), {
        foundationKey: renderWindowFoundationKey,
        marketLoadStatus,
        bundleCandles: cachedBundleCandlesRef.current,
        selectedTradeEntryTimeMs: null,
        variantKey: selectedVariantKey,
      });
      return;
    }
    if (intendedRunMarketView === null || marketFocusWindow === null) {
      return;
    }
    const bundleCandles =
      getCandles(
        intendedRunMarketView.candlesKey,
        marketFocusWindow.fromMs,
        marketFocusWindow.toMs,
      ) ?? cachedBundleCandlesRef.current;
    if (bundleCandles.length === 0) {
      return;
    }
    cachedBundleCandlesRef.current = bundleCandles;
    const initialized = runPhase63BRenderWindowInit(phase63BRenderWindowOwner(), {
      foundationKey: renderWindowFoundationKey,
      marketLoadStatus,
      bundleCandles,
      selectedTradeEntryTimeMs: selectedTradeEntryTimeMs,
      variantKey: selectedVariantKey,
    });
    if (initialized) {
      bumpRenderWindow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- trade changes handled by dedicated effect
  }, [
    renderWindowFoundationKey,
    marketLoadStatus,
    selectedRunId,
    selectedVariantKey,
    runMarketViewIdentity,
    bumpRenderWindow,
    intendedRunMarketView,
    marketFocusWindow,
  ]);

  useEffect(() => {
    if (renderWindowFoundationKey === null || marketLoadStatus === "error") {
      return;
    }
    applyRenderWindowForTrade(selectedTradeEntryTimeMs, false);
  }, [selectedTradeEntryTimeMs, renderWindowFoundationKey, marketLoadStatus, applyRenderWindowForTrade]);

  const isWindowSwapTransactionCancelled = useCallback((swapTransactionId: number) => {
    return runPhase63CIsWindowSwapTransactionCancelled(phase63CViewportOwner(), swapTransactionId);
  }, []);

  const settleWindowSwapCommit = useCallback((shiftSeq: number, swapTransactionId: number) => {
    runPhase63CSettleWindowSwapCommit(
      phase63CViewportOwner(),
      phase63BRenderWindowOwner(),
      shiftSeq,
      swapTransactionId,
    );
    dbgMark(DBG.renderWindow.shiftSettled, { shiftSeq, swapTransactionId });
  }, []);

  const attemptMarketPanPrefetch = useCallback(
    (visibleFromSec: number, visibleToSec: number, forceUserPan = false) => {
      const view = intendedRunMarketViewRef.current;
      const coverageWindow = marketCoverageWindowRef.current;
      if (view === null || coverageWindow === null || !chartHeavyIoEnabled) {
        return;
      }
      const interactionState = v2RenderWindow().getInteractionState();
      const isUserPan =
        forceUserPan ||
        interactionState === "user_panning" ||
        interactionState === "pending_shift" ||
        interactionState === "applying_shift";
      const decision = evaluateMarketPanPrefetchExpansion({
        targetWindow: coverageWindow,
        visibleFromSec,
        visibleToSec,
        reportFromMs: view.fromOpenTimeMs,
        reportToMs: view.toOpenTimeMs,
        timeframeMs: chartTimeframeMs,
        isUserPan,
      });
      const logKey = `${decision.reason}:${decision.meta.expanded_from_ms ?? "x"}:${decision.meta.expanded_to_ms ?? "x"}`;
      if (logKey !== lastPanPrefetchLogKeyRef.current) {
        lastPanPrefetchLogKeyRef.current = logKey;
        dbgMarkCutover(DBG.market.panPrefetchDecision, "market", {
          reason: decision.reason,
          ...decision.meta,
        });
      }
      if (decision.expanded === null) {
        return;
      }
      const expansionKey = `${decision.expanded.fromMs}:${decision.expanded.toMs}:${decision.expanded.toOpenTimeMs}`;
      if (expansionKey === lastPanPrefetchExpansionKeyRef.current) {
        return;
      }
      lastPanPrefetchExpansionKeyRef.current = expansionKey;
      setMarketCoverageWindow((previous) => {
        if (
          previous !== null &&
          previous.fromMs === decision.expanded!.fromMs &&
          previous.toMs === decision.expanded!.toMs &&
          previous.toOpenTimeMs === decision.expanded!.toOpenTimeMs
        ) {
          return previous;
        }
        return decision.expanded!;
      });
    },
    [chartHeavyIoEnabled, chartTimeframeMs],
  );

  const dispatchChartInteraction = useCallback(
    (event: ChartInteractionEvent) => {
      if (event.type === "pointerdown") {
        runPhase63CCancelViewportOnPointerDown(phase63CViewportOwner());
        setChartViewportCommand(null);
      }
      const chartRuntime = v2ChartRuntime();
      chartRuntime.renderWindow.dispatch(event);
      const viewportCommand = runPhase63CDispatchViewportInteraction(
        phase63CViewportOwner(),
        phase63BRenderWindowOwner(),
        event,
      );
      if (event.type === "visible_range_changed" && event.anchorTimeSec !== null) {
        chartRuntime.renderWindow.recordBoundaryIntent(event.visible, event.anchorTimeSec);
        const interactionState = v2RenderWindow().getInteractionState();
        if (
          interactionState === "user_panning" ||
          interactionState === "pending_shift" ||
          interactionState === "applying_shift"
        ) {
          const candles = chartViewCandlesRef.current;
          if (candles.length > 0) {
            const fromIdx = Math.max(
              0,
              Math.min(candles.length - 1, Math.floor(event.visible.from)),
            );
            const toIdx = Math.max(0, Math.min(candles.length - 1, Math.floor(event.visible.to)));
            const sampleKey = `${fromIdx}:${toIdx}:${candles[fromIdx]!.time}:${candles[toIdx]!.time}`;
            if (sampleKey !== lastVisiblePrefetchSampleRef.current) {
              lastVisiblePrefetchSampleRef.current = sampleKey;
              attemptMarketPanPrefetch(candles[fromIdx]!.time, candles[toIdx]!.time);
            }
          }
        }
      }
      if (viewportCommand !== null) {
        emitChartViewportCommand(viewportCommand);
      }
    },
    [emitChartViewportCommand, attemptMarketPanPrefetch],
  );

  const chartWindowSlice = useMemo(
    () =>
      resolvePhase63BChartWindowSlice(phase63BRenderWindowOwner(), {
        bundle: cachedBundle ?? null,
        marketLoadStatus,
        auxEmaOverlays,
        marketIdentity: intendedRunMarketViewIdentity ?? "",
      }),
    [
      cachedBundle,
      marketLoadStatus,
      auxEmaOverlays,
      intendedRunMarketViewIdentity,
      runMarketViewIdentity,
      renderWindowRevision,
    ],
  );

  const chartView = useMemo(
    (): ChartViewWindow =>
      buildChartViewWindowFromPhase63BSlice({
        chartWindow: chartWindowSlice,
        selectedTradeEntryTimeMs,
      }),
    [chartWindowSlice, selectedTradeEntryTimeMs],
  );

  chartViewCandlesRef.current = chartView.candles;

  useEffect(() => {
    runPhase63CSetViewportPlan(
      phase63CViewportOwner(),
      chartView.mode,
      chartView.centerTimeSec,
    );
  }, [chartView.mode, chartView.centerTimeSec]);

  useEffect(() => {
    intendedRunMarketViewIdentityRef.current = intendedRunMarketViewIdentity;
  }, [intendedRunMarketViewIdentity]);

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
      applyRenderWindowShiftCommit(phase63BRenderWindowOwner().controller, commit);
      dbgMarkCutover(DBG.renderWindow.shiftApplied, "render_window", {
        windowStartIndex: commit.bounds.windowStartIndex,
        windowEndIndex: commit.bounds.windowEndIndex,
      });
      renderWindowShiftSeqRef.current = commit.shiftSeq;
      setRenderWindowShiftSeq(commit.shiftSeq);

      const viewportCmd = runPhase63COnWindowSwapCommitted(
        phase63CViewportOwner(),
        phase63BRenderWindowOwner(),
        {
          commit,
          bundleCandleCount: cachedBundle.candles.length,
        },
      );
      if (viewportCmd !== null) {
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

      if (slice.length > 0) {
        attemptMarketPanPrefetch(slice[0]!.time, slice[slice.length - 1]!.time, true);
      }
    },
    [
      cachedBundle,
      bumpRenderWindow,
      selectedRunId,
      selectedVariantKey,
      effectiveContextOverlayRef,
      emitChartViewportCommand,
      attemptMarketPanPrefetch,
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
    const traceViewportCmd = runPhase63COnTraceReady(
      phase63CViewportOwner(),
      phase63BRenderWindowOwner(),
    );
    if (traceViewportCmd !== null) {
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
    const selectedTradeIdSnapshot = selectedTradeIdRef.current;
    const selectedTradeEntryTimeSec =
      selectedTradeIdSnapshot !== null && selectedVariant
        ? (() => {
            const trade = findTradeById(selectedVariant.trade_records, selectedTradeIdSnapshot);
            const entryMs = trade ? resolveTradeEntryTimeMs(trade) : null;
            return entryMs !== null ? Math.floor(entryMs / 1000) : null;
          })()
        : null;

    const applyResult = runPhase63DApplyTraceDisplayForWindow(phase63DTraceOwner(), {
      candles,
      traceLoadStatus: signalTraceStatusRef.current,
      selectedTradeId: selectedTradeIdSnapshot,
      selectedTradeEntryTimeSec,
      selectedTradeEntryMarkerInView:
        selectedVariant !== null && selectedTradeIdSnapshot !== null
          ? selectedTradeEntryMarkerInView(
              selectedVariant.trade_records,
              selectedTradeIdSnapshot,
              candles,
            )
          : false,
    });

    setTraceDisplayState(applyResult.state);
    chartDisplayComponentEventsRef.current = applyResult.componentEvents;
    setChartDisplayComponentEvents(applyResult.componentEvents);
    setDisplayApplyRevision(applyResult.displayApplyRevision);

    if (applyResult.htfSlice.times.length > 0) {
      applyHtfOverlaysFromDisplaySlice(applyResult.htfSlice);
    }
  }, [applyHtfOverlaysFromDisplaySlice, selectedVariant]);

  applyTraceDisplayRef.current = applyTraceDisplayForCurrentWindow;

  useEffect(() => {
    chartDisplayComponentEventsRef.current = chartDisplayComponentEvents;
  }, [chartDisplayComponentEvents]);

  useEffect(() => {
    signalTraceStatusRef.current = signalTraceStatus;
  }, [signalTraceStatus]);

  useEffect(() => {
    signalTraceRef.current = signalTrace;
  }, [signalTrace]);

  useEffect(() => {
    signalTraceErrorRef.current = signalTraceError;
  }, [signalTraceError]);

  useEffect(() => {
    selectedTradeIdRef.current = selectedTradeId;
  }, [selectedTradeId]);

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

    const htfSlice = traceDisplayCache().sliceHtfContextForWindow(
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
    resetPhase63DTraceDisplayCache(phase63DTraceOwner(), traceDisplayCacheKey);
    lastSlicedHtfOverlaysRef.current = [];
    chartDisplayComponentEventsRef.current = [];
    setChartDisplayComponentEvents([]);
    setTraceDisplayState(EMPTY_TRACE_DISPLAY_STATE);
    setDisplayCacheVersion((version) => version + 1);
  }, [traceDisplayCacheKey, reloadToken]);

  useEffect(() => {
    registerTraceDisplayCacheInvalidatorForTests(() => {
      if (traceDisplayCacheKey === null) {
        return;
      }
      resetPhase63DTraceDisplayCache(phase63DTraceOwner(), traceDisplayCacheKey);
      setDisplayCacheVersion((version) => version + 1);
      setTraceSchedulingTick((tick) => tick + 1);
    });
    return () => {
      registerTraceDisplayCacheInvalidatorForTests(null);
    };
  }, [traceDisplayCacheKey]);

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
    resetPhase63DTraceSessionCache(phase63DTraceOwner(), sessionCacheIdentity);
  }, [sessionCacheIdentity]);

  useEffect(() => {
    const caches = phase63BRenderWindowOwnerRef.current?.stabilizeCaches;
    if (caches) {
      caches.candles.current = { key: "", value: [] };
      caches.ema.current = { key: "", value: [] };
      caches.aux.current = { key: "", value: [] };
    }
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
    return traceDisplayCache().coversRange(
      renderWindowBounds.fromSec,
      renderWindowBounds.toSec,
    );
  }, [renderWindowBounds, displayCacheVersion]);

  const displayCacheHasWindowData = useMemo(() => {
    if (renderWindowBounds === null) {
      return false;
    }
    const { fromSec, toSec } = renderWindowBounds;
    const cache = traceDisplayCache();
    const eventCount = dbgTimedSyncCutover(
      DBG.traceDisplay.sliceEvents,
      "trace",
      () => cache.sliceEventsForWindow(fromSec, toSec).length,
      () => ({ fromSec, toSec }),
    );
    const htfTimes = dbgTimedSyncCutover(
      DBG.traceDisplay.sliceHtf,
      "aux_overlay",
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

  const phase63AModelSlice = useMemo(
    () =>
      resolvePhase63AModelRuntimeSlice({
        chartView,
        chartDisplayAuxEmaOverlays,
        chartDisplayComponentEvents,
        htfAuxEmaOverlayStale,
        componentEventsStale,
        traceDisplayState,
      }),
    [
      chartView,
      chartDisplayAuxEmaOverlays,
      chartDisplayComponentEvents,
      htfAuxEmaOverlayStale,
      componentEventsStale,
      traceDisplayState,
    ],
  );

  const modelDomainFields = useMemo(
    () => derivePhase63AModelDomainFieldsFromRuntime(phase63AModelSlice),
    [phase63AModelSlice],
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
        const command = runPhase63CSelectTradeFocusCommand(
          phase63CViewportOwner(),
          phase63BRenderWindowOwner(),
          entryTimeSec,
        );
        if (command !== null) {
          emitChartViewportCommand(command);
        }
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
    const owner = phase63DTraceOwner();

    if (!chartHeavyIoEnabled) {
      dbgMark(DBG.load.chartHeavyIoBlocked, {
        source: "signal_trace",
      });
      resetTraceCoordinator(owner.traceController);
      owner.traceController.previousWindowKey = null;
      setSignalTrace(null);
      setSignalTraceStatus("idle");
      setLoadedSignalTraceWindowKey(null);
      setSignalTraceError(null);
      signalTraceStatusRef.current = "idle";
      signalTraceRef.current = null;
      signalTraceErrorRef.current = null;
      loadedSignalTraceWindowKeyRef.current = null;
      return;
    }

    if (renderWindowBounds !== null) {
      logPhase63DTraceCoverage(owner, renderWindowBounds);
    }

    const bootstrapPreview = evaluateSignalTraceBootstrap({
      report,
      reportLoadStatus,
      selectedRunId,
      selectedVariantKey: selectedVariantKey || null,
      marketLoadStatus,
      runMarketViewIdentity,
      expectedRunMarketViewIdentity,
      chartWindowKey,
      candles: chartView.candles,
      renderWindowBounds,
      previousWindowKey: owner.traceController.previousWindowKey,
    });
    const fetchSource = bootstrapPreview.ready ? bootstrapPreview.fetchSource : undefined;

    const abortController = new AbortController();
    let cancelled = false;

    void (async () => {
      const result = await runPhase63DTraceLoadCycle(owner, {
        chartHeavyIoEnabled,
        reportLoadStatus,
        report,
        selectedRunId: selectedRunId ?? "",
        selectedVariantKey: selectedVariantKey || "",
        marketLoadStatus,
        runMarketViewIdentity,
        expectedRunMarketViewIdentity,
        effectiveContextOverlayRef,
        chartTimeframe,
        chartWindowKey,
        candles: chartView.candles,
        renderWindowBounds,
        interactionState: v2RenderWindow().getInteractionState(),
        hasPendingShift: v2RenderWindow().getPendingShift() !== null,
        coalescedWindowKey: takeCommittedTraceFetchIntent(),
        signal: abortController.signal,
        telemetryMeta: {
          renderWindowRevision,
          boundsKey: renderWindowBoundsKey,
          fetchSource,
        },
      });

      if (cancelled) {
        return;
      }

      const snapshot = resolvePhase63DLanesSnapshot(owner);
      setSignalTrace(snapshot.signalTrace);
      setSignalTraceStatus(snapshot.signalTraceStatus);
      setSignalTraceError(snapshot.signalTraceError);
      setLoadedSignalTraceWindowKey(snapshot.loadedSignalTraceWindowKey);
      signalTraceStatusRef.current = snapshot.signalTraceStatus;
      signalTraceRef.current = snapshot.signalTrace;
      signalTraceErrorRef.current = snapshot.signalTraceError;
      loadedSignalTraceWindowKeyRef.current = snapshot.loadedSignalTraceWindowKey;

      if (result.outcome === "fetch_superseded") {
        dbgMark(DBG.traceDisplay.fetchSuperseded, {
          windowKey: chartWindowKey,
        });
        return;
      }

      if (result.outcome === "bootstrap_blocked") {
        return;
      }

      if (
        result.displayLoadOutcome === "committed" ||
        result.outcome === "session_restored"
      ) {
        setDisplayCacheVersion((version) => version + 1);
      }

      if (shouldPhase63DFinalizeTraceDisplay(result.outcome)) {
        finalizeTraceDisplayUpdate();
      }

      if (
        result.outcome === "completed" ||
        result.outcome === "display_committed" ||
        result.outcome === "session_restored"
      ) {
        flushLanesLoadDebug();
      }
    })();

    return () => {
      cancelled = true;
      abortController.abort();
      owner.traceController.loadGeneration += 1;
    };
  }, [
    reportLoadStatus,
    report,
    selectedRunId,
    selectedVariantKey,
    chartWindowKey,
    renderWindowRevision,
    renderWindowBoundsKey,
    marketLoadStatus,
    runMarketViewIdentity,
    expectedRunMarketViewIdentity,
    effectiveContextOverlayRef,
    finalizeTraceDisplayUpdate,
    chartHeavyIoEnabled,
    chartTimeframe,
    traceSchedulingTick,
    chartView.candles,
    renderWindowBounds,
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
      chartViewModel: modelDomainFields.chartViewModel,
      chartCandles: modelDomainFields.chartCandles,
      chartEmaOverlays: modelDomainFields.chartEmaOverlays,
      chartAuxEmaOverlays: modelDomainFields.chartAuxEmaOverlays,
      chartDisplayAuxEmaOverlays: modelDomainFields.chartDisplayAuxEmaOverlays,
      htfAuxEmaOverlayStale: modelDomainFields.htfAuxEmaOverlayStale,
      chartDisplayComponentEvents: modelDomainFields.chartDisplayComponentEvents,
      componentEventsStale: modelDomainFields.componentEventsStale,
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
      chartViewMode: modelDomainFields.chartViewMode,
      chartViewCenterTimeSec: modelDomainFields.chartViewCenterTimeSec,
      chartViewFirstTimeSec: modelDomainFields.chartViewFirstTimeSec,
      chartViewLastTimeSec: modelDomainFields.chartViewLastTimeSec,
      chartViewCount: modelDomainFields.chartViewCount,
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
      modelDomainFields,
      displayApplyRevision,
      renderWindowShiftSeq,
      chartShowEntryBlockMarkers,
      chartShowExitSignalMarkers,
      chartShowSetupMarkers,
      chartShowTradeManagementPhaseMarkers,
      chartShowTradeManagementExitMarkers,
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

let traceDisplayCacheInvalidatorForTests: (() => void) | null = null;

function registerTraceDisplayCacheInvalidatorForTests(fn: (() => void) | null): void {
  traceDisplayCacheInvalidatorForTests = fn;
}

/** Vitest-only: invalidate display cache coverage without report reload (preserves lanes state). */
export function invalidateTraceDisplayCacheForTests(): void {
  traceDisplayCacheInvalidatorForTests?.();
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
