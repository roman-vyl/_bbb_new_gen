import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";

import type { ChartAuxEmaOverlay, ChartBar, ChartMarketBundle } from "@/api/types";
import { getCandles } from "@/features/chart/marketResourceCache";
import {
  buildChartViewWindowFromPhase63BSlice,
  createPhase63BRenderWindowOwnerState,
  resolvePhase63BChartWindowSlice,
  runPhase63BApplyTrade,
  runPhase63BOffsetPrepend,
  runPhase63BRenderWindowInit,
  type Phase63BRenderWindowOwnerState,
} from "@/features/workbenchChartRuntime/phase63BRenderWindowBridge";
import {
  createPhase63CViewportOwnerState,
  runPhase63CAcknowledgeViewportCommand,
  runPhase63CCancelViewportOnPointerDown,
  runPhase63CDispatchViewportInteraction,
  runPhase63CIsWindowSwapTransactionCancelled,
  runPhase63COnWindowSwapCommitted,
  runPhase63CForceTradeFocusCommand,
  runPhase63CSelectTradeFocusCommand,
  runPhase63CSettleWindowSwapCommit,
  runPhase63CSetViewportPlan,
  type Phase63CViewportOwnerState,
} from "@/features/workbenchChartRuntime/phase63CViewportCommandBridge";
import { applyRenderWindowShiftCommit } from "@/features/workbenchChartRuntime/renderWindowRuntime";
import {
  evaluateTradeFocusReadiness,
  shouldEmitTradeFocus,
  tradeFocusEmitKey,
  type TradeFocusEmitKey,
} from "@/features/workbenchChartRuntime/phase63TradeFocusBridge";
import type { ChartWindowRuntimeBoundary } from "@/features/workbenchChartRuntime/chartWindowRuntime";
import type { RuntimeLoadStatus } from "@/features/workbenchChartRuntime/runtimeTypes";
import { candleTimeBounds } from "@/features/chart/chartRenderWindowDisplay";
import type { ChartViewWindow } from "@/features/chart/chartViewWindow";
import type { RunMarketView } from "@/features/chart/runMarketView";
import type { MarketDisplayWindowMs } from "@/features/chart/workbenchMarketLoad";
import type { WindowCommitResult } from "@/features/chart/runtime/types";
import type { ChartInteractionEvent, ViewportCommand } from "@/features/chart/runtime/types";
import {
  dbgMark,
  dbgScheduleShiftFlush,
  PIPELINE_DEBUG_STEPS as DBG,
} from "@/shared/diagnostics/pipelineDebug";
import { dbgMarkCutover } from "@/features/workbenchChartRuntime/chartRuntimeCutoverTelemetry";

export type WorkbenchRenderViewportInputs = {
  cachedBundle: ChartMarketBundle | undefined;
  cachedBundleCandlesRef: MutableRefObject<ChartBar[]>;
  marketLoadStatus: RuntimeLoadStatus;
  marketCandlesRevision: number;
  marketLoadDeliveryTick: number;
  renderWindowFoundationKey: string | null;
  intendedRunMarketView: RunMarketView | null;
  marketFocusWindow: MarketDisplayWindowMs | null;
  marketCoverageWindow: MarketDisplayWindowMs | null;
  selectedRunId: string | null;
  selectedVariantKey: string;
  selectedTradeEntryTimeMs: number | null;
  selectedTradeId: string | number | null;
  chartHeavyIoEnabled: boolean;
  auxEmaOverlays: readonly ChartAuxEmaOverlay[];
  auxOverlayRevision: number;
  marketOverlayRevision: number;
  intendedRunMarketViewIdentity: string | null;
  runMarketViewIdentity: string | null;
  getPrevBundleFirstTimeSec: () => number | null;
  setPrevBundleFirstTimeSec: (value: number | null) => void;
};

export type WorkbenchRenderViewportCallbacks = {
  onWindowCommit: (commit: WindowCommitResult, slice: ChartBar[]) => void;
  onPanPrefetch: (
    visibleFromSec: number,
    visibleToSec: number,
    isUserPan: boolean,
    visibleSample?: string,
  ) => void;
  shouldPanPrefetchForSample: (sampleKey: string) => boolean;
};

