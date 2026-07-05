import {

  CandlestickSeries,

  createChart,

  createSeriesMarkers,

  LineSeries,

  type IChartApi,

  type IPriceLine,

  type ISeriesApi,

  type ISeriesMarkersPluginApi,

  type Time,

} from "lightweight-charts";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";

import {
  dbgMark,
  dbgTimedSync,
  dbgTimedSyncChartModel,
  PIPELINE_DEBUG_STEPS as DBG,
} from "@/shared/diagnostics/cutoverPipelineDebug";



import type { AnchorStackEmaRole, ChartEmaOverlay } from "@/api/types";
import { colorForAuxEmaOverlay } from "@/features/chart/chartAuxEmaOverlays";

import { ChartAsideStackSplitHandle } from "@/features/chart/ChartAsideStackSplitHandle";
import { ChartBarInspector } from "@/features/chart/ChartBarInspector";
import { ChartPanelSplitHandle } from "@/features/chart/ChartPanelSplitHandle";
import { ChartTradeDiagnostics } from "@/features/chart/ChartTradeDiagnostics";
import { ChartTradeFocusNav } from "@/features/chart/ChartTradeFocusNav";
import { useChartAsideResize } from "@/features/chart/useChartAsideResize";
import { useChartAsideStackResize } from "@/features/chart/useChartAsideStackResize";
import { buildTradePriceLineSpecs } from "@/features/chart/chartTradePriceLines";

import { ChartMarkerLegend } from "@/features/chart/ChartMarkerLegend";


import { anchorStackPeriodsFromStrategySpec } from "@/features/chart/anchorStackFromSpec";

import { toCandlestickSeriesData } from "@/features/chart/chartCandleUtils";

import {

  buildTradeMarkersForView,

  tradeOutsideCandleRange,

} from "@/features/chart/chartMarkers";
import {
  buildComponentEventsForView,
  hasHtfAlignedComponentEvents,
} from "@/features/chart/chartComponentEvents";
import {
  buildTradeManagementEventsForView,
  hasTradeManagementEvents,
} from "@/features/chart/tradeManagementChartEvents";

import { shouldSuppressPanShiftRequest } from "@/features/chart/chartViewport";
import {
  createChartInteractionAdapter,
  registerChartDocumentKeyboardNavigation,
} from "@/features/chart/runtime/interactionAdapter";
import { executeViewportCommand } from "@/features/chart/runtime/executeViewportCommand";
import { CHART_RENDER_WINDOW_SIZE } from "@/features/chart/chartDataWindowManager";
import { findTradeById, tradeDisplayNumber } from "@/features/chart/tradeLookup";

import { useWorkbenchChart, useWorkbenchShell } from "@/shared/context/WorkbenchContext";
import { useWorkbenchRenderViewport } from "@/shared/context/WorkbenchRenderViewportContext";



const EMA_OVERLAY_STYLE: Record<

  AnchorStackEmaRole,

  { color: string; lineWidth: 1 | 2 | 3 | 4 }

> = {

  fast: { color: "#86efac", lineWidth: 2 },

  anchor: { color: "#38bdf8", lineWidth: 2 },

  slow: { color: "#a78bfa", lineWidth: 2 },

};



function overlaySeriesTitle(overlay: ChartEmaOverlay): string {

  return `EMA ${overlay.role} ${overlay.period} (overlay)`;

}

