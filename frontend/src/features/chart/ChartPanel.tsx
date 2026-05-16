import {
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Time,
} from "lightweight-charts";
import { useEffect, useMemo, useRef } from "react";

import { ChartMarkerLegend } from "@/features/chart/ChartMarkerLegend";
import { toCandlestickSeriesData, tradeFocusHalfWindowSec } from "@/features/chart/chartCandleUtils";
import { buildTradeMarkers, candleRangeMs, tradeOutsideCandleRange } from "@/features/chart/chartMarkers";
import { useWorkbench } from "@/shared/context/WorkbenchContext";

const STUB_CANDLES_BANNER =
  "Report loaded. Candles are fixture/stub until market API is connected.";

export function ChartPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const { candles, candlesSource, selectedVariant, selectedTradeId, selectTrade } = useWorkbench();

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

    chartRef.current = chart;
    seriesRef.current = series;
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
      markersRef.current = null;
    };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    const markersPlugin = markersRef.current;
    if (!series || !chart || !markersPlugin || !selectedVariant) return;

    series.setData(toCandlestickSeriesData(candles));
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
  }, [candles, selectedVariant, selectedTradeId, focusHalfWindowSec]);

  if (!selectedVariant) {
    return null;
  }

  return (
    <section className="panel chart-panel">
      <div className="panel__header">
        <h2>Chart</h2>
        <p className="panel__hint">Trade markers from loaded report · OHLC from {candlesSource}</p>
      </div>
      {candlesSource === "fixture" && (
        <p className="banner banner--info" role="status">
          {STUB_CANDLES_BANNER}
        </p>
      )}
      <ChartMarkerLegend />
      {rangeWarning && (
        <p className="banner banner--warn" role="status">
          Selected trade entry is outside the loaded candle range (fixture overlap check).
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
