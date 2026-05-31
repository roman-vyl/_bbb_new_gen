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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";

import {
  dbgMark,
  dbgTimedSync,
  PIPELINE_DEBUG_STEPS as DBG,
} from "@/shared/diagnostics/pipelineDebug";



import type { AnchorStackEmaRole, ChartBar, ChartEmaOverlay } from "@/api/types";
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

import { SignalTimelineLanes } from "@/features/chart/SignalTimelineLanes";

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

import { buildChartDataKey } from "@/features/chart/chartDataKey";
import { shouldSuppressPanShiftRequest } from "@/features/chart/chartViewport";
import { createChartInteractionAdapter } from "@/features/chart/runtime/interactionAdapter";
import { executeViewportCommand } from "@/features/chart/runtime/executeViewportCommand";
import { CHART_RENDER_WINDOW_SIZE } from "@/features/chart/chartDataWindowManager";
import { findTradeById } from "@/features/chart/tradeLookup";

import { useWorkbench } from "@/shared/context/WorkbenchContext";



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
  /** Atomic setData key for window-swap; cleared after layout apply. */
  const atomicShiftSeriesKeyRef = useRef<string | null>(null);

  const {

    chartViewModel,

    htfAuxEmaOverlayStale,

    componentEventsStale,

    chartShowEntryBlockMarkers,

    setChartShowEntryBlockMarkers,

    chartShowExitSignalMarkers,

    setChartShowExitSignalMarkers,

    candlesSource,

    marketError,

    marketCandlesCount,

    timeframeMismatch,

    reportTimeframe,

    chartTimeframe,

    selectedVariant,

    selectedVariantKey,

    selectedTradeId,

    selectTrade,

    chartViewMode,

    chartViewCenterTimeSec,

    chartViewFirstTimeSec,

    chartViewLastTimeSec,

    chartViewCount,

    chartTradeFocusWarning,

    fullCandleRange,

    lanesSignalTrace,

    lanesSignalTraceStatus,

    lanesSignalTraceError,

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

    displayApplyRevision,

    renderWindowShiftSeq,

  } = useWorkbench();

  const dispatchChartInteractionRef = useRef(dispatchChartInteraction);
  dispatchChartInteractionRef.current = dispatchChartInteraction;
  const chartCandles = chartViewModel.candles;
  const chartEmaOverlays = chartViewModel.emaOverlays;
  const chartDisplayAuxEmaOverlays = chartViewModel.displayAuxEmaOverlays;
  const chartDisplayComponentEvents = chartViewModel.componentEvents;

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

  const chartDataKey = useMemo(
    () =>
      buildChartDataKey({
        firstTimeSec: chartViewModel.firstTimeSec,
        lastTimeSec: chartViewModel.lastTimeSec,
        count: chartViewModel.count,
        selectedTradeId,
        centerTimeSec: chartViewModel.centerTimeSec,
      }),
    [
      chartViewModel.seriesKey,
      chartViewModel.firstTimeSec,
      chartViewModel.lastTimeSec,
      chartViewModel.count,
      chartViewModel.centerTimeSec,
      selectedTradeId,
    ],
  );

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
      chartViewMode === "around-trade" && chartViewCenterTimeSec !== null
        ? `trade focus · center ${chartViewCenterTimeSec}`
        : chartViewMode === "tail"
          ? "tail view"
          : "";

    const rangeNote =
      chartViewFirstTimeSec !== null && chartViewLastTimeSec !== null
        ? `range ${chartViewFirstTimeSec}–${chartViewLastTimeSec}`
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

    const traceNote =
      lanesSignalTraceStatus === "ready"
        ? " · signal trace loaded"
        : lanesSignalTraceStatus === "loading"
          ? " · Loading events/HTF context…"
          : "";

    const traceLoadingHint =
      lanesSignalTraceStatus === "loading" &&
      chartDisplayComponentEvents.length === 0 &&
      !componentEventsStale
        ? " · Loading events/HTF context…"
        : componentEventsStale && chartDisplayComponentEvents.length === 0
          ? " · Loading events/HTF context…"
          : "";

    const parts = [
      windowNote,
      modeNote,
      rangeNote,
      emaNote,
      "trade markers from report",
      traceNote,
      traceLoadingHint,
      componentEventNote,
      componentStaleNote,
      htfAlignedEventNote,
    ].filter(Boolean);

    return parts.join(" · ");

  }, [

    candlesSource,

    chartCandles.length,

    marketCandlesCount,

    chartViewMode,

    chartViewCenterTimeSec,

    chartViewFirstTimeSec,

    chartViewLastTimeSec,

    stackPeriodsLabel,

    chartDisplayAuxEmaOverlays.length,

    htfAuxEmaOverlayStale,

    chartDisplayComponentEvents,

    componentEventsStale,

    chartTimeframe,

    lanesSignalTraceStatus,

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
    const emaByRole = emaSeriesByRoleRef.current;
    if (!chart || !series || !selectedVariant || chartSeriesDataKey === "") {
      return;
    }

    if (atomicShiftSeriesKeyRef.current === chartSeriesDataKey) {
      atomicShiftSeriesKeyRef.current = null;
      return;
    }

    dbgTimedSync(
      DBG.chart.setDataCandles,
      () => {
        series.setData(toCandlestickSeriesData(chartCandles));
      },
      () => ({ barCount: chartCandles.length }),
    );

    dbgTimedSync(
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

    dbgTimedSync(
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

    atomicShiftSeriesKeyRef.current = chartSeriesDataKey;
  }, [
    chartCandles,
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
      command.shiftSeq !== renderWindowShiftSeq
    ) {
      dbgMark(DBG.chart.viewportRestoreAfterShiftSkippedStale, {
        expected: command.shiftSeq,
        current: renderWindowShiftSeq,
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
    renderWindowShiftSeq,
    acknowledgeChartViewportCommand,
    isWindowSwapTransactionCancelled,
    settleWindowSwapCommit,
  ]);

  useEffect(() => {

    const markersPlugin = markersRef.current;

    if (!markersPlugin || !selectedVariant || chartCandles.length === 0) return;



    let tradeMarkerCount = 0;
    let componentMarkerCount = 0;
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
          viewCandles: chartCandles,
        });
        tradeMarkerCount = tradeMarkers.length;
        componentMarkerCount = componentMarkers.length;
        markersPlugin.setMarkers(
          [...tradeMarkers, ...componentMarkers].sort(
            (a, b) => (a.time as number) - (b.time as number),
          ),
        );
      },
      () => ({ tradeMarkerCount, componentMarkerCount }),
    );

  }, [
    chartCandles,
    selectedVariant,
    selectedTradeId,
    chartDisplayComponentEvents,
    displayApplyRevision,
    chartShowEntryBlockMarkers,
    chartShowExitSignalMarkers,
  ]);



  useEffect(() => {

    const series = seriesRef.current;

    if (!series) return;



    for (const line of tradePriceLinesRef.current) {

      series.removePriceLine(line);

    }

    tradePriceLinesRef.current = [];



    if (!selectedTrade) return;



    const specs = buildTradePriceLineSpecs(selectedTrade);

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

      {lanesSignalTraceError && (

        <p className="banner banner--warn" role="status">

          Signal trace: {lanesSignalTraceError}

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
        hasComponentEvents={chartDisplayComponentEvents.length > 0}
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

          <div ref={containerRef} className="chart-canvas" />

          <SignalTimelineLanes

            signalTrace={lanesSignalTrace}

            selectedBarTimeSec={selectedBarTimeSec}

            onSelectBar={selectBar}

          />

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
                  strategySpec={selectedVariant.strategy_spec}
                  chartEmaOverlays={chartEmaOverlays}
                  chartAuxEmaOverlays={chartDisplayAuxEmaOverlays}
                  focusWarning={chartTradeFocusWarning}
                  signalTrace={lanesSignalTrace}
                  signalTraceStatus={lanesSignalTraceStatus}
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
              signalTrace={lanesSignalTrace}
              signalTraceError={lanesSignalTraceError}
              signalTraceLoading={lanesSignalTraceStatus === "loading"}
              onClear={() => selectBar(null)}
            />
          </div>
        </div>

      </div>

    </section>

  );

}


