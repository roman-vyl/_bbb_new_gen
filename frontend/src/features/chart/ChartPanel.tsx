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

import { CHART_EMA_PERIOD } from "@/api/types";
import { ChartMarkerLegend } from "@/features/chart/ChartMarkerLegend";
import { toCandlestickSeriesData } from "@/features/chart/chartCandleUtils";
import {
  buildTradeMarkersForView,
  tradeOutsideCandleRange,
} from "@/features/chart/chartMarkers";
import { CHART_RENDER_BAR_LIMIT } from "@/features/chart/chartViewWindow";
import { useWorkbench } from "@/shared/context/WorkbenchContext";

export function ChartPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const {
    chartCandles,
    chartEma,
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
  } = useWorkbench();

  const trades = selectedVariant?.trade_records ?? [];
  const selectedTrade = trades.find((t) => t.trade_id === selectedTradeId);
  const rangeWarning =
    selectedTrade && tradeOutsideCandleRange(selectedTrade.entry_time_ms, fullCandleRange);

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
    return `${windowNote} · OHLC + chart overlay EMA(${CHART_EMA_PERIOD}) · trade markers from report`;
  }, [candlesSource, chartCandles.length, marketCandlesCount]);

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

    const emaSeries = chart.addSeries(LineSeries, {
      color: "#38bdf8",
      lineWidth: 2,
      title: `EMA ${CHART_EMA_PERIOD} (overlay)`,
    });

    chartRef.current = chart;
    seriesRef.current = series;
    emaSeriesRef.current = emaSeries;
    markersRef.current = createSeriesMarkers(series);

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
      emaSeriesRef.current = null;
      markersRef.current = null;
    };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    const emaSeries = emaSeriesRef.current;
    const chart = chartRef.current;
    const markersPlugin = markersRef.current;
    if (!series || !emaSeries || !chart || !markersPlugin || !selectedVariant) return;

    series.setData(toCandlestickSeriesData(chartCandles));
    emaSeries.setData(
      chartEma.map((p) => ({
        time: p.time as Time,
        value: p.value,
      })),
    );

    const markers = buildTradeMarkersForView(
      selectedVariant.trade_records,
      selectedTradeId,
      chartCandles,
    );
    markersPlugin.setMarkers(markers);

    chart.timeScale().fitContent();
  }, [chartCandles, chartEma, selectedVariant, selectedTradeId]);

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
      <div ref={containerRef} className="chart-canvas" />
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
