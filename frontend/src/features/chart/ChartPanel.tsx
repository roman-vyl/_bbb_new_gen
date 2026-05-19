import {

  CandlestickSeries,

  createChart,

  createSeriesMarkers,

  LineSeries,

  type IChartApi,

  type ISeriesApi,

  type ISeriesMarkersPluginApi,

  type Time,

} from "lightweight-charts";

import { useCallback, useEffect, useMemo, useRef } from "react";



import type { AnchorStackEmaRole, ChartBar, ChartEmaOverlay } from "@/api/types";

import { ChartBarInspector } from "@/features/chart/ChartBarInspector";
import { ChartTradeFocusNav } from "@/features/chart/ChartTradeFocusNav";

import { ChartMarkerLegend } from "@/features/chart/ChartMarkerLegend";

import { SignalTimelineLanes } from "@/features/chart/SignalTimelineLanes";

import { anchorStackPeriodsFromStrategySpec } from "@/features/chart/anchorStackFromSpec";

import { toCandlestickSeriesData } from "@/features/chart/chartCandleUtils";

import {

  buildTradeMarkersForView,

  tradeOutsideCandleRange,

} from "@/features/chart/chartMarkers";

import { buildChartDataKey } from "@/features/chart/chartDataKey";
import { applyChartViewport } from "@/features/chart/chartViewport";
import { CHART_RENDER_BAR_LIMIT, type ChartViewMode } from "@/features/chart/chartViewWindow";
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

type ViewportPlan = {
  key: string;
  mode: ChartViewMode;
  centerTimeSec: number | null;
  candles: ChartBar[];
};

