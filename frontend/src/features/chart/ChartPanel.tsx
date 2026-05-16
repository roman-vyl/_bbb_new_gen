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
import { toCandlestickSeriesData, tradeFocusHalfWindowSec } from "@/features/chart/chartCandleUtils";
import { buildTradeMarkers, candleRangeMs, tradeOutsideCandleRange } from "@/features/chart/chartMarkers";
import { useWorkbench } from "@/shared/context/WorkbenchContext";

export function ChartPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const {
    candles,
    emaPoints,
    candlesSource,
    marketError,
    timeframeMismatch,
    reportTimeframe,
    chartTimeframe,
    selectedVariant,
    selectedTradeId,
    selectTrade,
  } = useWorkbench();

  const focusHalfWindowSec = useMemo(() => tradeFocusHalfWindowSec(candles), [candles]);

  const range = candleRangeMs(candles);
  const trades = selectedVariant?.trade_records ?? [];
  const selectedTrade = trades.find((t) => t.trade_id === selectedTradeId);
  const rangeWarning =
    selectedTrade && tradeOutsideCandleRange(selectedTrade.entry_time_ms, range);

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
      title: `EMA ${CHART_EMA_PERIOD}`,
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

    series.setData(toCandlestickSeriesData(candles));
    emaSeries.setData(
      emaPoints.map((p) => ({
        time: p.time as Time,
        value: p.value,
      })),
    );

    const markers = buildTradeMarkers(selectedVariant.trade_records, selectedTradeId);
    markersPlugin.setMarkers(markers);

    if (selectedTradeId !== null) {
      const trade = selectedVariant.trade_records.find((t) => t.trade_id === selectedTradeId);
      if (trade) {
        const center = Math.floor(trade.entry_time_ms / 1000);
        chart.timeScale().setVisibleRange({
          from: (center - focusHalfWindowSec) as Time,
          to: (center + focusHalfWindowSec) as Time,
        });
        return;
      }
    }

    chart.timeScale().fitContent();
  }, [candles, emaPoints, selectedVariant, selectedTradeId, focusHalfWindowSec]);

  if (!selectedVariant) {
    return null;
  }

  return (
    <section className="panel chart-panel">
      <div className="panel__header">
        <h2>Chart</h2>
        <p className="panel__hint">
          OHLC + EMA({CHART_EMA_PERIOD}) from {candlesSource} · markers from report
        </p>
      </div>
      {timeframeMismatch && reportTimeframe !== null && (
        <p className="banner banner--warn" role="status">
          Report timeframe ({reportTimeframe}) differs from chart timeframe ({chartTimeframe}).
        </p>
      )}
      {marketError !== null && (
        <p className="banner banner--warn" role="status">
          Market data unavailable: {marketError}
        </p>
      )}
      <ChartMarkerLegend />
      {rangeWarning && (
        <p className="banner banner--warn" role="status">
          Selected trade entry is outside the loaded candle range.
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
