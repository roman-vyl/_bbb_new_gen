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

import { useEffect, useMemo, useRef } from "react";



import type { AnchorStackEmaRole, ChartEmaOverlay } from "@/api/types";

import { ChartBarInspector } from "@/features/chart/ChartBarInspector";

import { ChartMarkerLegend } from "@/features/chart/ChartMarkerLegend";

import { SignalTimelineLanes } from "@/features/chart/SignalTimelineLanes";

import { anchorStackPeriodsFromStrategySpec } from "@/features/chart/anchorStackFromSpec";

import { toCandlestickSeriesData } from "@/features/chart/chartCandleUtils";

import {

  buildTradeMarkersForView,

  tradeOutsideCandleRange,

} from "@/features/chart/chartMarkers";

import { CHART_RENDER_BAR_LIMIT } from "@/features/chart/chartViewWindow";

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

  const chartRef = useRef<IChartApi | null>(null);

  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const emaSeriesByRoleRef = useRef<Partial<Record<AnchorStackEmaRole, ISeriesApi<"Line">>>>(

    {},

  );

  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  const fitContentKeyRef = useRef<string | null>(null);

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

    fullCandleRange,

    signalTrace,

    signalTraceStatus,

    signalTraceError,

    selectedBarTimeSec,

    selectBar,

  } = useWorkbench();



  const trades = selectedVariant?.trade_records ?? [];

  const selectedTrade = trades.find((t) => t.trade_id === selectedTradeId);

  const rangeWarning =

    selectedTrade && tradeOutsideCandleRange(selectedTrade.entry_time_ms, fullCandleRange);



  const chartDataKey = useMemo(() => {

    if (chartCandles.length === 0) {

      return "";

    }

    return `${chartCandles[0]!.time}:${chartCandles[chartCandles.length - 1]!.time}:${chartCandles.length}`;

  }, [chartCandles]);



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

    return `${windowNote} · ${emaNote} · trade markers from report${traceNote}`;

  }, [

    candlesSource,

    chartCandles.length,

    marketCandlesCount,

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

  }, [selectBar]);



  useEffect(() => {

    const series = seriesRef.current;

    const emaByRole = emaSeriesByRoleRef.current;

    const chart = chartRef.current;

    const markersPlugin = markersRef.current;

    if (!series || !chart || !markersPlugin || !selectedVariant) return;



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



    const markers = buildTradeMarkersForView(

      selectedVariant.trade_records,

      selectedTradeId,

      chartCandles,

    );

    markersPlugin.setMarkers(markers);



    if (fitContentKeyRef.current !== chartDataKey) {

      chart.timeScale().fitContent();

      fitContentKeyRef.current = chartDataKey;

    }

  }, [chartCandles, chartEmaOverlays, selectedVariant, selectedTradeId, chartDataKey]);



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

      {selectedTradeId !== null && (

        <p className="chart-focus">

          Focused trade #{selectedTradeId}. Click another row in Reports or clear selection.

          <button type="button" className="link-btn" onClick={() => selectTrade(null)}>

            Clear

          </button>

        </p>

      )}

    </section>

  );

}