export type WorkbenchRenderViewportState = {
  chartView: ChartViewWindow;
  chartWindowSlice: ChartWindowRuntimeBoundary;
  renderWindowBounds: { fromSec: number; toSec: number } | null;
  windowSnapshotRevision: number;
  windowShiftSeq: number;
  chartViewportCommand: ViewportCommand | null;
  chartViewportCommandSeq: number;
  acknowledgeChartViewportCommand: () => void;
  isWindowSwapTransactionCancelled: (swapTransactionId: number) => boolean;
  settleWindowSwapCommit: (shiftSeq: number, swapTransactionId: number) => void;
  dispatchChartInteraction: (event: ChartInteractionEvent) => void;
  emitTradeFocusCommand: (entryTimeSec: number) => void;
  emitViewportCommand: (command: ViewportCommand) => void;
  onTraceReadyViewport: () => ViewportCommand | null;
  getInteractionState: () => ReturnType<
    Phase63BRenderWindowOwnerState["controller"]["chartRuntime"]["renderWindow"]["getInteractionState"]
  >;
  hasPendingShift: () => boolean;
};

const WorkbenchRenderViewportContext = createContext<WorkbenchRenderViewportState | null>(null);

const EMPTY_CHART_VIEW: ChartViewWindow = {
  mode: "empty",
  candles: [],
  emaOverlays: [],
  auxEmaOverlays: [],
  centerTimeSec: null,
  firstTimeSec: null,
  lastTimeSec: null,
  count: 0,
};