export function ChartPanel() {
  const { activeTab } = useWorkbenchShell();
  const chartTabActiveRef = useRef(activeTab === "chart");
  chartTabActiveRef.current = activeTab === "chart";

  const containerRef = useRef<HTMLDivElement>(null);
  const panelBodyRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLDivElement>(null);
  const { asideWidth, maxAsideWidth, splitHandleProps } = useChartAsideResize(panelBodyRef);

  const chartRef = useRef<IChartApi | null>(null);

  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const emaSeriesByRoleRef = useRef<Partial<Record<AnchorStackEmaRole, ISeriesApi<"Line">>>>(

    {},

  );

  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  const tradePriceLinesRef = useRef<IPriceLine[]>([]);

  const auxEmaSeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());

  /** Renderer plumbing only — suppress programmatic range / pan-shift feedback, not policy. */
  const isApplyingViewportRef = useRef(false);
  const suppressPanShiftUntilRef = useRef(0);
  const visibleRangeHandlerRef = useRef<(() => void) | null>(null);

  const {

    chartViewModel,

    htfAuxEmaOverlayStale,

    componentEventsStale,

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

    candlesSource,

    marketError,

    marketCandlesCount,

    timeframeMismatch,

    reportTimeframe,

    chartTimeframe,

    selectedVariant,

    selectedTradeId,

    selectTrade,

    chartTradeFocusWarning,

    fullCandleRange,

    setContextOverlayRef,

    effectiveContextOverlayRef,

    contextOverlayRefOptions,

    selectedBarTimeSec,

    selectBar,

  } = useWorkbenchChart();

  const {
    dispatchChartInteraction,
    chartViewportCommand,
    chartViewportCommandSeq,
    acknowledgeChartViewportCommand,
    isWindowSwapTransactionCancelled,
    settleWindowSwapCommit,
    windowShiftSeq,
  } = useWorkbenchRenderViewport();

  const dispatchChartInteractionRef = useRef(dispatchChartInteraction);
  dispatchChartInteractionRef.current = dispatchChartInteraction;
  const chartCandles = chartViewModel.candles;
  const chartEmaOverlays = chartViewModel.emaOverlays;
  const chartDisplayAuxEmaOverlays = chartViewModel.displayAuxEmaOverlays;
  const chartDisplayComponentEvents = chartViewModel.componentEvents;
  const traceDisplayStatus = chartViewModel.traceDisplayStatus;
  const traceDisplayMissingRange = chartViewModel.traceDisplayMissingRange;

  const chartCandlesRef = useRef(chartCandles);
  chartCandlesRef.current = chartCandles;
  const interactionAdapterRef = useRef(
    createChartInteractionAdapter({
      dispatch: (event) => dispatchChartInteractionRef.current(event),
      getCandles: () => chartCandlesRef.current,
      shouldSuppressRangeEvent: () =>
        shouldSuppressPanShiftRequest(
          isApplyingViewportRef.current,
          suppressPanShiftUntilRef.current,
        ),
    }),
  );
  const trades = selectedVariant?.trade_records ?? [];

  const selectedTrade = findTradeById(trades, selectedTradeId);

  const showAsideStack = selectedTradeId !== null;
  const { diagnosticsHeight, maxDiagnosticsHeight, stackSplitHandleProps } =
    useChartAsideStackResize(asideRef, showAsideStack);

  const rangeWarning =

    selectedTrade && tradeOutsideCandleRange(selectedTrade.entry_time_ms, fullCandleRange);



  const chartSeriesDataKey = chartViewModel.seriesKey;

  const stackPeriodsLabel = useMemo(() => {

    if (chartEmaOverlays.length === 3) {

      return chartEmaOverlays.map((o) => o.period).join("/");

    }

    if (selectedVariant) {

      try {

        const p = anchorStackPeriodsFromStrategySpec(selectedVariant.strategy_spec);

        return `${p.fast}/${p.anchor}/${p.slow}`;

      } catch {

        return null;

      }

    }

    return null;

  }, [chartEmaOverlays, selectedVariant]);



  const chartHint = useMemo(() => {

    if (candlesSource !== "market") {

      return "Market data unavailable · trade markers from report";

    }

    const shown = chartCandles.length;

    const total = marketCandlesCount;

    const modeNote =
      chartViewModel.viewMode === "around-trade" && chartViewModel.centerTimeSec !== null
        ? `trade focus · center ${chartViewModel.centerTimeSec}`
        : chartViewModel.viewMode === "tail"
          ? "tail view"
          : "";

    const rangeNote =
      chartViewModel.firstTimeSec !== null && chartViewModel.lastTimeSec !== null
        ? `range ${chartViewModel.firstTimeSec}–${chartViewModel.lastTimeSec}`
        : "";

    const windowNote =

      total > shown

        ? `Showing ${shown} of ${total} bars`

        : `Showing ${shown} bar${shown === 1 ? "" : "s"}`;

    const auxNote =
      chartDisplayAuxEmaOverlays.length > 0
        ? ` · +${chartDisplayAuxEmaOverlays.length} aux EMA (exit/HTF)`
        : "";

    const htfStaleNote = htfAuxEmaOverlayStale
      ? " · HTF EMA may lag (signal trace reloading; stable BFF overlay planned)"
      : "";

    const componentEventNote =
      chartDisplayComponentEvents.length > 0
        ? ` · +${chartDisplayComponentEvents.length} component events`
        : "";

    const componentStaleNote = componentEventsStale
      ? " · component events may lag (signal trace reloading)"
      : "";

    const traceDisplayStateNote =
      traceDisplayStatus === "loading_missing"
        ? traceDisplayMissingRange
          ? ` · trace display loading missing ${traceDisplayMissingRange.fromSec}–${traceDisplayMissingRange.toSec}`
          : " · trace display loading missing range"
        : traceDisplayStatus === "partial"
          ? " · trace display partial"
          : traceDisplayStatus === "stale"
            ? " · trace display stale"
            : "";

    const htfAlignedEventNote =
      hasHtfAlignedComponentEvents(chartDisplayComponentEvents) &&
      chartDisplayComponentEvents.some(
        (event) => event.source_timeframe != null && event.source_timeframe !== chartTimeframe,
      )
        ? " · HTF spans use backend-aligned base-bar boundaries"
        : "";

    const emaNote = stackPeriodsLabel

      ? `OHLC + EMA stack ${stackPeriodsLabel} (overlay, periods from run strategy_spec)${auxNote}${htfStaleNote}`

      : `OHLC · overlay EMA requires anchor_stack in strategy_spec${auxNote}${htfStaleNote}`;

    const traceLoadingHint =
      componentEventsStale && chartDisplayComponentEvents.length === 0
          ? " · Loading events/HTF context…"
          : "";

    const parts = [
      windowNote,
      modeNote,
      rangeNote,
      emaNote,
      "trade markers from report",
      traceLoadingHint,
      componentEventNote,
      componentStaleNote,
      traceDisplayStateNote,
      htfAlignedEventNote,
    ].filter(Boolean);

    return parts.join(" · ");

  }, [

    candlesSource,

    chartCandles.length,

    marketCandlesCount,

    chartViewModel.viewMode,

    chartViewModel.centerTimeSec,

    chartViewModel.firstTimeSec,

    chartViewModel.lastTimeSec,

    stackPeriodsLabel,

    chartDisplayAuxEmaOverlays.length,

    htfAuxEmaOverlayStale,

    chartDisplayComponentEvents,

    componentEventsStale,

    traceDisplayStatus,

    traceDisplayMissingRange,

    chartTimeframe,

  ]);



  useEffect(() => {

    const el = containerRef.current;

    if (!el) return;



    const chart = createChart(el, {

      layout: {

        background: { color: "#0f1419" },

        textColor: "#c8d0dc",

      },

      grid: {

        vertLines: { color: "#1e2836" },

        horzLines: { color: "#1e2836" },

      },

      rightPriceScale: { borderColor: "#2a3544" },

      timeScale: { borderColor: "#2a3544", timeVisible: true, secondsVisible: false },

      crosshair: { mode: 1 },

    });



    const series = chart.addSeries(CandlestickSeries, {

      upColor: "#22c55e",

      downColor: "#ef4444",

      borderVisible: false,

      wickUpColor: "#22c55e",

      wickDownColor: "#ef4444",

    });



    const emaSeriesByRole: Partial<Record<AnchorStackEmaRole, ISeriesApi<"Line">>> = {};

    for (const role of ["fast", "anchor", "slow"] as const) {

      const style = EMA_OVERLAY_STYLE[role];

      emaSeriesByRole[role] = chart.addSeries(LineSeries, {

        color: style.color,

        lineWidth: style.lineWidth,

        title: `EMA ${role} (overlay)`,

        priceLineVisible: false,

      });

    }



    chartRef.current = chart;

    seriesRef.current = series;

    emaSeriesByRoleRef.current = emaSeriesByRole;

    markersRef.current = createSeriesMarkers(series);



    chart.subscribeClick((param) => {

      if (param.time === undefined) {

        return;

      }

      const timeSec = typeof param.time === "number" ? param.time : Number(param.time);

      selectBar(timeSec);

    });

    const adapter = interactionAdapterRef.current;

    const onPointerDown = () => adapter.onPointerDown();
    const onPointerUp = () => adapter.onPointerUp();
    const onWheel = () => adapter.onWheel();
    const keyboardNavigation = registerChartDocumentKeyboardNavigation({
      chartTabActive: () => chartTabActiveRef.current,
      chartCanvas: el,
      adapter,
    });

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("wheel", onWheel, { passive: true });

    const visibleRangeHandler = (range: { from: number; to: number } | null) => {
      if (
        shouldSuppressPanShiftRequest(
          isApplyingViewportRef.current,
          suppressPanShiftUntilRef.current,
        )
      ) {
        dbgMark(DBG.pan.suppressedProgrammatic);
        adapter.onProgrammaticViewportStart();
        adapter.onVisibleLogicalRangeChange(range);
        adapter.onProgrammaticViewportEnd();
        return;
      }
      adapter.onVisibleLogicalRangeChange(range);
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(visibleRangeHandler);
    visibleRangeHandlerRef.current = () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(visibleRangeHandler);
    };



    const ro = new ResizeObserver((entries) => {

      const { width, height } = entries[0].contentRect;

      chart.applyOptions({ width, height });

      dispatchChartInteractionRef.current({ type: "resize" });

    });

    ro.observe(el);



    return () => {

      ro.disconnect();

      visibleRangeHandlerRef.current?.();
      visibleRangeHandlerRef.current = null;
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("wheel", onWheel);
      keyboardNavigation.unregister();

      // chart.remove() destroys all series; do not call removeSeries afterward.
      auxEmaSeriesRef.current.clear();

      chart.remove();

      chartRef.current = null;

      seriesRef.current = null;

      emaSeriesByRoleRef.current = {};

      markersRef.current = null;

    };

  }, [selectBar]);

  useLayoutEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || !selectedVariant || chartSeriesDataKey === "") {
      return;
    }

    dbgTimedSyncChartModel(
      DBG.chart.setDataCandles,
      () => {
        series.setData(toCandlestickSeriesData(chartCandles));
      },
      () => ({ barCount: chartCandles.length }),
    );
  }, [chartCandles, chartSeriesDataKey, selectedVariant]);

  useLayoutEffect(() => {
    const chart = chartRef.current;
    const emaByRole = emaSeriesByRoleRef.current;
    if (!chart || !selectedVariant || chartSeriesDataKey === "") {
      return;
    }

    dbgTimedSyncChartModel(
      DBG.chart.setDataAnchorEma,
      () => {
        for (const role of ["fast", "anchor", "slow"] as const) {
          const lineSeries = emaByRole[role];
          if (!lineSeries) continue;
          const overlay = chartEmaOverlays.find((o) => o.role === role);
          if (!overlay) {
            lineSeries.setData([]);
            continue;
          }
          lineSeries.applyOptions({ title: overlaySeriesTitle(overlay) });
          lineSeries.setData(
            overlay.points.map((p) => ({
              time: p.time as Time,
              value: p.value,
            })),
          );
        }
      },
      () => ({ overlayCount: chartEmaOverlays.length }),
    );

    dbgTimedSyncChartModel(
      DBG.chart.setDataAuxHtf,
      () => {
        const seriesMap = auxEmaSeriesRef.current;
        const activeIds = new Set(chartDisplayAuxEmaOverlays.map((overlay) => overlay.id));
        for (const [id, lineSeries] of [...seriesMap.entries()]) {
          if (!activeIds.has(id)) {
            chart.removeSeries(lineSeries);
            seriesMap.delete(id);
          }
        }
        chartDisplayAuxEmaOverlays.forEach((overlay, index) => {
          let lineSeries = seriesMap.get(overlay.id);
          if (!lineSeries) {
            lineSeries = chart.addSeries(LineSeries, {
              color: colorForAuxEmaOverlay(index),
              lineWidth: 2,
              lineStyle: overlay.dashed ? 2 : 0,
              title: overlay.label,
              priceLineVisible: false,
            });
            seriesMap.set(overlay.id, lineSeries);
          }
          if (overlay.points.length === 0 && lineSeries) {
            return;
          }
          lineSeries.applyOptions({
            color: colorForAuxEmaOverlay(index),
            lineStyle: overlay.dashed ? 2 : 0,
            title: overlay.label,
          });
          lineSeries.setData(
            overlay.points.map((p) => ({
              time: p.time as Time,
              value: p.value,
            })),
          );
        });
      },
      () => ({ overlayCount: chartDisplayAuxEmaOverlays.length }),
    );
  }, [
    chartEmaOverlays,
    chartDisplayAuxEmaOverlays,
    chartSeriesDataKey,
    selectedVariant,
  ]);

  useEffect(() => {
    const chart = chartRef.current;
    const command = chartViewportCommand;
    if (!chart || !command || chartCandles.length === 0) {
      return;
    }

    if (
      command.type === "restoreAfterWindowSwap" &&
      isWindowSwapTransactionCancelled(command.swapTransactionId)
    ) {
      dbgMark(DBG.renderWindow.shiftRestoreCancelled, {
        shiftSeq: command.shiftSeq,
        swapTransactionId: command.swapTransactionId,
      });
      acknowledgeChartViewportCommand();
      return;
    }

    if (
      command.type === "restoreAfterWindowSwap" &&
      command.shiftSeq !== windowShiftSeq
    ) {
      dbgMark(DBG.chart.viewportRestoreAfterShiftSkippedStale, {
        expected: command.shiftSeq,
        current: windowShiftSeq,
      });
      acknowledgeChartViewportCommand();
      return;
    }

    interactionAdapterRef.current.onProgrammaticViewportStart();
    isApplyingViewportRef.current = true;
    suppressPanShiftUntilRef.current = Date.now() + 300;

    if (command.type === "focusTrade") {
      dbgMark(DBG.chart.viewportApplyTradeFocus);
    }
    const dbgStep =
      command.type === "restoreAfterWindowSwap"
        ? DBG.chart.viewportRestoreAfterShift
        : DBG.chart.viewportApply;
    dbgTimedSync(
      dbgStep,
      () => {
        executeViewportCommand({ chart, command, candles: chartCandles });
        return null;
      },
      () => ({ command: command.type, barCount: chartCandles.length }),
    );

    acknowledgeChartViewportCommand();

    if (command.type === "restoreAfterWindowSwap") {
      settleWindowSwapCommit(command.shiftSeq, command.swapTransactionId);
    }

    window.setTimeout(() => {
      isApplyingViewportRef.current = false;
      interactionAdapterRef.current.onProgrammaticViewportEnd();
    }, 300);
  }, [
    chartViewportCommand,
    chartViewportCommandSeq,
    chartCandles,
    windowShiftSeq,
    acknowledgeChartViewportCommand,
    isWindowSwapTransactionCancelled,
    settleWindowSwapCommit,
  ]);

  useLayoutEffect(() => {

    const markersPlugin = markersRef.current;

    if (!markersPlugin || !selectedVariant || chartCandles.length === 0) return;



    let tradeMarkerCount = 0;
    let componentMarkerCount = 0;
    let tradeManagementMarkerCount = 0;
    dbgTimedSync(
      DBG.chart.markersRebuild,
      () => {
        const tradeMarkers = buildTradeMarkersForView(
          selectedVariant.trade_records,
          selectedTradeId,
          chartCandles,
        );
        const componentMarkers = buildComponentEventsForView(chartDisplayComponentEvents, {
          showEntryBlock: chartShowEntryBlockMarkers,
          showExitSignal: chartShowExitSignalMarkers,
          showSetup: chartShowSetupMarkers,
          viewCandles: chartCandles,
        });
        const tradeManagementMarkers = buildTradeManagementEventsForView(
          selectedVariant.trade_management_events,
          {
            showPhases: chartShowTradeManagementPhaseMarkers,
            showExits: chartShowTradeManagementExitMarkers,
            selectedTradeId,
            viewCandles: chartCandles,
            trades: selectedVariant.trade_records,
          },
        );
        tradeMarkerCount = tradeMarkers.length;
        componentMarkerCount = componentMarkers.length;
        tradeManagementMarkerCount = tradeManagementMarkers.length;
        markersPlugin.setMarkers(
          [...tradeMarkers, ...componentMarkers, ...tradeManagementMarkers].sort(
            (a, b) => (a.time as number) - (b.time as number),
          ),
        );
      },
      () => ({ tradeMarkerCount, componentMarkerCount, tradeManagementMarkerCount }),
    );

  }, [
    chartCandles,
    selectedVariant,
    selectedTradeId,
    chartDisplayComponentEvents,
    windowShiftSeq,
    chartViewportCommandSeq,
    chartShowEntryBlockMarkers,
    chartShowExitSignalMarkers,
    chartShowSetupMarkers,
    chartShowTradeManagementPhaseMarkers,
    chartShowTradeManagementExitMarkers,
  ]);



  useEffect(() => {

    const series = seriesRef.current;

    if (!series) return;



    for (const line of tradePriceLinesRef.current) {

      series.removePriceLine(line);

    }

    tradePriceLinesRef.current = [];



    if (!selectedTrade) return;



    const specs = buildTradePriceLineSpecs(
      selectedTrade,
      tradeDisplayNumber(selectedVariant?.trade_records ?? [], selectedTrade.trade_id) ?? undefined,
    );

    tradePriceLinesRef.current = specs.map((spec) => series.createPriceLine(spec.options));

  }, [selectedTrade]);



  if (!selectedVariant) {

    return null;

  }



  return (

    <section className="panel chart-panel">

      <div className="panel__header">

        <h2>Chart</h2>

        <p className="panel__hint">{chartHint}</p>

        {contextOverlayRefOptions.length > 0 ? (
          <label className="field field--inline chart-panel__overlay-ref">
            <span>HTF overlay context</span>
            <select
              value={effectiveContextOverlayRef ?? ""}
              onChange={(e) => setContextOverlayRef(e.target.value || null)}
            >
              <option value="">— select context —</option>
              {contextOverlayRefOptions.map((ref) => (
                <option key={ref} value={ref}>
                  {ref}
                </option>
              ))}
            </select>
          </label>
        ) : null}

      </div>

      {timeframeMismatch && reportTimeframe !== null && (

        <p className="banner banner--warn" role="status">

          Report timeframe ({reportTimeframe}) differs from chart timeframe ({chartTimeframe}).

        </p>

      )}

      {candlesSource === "unavailable" && marketError !== null && (

        <p className="banner banner--warn" role="status">

          Market data unavailable: {marketError}

        </p>

      )}

      {candlesSource === "market" && marketCandlesCount > CHART_RENDER_WINDOW_SIZE && (

        <p className="banner banner--info" role="status">

          Full report range cached ({marketCandlesCount} bars). Chart renders up to{" "}

          {CHART_RENDER_WINDOW_SIZE.toLocaleString()} bars per render window; pan shifts slice from
          in-memory cache (no extra API

          calls).

        </p>

      )}

      <ChartMarkerLegend
        showEntryBlockMarkers={chartShowEntryBlockMarkers}
        onShowEntryBlockMarkersChange={setChartShowEntryBlockMarkers}
        showExitSignalMarkers={chartShowExitSignalMarkers}
        onShowExitSignalMarkersChange={setChartShowExitSignalMarkers}
        showSetupMarkers={chartShowSetupMarkers}
        onShowSetupMarkersChange={setChartShowSetupMarkers}
        hasComponentEvents={chartDisplayComponentEvents.length > 0}
        hasTradeManagementEvents={hasTradeManagementEvents(selectedVariant?.trade_management_events)}
        showTradeManagementPhaseMarkers={chartShowTradeManagementPhaseMarkers}
        onShowTradeManagementPhaseMarkersChange={setChartShowTradeManagementPhaseMarkers}
        showTradeManagementExitMarkers={chartShowTradeManagementExitMarkers}
        onShowTradeManagementExitMarkersChange={setChartShowTradeManagementExitMarkers}
      />

      {chartTradeFocusWarning && (

        <p className="banner banner--warn" role="status">

          {chartTradeFocusWarning}

        </p>

      )}

      {rangeWarning && (

        <p className="banner banner--warn" role="status">

          Selected trade entry is outside the loaded market data range.

        </p>

      )}

      {htfAuxEmaOverlayStale && (

        <p className="banner banner--info" role="status">

          HTF EMA lines are held from the previous signal trace while the chart window reloads. Values

          may not match the current view until trace finishes loading. A stable BFF HTF overlay is

          planned for a follow-up.

        </p>

      )}

      <div ref={panelBodyRef} className="chart-panel__body">

        <div className="chart-panel__main">

          <div ref={containerRef} className="chart-canvas" tabIndex={0} />

          {selectedTradeId !== null && (
            <ChartTradeFocusNav
              trades={trades}
              selectedTradeId={selectedTradeId}
              onSelectTrade={selectTrade}
            />
          )}

        </div>

        <ChartPanelSplitHandle
          asideWidth={asideWidth}
          maxAsideWidth={maxAsideWidth}
          {...splitHandleProps}
        />

        <div
          ref={asideRef}
          className={
            showAsideStack
              ? "chart-panel__aside chart-panel__aside--stacked"
              : "chart-panel__aside"
          }
          style={{ width: asideWidth, flexBasis: asideWidth }}
        >
          {showAsideStack && (
            <>
              <div
                className="chart-panel__aside-stack-top"
                style={{
                  height: diagnosticsHeight,
                  flexBasis: diagnosticsHeight,
                }}
              >
                <ChartTradeDiagnostics
                  trade={selectedTrade}
                  selectedTradeId={selectedTradeId}
                  tradeDisplayNumber={tradeDisplayNumber(trades, selectedTradeId) ?? undefined}
                  strategySpec={selectedVariant.strategy_spec}
                  chartEmaOverlays={chartEmaOverlays}
                  chartAuxEmaOverlays={chartDisplayAuxEmaOverlays}
                  focusWarning={chartTradeFocusWarning}
                />
              </div>
              <ChartAsideStackSplitHandle
                diagnosticsHeight={diagnosticsHeight}
                maxDiagnosticsHeight={maxDiagnosticsHeight}
                {...stackSplitHandleProps}
              />
            </>
          )}

          <div className="chart-panel__aside-stack-bottom">
            <ChartBarInspector
              selectedBarTimeSec={selectedBarTimeSec}
              candles={chartCandles}
              emaOverlays={chartEmaOverlays}
              onClear={() => selectBar(null)}
            />
          </div>
        </div>

      </div>

    </section>

  );

}