export function ChartPanel() {

  const containerRef = useRef<HTMLDivElement>(null);

  const chartRef = useRef<IChartApi | null>(null);

  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const emaSeriesByRoleRef = useRef<Partial<Record<AnchorStackEmaRole, ISeriesApi<"Line">>>>(

    {},

  );

  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  const viewportKeyRef = useRef<string | null>(null);

  const viewportPlanRef = useRef<ViewportPlan | null>(null);

  const applyViewportFromPlan = useCallback((chart: IChartApi) => {
    const plan = viewportPlanRef.current;
    if (!plan || plan.key === "" || plan.candles.length === 0) {
      return null;
    }

    return applyChartViewport({
      chart,
      mode: plan.mode,
      candles: plan.candles,
      centerTimeSec: plan.centerTimeSec,
    });
  }, []);

  const scheduleViewportApply = useCallback(
    (chart: IChartApi) => {
      const run = () => applyViewportFromPlan(chart);
      requestAnimationFrame(() => {
        run();
        requestAnimationFrame(() => {
          run();
          window.setTimeout(run, 50);
          window.setTimeout(run, 150);
        });
      });
    },
    [applyViewportFromPlan],
  );

  const {

    chartCandles,

    chartEmaOverlays,

    candlesSource,

    marketError,

    marketCandlesCount,

    timeframeMismatch,

    reportTimeframe,

    chartTimeframe,

    selectedVariant,

    selectedTradeId,

    selectTrade,

    chartViewMode,

    chartViewCenterTimeSec,

    chartViewFirstTimeSec,

    chartViewLastTimeSec,

    chartViewCount,

    chartTradeFocusWarning,

    fullCandleRange,

    signalTrace,

    signalTraceStatus,

    signalTraceError,

    selectedBarTimeSec,

    selectBar,

  } = useWorkbench();



  const trades = selectedVariant?.trade_records ?? [];

  const selectedTrade = findTradeById(trades, selectedTradeId);

  const rangeWarning =

    selectedTrade && tradeOutsideCandleRange(selectedTrade.entry_time_ms, fullCandleRange);



  const chartDataKey = useMemo(
    () =>
      buildChartDataKey({
        firstTimeSec: chartViewFirstTimeSec,
        lastTimeSec: chartViewLastTimeSec,
        count: chartViewCount,
        selectedTradeId,
        centerTimeSec: chartViewCenterTimeSec,
      }),
    [
      chartViewFirstTimeSec,
      chartViewLastTimeSec,
      chartViewCount,
      selectedTradeId,
      chartViewCenterTimeSec,
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

    const emaNote = stackPeriodsLabel

      ? `OHLC + EMA stack ${stackPeriodsLabel} (overlay, periods from run strategy_spec)`

      : "OHLC · overlay EMA requires anchor_stack in strategy_spec";

    const traceNote =

      signalTraceStatus === "ready"

        ? " · signal trace loaded"

        : signalTraceStatus === "loading"

          ? " · loading signal trace…"

          : "";

    const parts = [windowNote, modeNote, rangeNote, emaNote, "trade markers from report", traceNote].filter(
      Boolean,
    );

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

    signalTraceStatus,

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



    const ro = new ResizeObserver((entries) => {

      const { width, height } = entries[0].contentRect;

      chart.applyOptions({ width, height });

      scheduleViewportApply(chart);

    });

    ro.observe(el);



    return () => {

      ro.disconnect();

      chart.remove();

      chartRef.current = null;

      seriesRef.current = null;

      emaSeriesByRoleRef.current = {};

      markersRef.current = null;

    };

  }, [selectBar, scheduleViewportApply]);



  useEffect(() => {

    const series = seriesRef.current;

    const emaByRole = emaSeriesByRoleRef.current;

    const chart = chartRef.current;

    if (!series || !chart || !selectedVariant || chartDataKey === "") return;

    series.setData(toCandlestickSeriesData(chartCandles));



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



    viewportPlanRef.current = {
      key: chartDataKey,
      mode: chartViewMode,
      centerTimeSec: chartViewCenterTimeSec,
      candles: chartCandles,
    };

    if (viewportKeyRef.current !== chartDataKey) {
      viewportKeyRef.current = chartDataKey;
      scheduleViewportApply(chart);
    }

  }, [
    chartCandles,
    chartEmaOverlays,
    selectedVariant,
    chartDataKey,
    chartViewMode,
    chartViewCenterTimeSec,
    scheduleViewportApply,
  ]);



  useEffect(() => {

    const markersPlugin = markersRef.current;

    if (!markersPlugin || !selectedVariant || chartCandles.length === 0) return;



    const markers = buildTradeMarkersForView(

      selectedVariant.trade_records,

      selectedTradeId,

      chartCandles,

    );

    markersPlugin.setMarkers(markers);

  }, [chartCandles, selectedVariant, selectedTradeId]);



  if (!selectedVariant) {

    return null;

  }



  return (

    <section className="panel chart-panel">

      <div className="panel__header">

        <h2>Chart</h2>

        <p className="panel__hint">{chartHint}</p>

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

      {signalTraceError && (

        <p className="banner banner--warn" role="status">

          Signal trace: {signalTraceError}

        </p>

      )}

      {candlesSource === "market" && marketCandlesCount > CHART_RENDER_BAR_LIMIT && (

        <p className="banner banner--info" role="status">

          Full report range cached ({marketCandlesCount} bars). Chart renders up to{" "}

          {CHART_RENDER_BAR_LIMIT} bars per view; trade focus uses an in-memory slice (no extra API

          calls).

        </p>

      )}

      <ChartMarkerLegend />

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

      <div className="chart-panel__body">

        <div className="chart-panel__main">

          <div ref={containerRef} className="chart-canvas" />

          <SignalTimelineLanes

            signalTrace={signalTrace}

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

        <ChartBarInspector

          selectedBarTimeSec={selectedBarTimeSec}

          candles={chartCandles}

          emaOverlays={chartEmaOverlays}

          signalTrace={signalTrace}

          signalTraceError={signalTraceError}

          signalTraceLoading={signalTraceStatus === "loading"}

          onClear={() => selectBar(null)}

        />

      </div>

    </section>

  );

}