export function WorkbenchRenderViewportProvider({
  children,
  inputs,
  callbacks,
}: {
  children: ReactNode;
  inputs: WorkbenchRenderViewportInputs;
  callbacks: WorkbenchRenderViewportCallbacks;
}) {
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

  const [renderWindowSnapshotVersion, setRenderWindowSnapshotVersion] = useState(0);
  const [chartViewportCommand, setChartViewportCommand] = useState<ViewportCommand | null>(null);
  const [chartViewportCommandSeq, setChartViewportCommandSeq] = useState(0);
  const chartViewCandlesRef = useRef<ChartBar[]>([]);
  const chartViewportEmitSeqRef = useRef(0);
  const tradeFocusRequestSeqRef = useRef(0);
  const tradeFocusAppliedRequestSeqRef = useRef(0);
  const lastTradeFocusEmitRef = useRef<TradeFocusEmitKey | null>(null);
  const tradeFocusSuppressedByUserPanRef = useRef(false);
  const prevSelectedTradeKeyRef = useRef<string | null>(null);

  const bumpRenderWindowSnapshot = useCallback(() => {
    setRenderWindowSnapshotVersion((version) => version + 1);
  }, []);

  const {
    cachedBundle,
    cachedBundleCandlesRef,
    marketLoadStatus,
    marketCandlesRevision,
    marketLoadDeliveryTick,
    renderWindowFoundationKey,
    intendedRunMarketView,
    marketFocusWindow,
    selectedVariantKey,
    selectedTradeEntryTimeMs,
    selectedTradeId,
    auxEmaOverlays,
    auxOverlayRevision,
    marketOverlayRevision,
    intendedRunMarketViewIdentity,
    runMarketViewIdentity,
    getPrevBundleFirstTimeSec,
    setPrevBundleFirstTimeSec,
  } = inputs;

  const { onWindowCommit, onPanPrefetch, shouldPanPrefetchForSample } = callbacks;

  useEffect(() => {
    if (
      intendedRunMarketView === null ||
      cachedBundle === undefined ||
      cachedBundle.candles.length === 0
    ) {
      return;
    }
    const firstTimeSec = cachedBundle.candles[0]!.time;
    const prevFirstTimeSec = getPrevBundleFirstTimeSec();
    if (prevFirstTimeSec !== null && firstTimeSec < prevFirstTimeSec) {
      const changed = runPhase63BOffsetPrepend(phase63BRenderWindowOwner(), {
        bundleCandles: cachedBundle.candles,
        previousFirstTimeSec: prevFirstTimeSec,
      });
      if (changed) {
        bumpRenderWindowSnapshot();
      }
    }
    setPrevBundleFirstTimeSec(firstTimeSec);
  }, [
    marketCandlesRevision,
    cachedBundle,
    intendedRunMarketView,
    bumpRenderWindowSnapshot,
    getPrevBundleFirstTimeSec,
    setPrevBundleFirstTimeSec,
  ]);

  const emitChartViewportCommand = useCallback((command: ViewportCommand) => {
    chartViewportEmitSeqRef.current += 1;
    setChartViewportCommand(command);
    setChartViewportCommandSeq(chartViewportEmitSeqRef.current);
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
        bumpRenderWindowSnapshot();
      }
      return changed;
    },
    [bumpRenderWindowSnapshot, cachedBundleCandlesRef],
  );

  useEffect(() => {
    if (renderWindowFoundationKey === null) {
      if (marketLoadStatus === "loading") {
        return;
      }
      if (marketLoadStatus === "error") {
        v2ChartRuntime().reset();
        bumpRenderWindowSnapshot();
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
    if (marketLoadStatus === "error") {
      v2ChartRuntime().reset();
      bumpRenderWindowSnapshot();
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
    const bundleCandles = getCandles(
      intendedRunMarketView.candlesKey,
      marketFocusWindow.fromMs,
      marketFocusWindow.toMs,
    );
    if (bundleCandles === undefined || bundleCandles.length === 0) {
      return;
    }
    cachedBundleCandlesRef.current = bundleCandles;
    const initialized = runPhase63BRenderWindowInit(phase63BRenderWindowOwner(), {
      foundationKey: renderWindowFoundationKey,
      marketLoadStatus,
      bundleCandles,
      selectedTradeEntryTimeMs,
      variantKey: selectedVariantKey,
    });
    if (initialized) {
      bumpRenderWindowSnapshot();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- trade changes handled by dedicated effect
  }, [
    renderWindowFoundationKey,
    marketLoadStatus,
    inputs.selectedRunId,
    selectedVariantKey,
    runMarketViewIdentity,
    bumpRenderWindowSnapshot,
    intendedRunMarketView,
    marketFocusWindow,
    cachedBundleCandlesRef,
  ]);

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

  const dispatchChartInteraction = useCallback(
    (event: ChartInteractionEvent) => {
      const interactionStateBeforeDispatch =
        event.type === "visible_range_changed"
          ? v2RenderWindow().getInteractionState()
          : null;

      if (event.type === "pointerdown" || event.type === "keyboard_pan_start") {
        tradeFocusSuppressedByUserPanRef.current = true;
        dbgMark(DBG.tradeFocus.cancelled, {
          reason: "user_pan",
          trigger: event.type,
          requestSeq: tradeFocusRequestSeqRef.current,
        });
        runPhase63CCancelViewportOnPointerDown(phase63CViewportOwner(), {
          trigger: event.type,
        });
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
        const boundaryRecorded = chartRuntime.renderWindow.recordBoundaryIntent(
          event.visible,
          event.anchorTimeSec,
        );
        const interactionStateAfterDispatch = v2RenderWindow().getInteractionState();
        const prefetchGateEntered =
          interactionStateAfterDispatch === "user_panning" ||
          interactionStateAfterDispatch === "pending_shift" ||
          interactionStateAfterDispatch === "applying_shift";

        let fromIdx: number | null = null;
        let toIdx: number | null = null;
        let sampleKey: string | null = null;
        let prefetchCalled = false;
        let prefetchSkippedReason: string | null = null;

        if (prefetchGateEntered) {
          const candles = chartViewCandlesRef.current;
          if (candles.length === 0) {
            prefetchSkippedReason = "no_candles";
          } else {
            fromIdx = Math.max(
              0,
              Math.min(candles.length - 1, Math.floor(event.visible.from)),
            );
            toIdx = Math.max(0, Math.min(candles.length - 1, Math.floor(event.visible.to)));
            sampleKey = `${fromIdx}:${toIdx}:${candles[fromIdx]!.time}:${candles[toIdx]!.time}`;
            if (shouldPanPrefetchForSample(sampleKey)) {
              onPanPrefetch(candles[fromIdx]!.time, candles[toIdx]!.time, true, sampleKey);
              prefetchCalled = true;
            } else {
              prefetchSkippedReason = "sample_deduped";
            }
          }
        } else {
          prefetchSkippedReason = "interaction_state_gate";
        }

        dbgMark(DBG.keyboard.visibleRangeDispatch, {
          eventType: event.type,
          interactionStateBeforeDispatch,
          interactionStateAfterDispatch,
          recordBoundaryIntent: boundaryRecorded,
          visibleFrom: event.visible.from,
          visibleTo: event.visible.to,
          anchorTimeSec: event.anchorTimeSec,
          fromIdx,
          toIdx,
          sampleKey,
          prefetchGateEntered,
          prefetchCalled,
          prefetchSkippedReason,
          chartViewCandleCount: chartViewCandlesRef.current.length,
        });
      }
      if (viewportCommand !== null) {
        emitChartViewportCommand(viewportCommand);
      }
    },
    [emitChartViewportCommand, onPanPrefetch, shouldPanPrefetchForSample],
  );

  const renderWindowRevision = phase63BRenderWindowOwner().controller.revision;
  const renderWindowShiftSeq = phase63BRenderWindowOwner().controller.shiftSeq;

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
      marketOverlayRevision,
      marketCandlesRevision,
      auxOverlayRevision,
      intendedRunMarketViewIdentity,
      runMarketViewIdentity,
      renderWindowSnapshotVersion,
      auxEmaOverlays,
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

  chartViewCandlesRef.current = chartView.candles.length > 0 ? chartView.candles : EMPTY_CHART_VIEW.candles;

  useEffect(() => {
    runPhase63CSetViewportPlan(
      phase63CViewportOwner(),
      chartView.mode,
      chartView.centerTimeSec,
    );
  }, [chartView.mode, chartView.centerTimeSec]);

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

      onWindowCommit(commit, slice);

      bumpRenderWindowSnapshot();
      dbgScheduleShiftFlush();

      if (slice.length > 0) {
        onPanPrefetch(slice[0]!.time, slice[slice.length - 1]!.time, true);
      }
    },
    [cachedBundle, bumpRenderWindowSnapshot, emitChartViewportCommand, onWindowCommit, onPanPrefetch],
  );

  useEffect(() => {
    applyWindowCommitRef.current = applyWindowCommit;
  }, [applyWindowCommit]);

  const emitTradeFocusCommand = useCallback(
    (entryTimeSec: number, emitSource: "orchestrator" | "trace_ready" = "orchestrator"): boolean => {
      if (chartView.count === 0) {
        dbgMark(DBG.tradeFocus.emptyPrevented, {
          entryTimeSec,
          emitSource,
          chartViewCount: chartView.count,
        });
        return false;
      }
      runPhase63CAcknowledgeViewportCommand(phase63CViewportOwner());
      const command = runPhase63CForceTradeFocusCommand(
        phase63CViewportOwner(),
        phase63BRenderWindowOwner(),
        entryTimeSec,
        { selectedTradeId, emitSource },
      );
      dbgMark(DBG.tradeFocus.applied, {
        entryTimeSec,
        emitSource,
        selectedTradeId,
        foundationKey: renderWindowFoundationKey,
      });
      emitChartViewportCommand(command);
      return true;
    },
    [
      emitChartViewportCommand,
      selectedTradeId,
      chartView.count,
      renderWindowFoundationKey,
    ],
  );

  const tryEmitTradeFocusWhenReady = useCallback(
    (emitSource: "orchestrator" | "trace_ready"): ViewportCommand | null => {
      let readiness = evaluateTradeFocusReadiness({
        selectedTradeId,
        selectedTradeEntryTimeMs,
        renderWindowFoundationKey,
        marketLoadStatus,
        chartView,
      });

      if (
        readiness.status === "waiting" &&
        readiness.reason === "trade_outside_slice" &&
        renderWindowFoundationKey !== null &&
        selectedTradeEntryTimeMs !== null
      ) {
        const realigned = applyRenderWindowForTrade(selectedTradeEntryTimeMs, true);
        if (realigned) {
          dbgMark(DBG.tradeFocus.delayed, {
            reason: "trade_outside_slice",
            selectedTradeId,
            requestSeq: tradeFocusRequestSeqRef.current,
            emitSource,
            note: "render_window_realign",
          });
          return null;
        }
      }

      dbgMark(DBG.tradeFocus.coverageCheck, {
        status: readiness.status,
        reason:
          readiness.status === "waiting"
            ? readiness.reason
            : readiness.status === "failed"
              ? readiness.reason
              : null,
        selectedTradeId,
        entryTimeSec:
          readiness.status === "ready"
            ? readiness.entryTimeSec
            : selectedTradeEntryTimeMs !== null
              ? Math.floor(selectedTradeEntryTimeMs / 1000)
              : null,
        chartViewCount: chartView.count,
        foundationKey: renderWindowFoundationKey,
        emitSource,
      });

      if (readiness.status === "idle") {
        lastTradeFocusEmitRef.current = null;
        return null;
      }

      if (readiness.status === "failed") {
        return null;
      }

      if (readiness.status === "waiting") {
        dbgMark(DBG.tradeFocus.delayed, {
          reason: readiness.reason,
          selectedTradeId,
          requestSeq: tradeFocusRequestSeqRef.current,
          emitSource,
        });
        return null;
      }

      if (renderWindowFoundationKey === null || selectedTradeId === null) {
        return null;
      }

      const nextEmit = tradeFocusEmitKey(
        selectedTradeId,
        readiness.entryTimeSec,
        renderWindowFoundationKey,
      );

      const pendingTradeFocusRequest =
        tradeFocusAppliedRequestSeqRef.current !== tradeFocusRequestSeqRef.current;
      const shouldEmit =
        shouldEmitTradeFocus(readiness, lastTradeFocusEmitRef.current, nextEmit, {
          suppressedByUserPan: tradeFocusSuppressedByUserPanRef.current,
        }) ||
        (pendingTradeFocusRequest && !tradeFocusSuppressedByUserPanRef.current);

      if (!shouldEmit) {
        return null;
      }

      if (emitTradeFocusCommand(readiness.entryTimeSec, emitSource)) {
        lastTradeFocusEmitRef.current = nextEmit;
        tradeFocusAppliedRequestSeqRef.current = tradeFocusRequestSeqRef.current;
      }
      return null;
    },
    [
      selectedTradeId,
      selectedTradeEntryTimeMs,
      renderWindowFoundationKey,
      marketLoadStatus,
      chartView,
      emitTradeFocusCommand,
      applyRenderWindowForTrade,
    ],
  );

  useEffect(() => {
    if (renderWindowFoundationKey === null || marketLoadStatus === "error") {
      return;
    }
    const windowChanged = applyRenderWindowForTrade(selectedTradeEntryTimeMs, false);
    if (
      !windowChanged &&
      selectedTradeId !== null &&
      selectedTradeEntryTimeMs !== null
    ) {
      const readiness = evaluateTradeFocusReadiness({
        selectedTradeId,
        selectedTradeEntryTimeMs,
        renderWindowFoundationKey,
        marketLoadStatus,
        chartView,
      });
      if (readiness.status === "ready") {
        emitTradeFocusCommand(readiness.entryTimeSec, "orchestrator");
      }
    }
  }, [
    selectedTradeEntryTimeMs,
    selectedTradeId,
    renderWindowFoundationKey,
    marketLoadStatus,
    chartView,
    renderWindowSnapshotVersion,
    applyRenderWindowForTrade,
    emitTradeFocusCommand,
  ]);

  useEffect(() => {
    const tradeKey =
      selectedTradeId === null
        ? null
        : `${String(selectedTradeId)}:${selectedTradeEntryTimeMs ?? "none"}`;

    if (tradeKey !== prevSelectedTradeKeyRef.current) {
      prevSelectedTradeKeyRef.current = tradeKey;
      if (selectedTradeId !== null && selectedTradeEntryTimeMs !== null) {
        tradeFocusRequestSeqRef.current += 1;
        tradeFocusSuppressedByUserPanRef.current = false;
        lastTradeFocusEmitRef.current = null;
        runPhase63CAcknowledgeViewportCommand(phase63CViewportOwner());
        setChartViewportCommand(null);
        dbgMark(DBG.tradeFocus.request, {
          selectedTradeId,
          selectedTradeEntryTimeMs,
          requestSeq: tradeFocusRequestSeqRef.current,
          focusWindowFromMs: marketFocusWindow?.fromMs ?? null,
          focusWindowToMs: marketFocusWindow?.toMs ?? null,
        });
      } else {
        lastTradeFocusEmitRef.current = null;
        tradeFocusAppliedRequestSeqRef.current = 0;
        tradeFocusSuppressedByUserPanRef.current = false;
      }
    }

    if (selectedTradeId === null) {
      return;
    }

    tryEmitTradeFocusWhenReady("orchestrator");
  }, [
    selectedTradeId,
    selectedTradeEntryTimeMs,
    renderWindowFoundationKey,
    marketLoadDeliveryTick,
    marketLoadStatus,
    marketFocusWindow,
    chartView,
    renderWindowSnapshotVersion,
    tryEmitTradeFocusWhenReady,
  ]);

  const onTraceReadyViewport = useCallback((): ViewportCommand | null => {
    return tryEmitTradeFocusWhenReady("trace_ready");
  }, [tryEmitTradeFocusWhenReady]);

  const getInteractionState = useCallback(
    () => v2RenderWindow().getInteractionState(),
    // renderWindowSnapshotVersion keeps callback fresh after window shifts
    [renderWindowSnapshotVersion],
  );

  const hasPendingShift = useCallback(
    () => v2RenderWindow().getPendingShift() !== null,
    [renderWindowSnapshotVersion],
  );

  const renderWindowBounds = useMemo(
    () => candleTimeBounds(chartView.candles),
    [chartView.candles],
  );

  const value = useMemo<WorkbenchRenderViewportState>(
    () => ({
      chartView,
      chartWindowSlice,
      renderWindowBounds,
      windowSnapshotRevision: renderWindowRevision,
      windowShiftSeq: renderWindowShiftSeq,
      chartViewportCommand,
      chartViewportCommandSeq,
      acknowledgeChartViewportCommand,
      isWindowSwapTransactionCancelled,
      settleWindowSwapCommit,
      dispatchChartInteraction,
      emitTradeFocusCommand,
      emitViewportCommand: emitChartViewportCommand,
      onTraceReadyViewport,
      getInteractionState,
      hasPendingShift,
    }),
    [
      chartView,
      chartWindowSlice,
      renderWindowBounds,
      renderWindowRevision,
      renderWindowShiftSeq,
      chartViewportCommand,
      chartViewportCommandSeq,
      acknowledgeChartViewportCommand,
      isWindowSwapTransactionCancelled,
      settleWindowSwapCommit,
      dispatchChartInteraction,
      emitTradeFocusCommand,
      emitChartViewportCommand,
      onTraceReadyViewport,
      getInteractionState,
      hasPendingShift,
      renderWindowSnapshotVersion,
    ],
  );

  return (
    <WorkbenchRenderViewportContext.Provider value={value}>
      {children}
    </WorkbenchRenderViewportContext.Provider>
  );
}

export function useWorkbenchRenderViewport(): WorkbenchRenderViewportState {
  const ctx = useContext(WorkbenchRenderViewportContext);
  if (!ctx) {
    throw new Error("useWorkbenchRenderViewport must be used within WorkbenchRenderViewportProvider");
  }
  return ctx;
}
