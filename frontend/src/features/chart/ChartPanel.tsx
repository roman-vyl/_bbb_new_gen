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
import { ChartMarkerLegend } from "@/features/chart/ChartMarkerLegend";
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
  } = useWorkbench();

  const trades = selectedVariant?.trade_records ?? [];
  const selectedTrade = trades.find((t) => t.trade_id === selectedTradeId);
  const rangeWarning =
    selectedTrade && tradeOutsideCandleRange(selectedTrade.entry_time_ms, fullCandleRange);

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
    return `${windowNote} · ${emaNote} · trade markers from report`;
  }, [candlesSource, chartCandles.length, marketCandlesCount, stackPeriodsLabel]);

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
      });
    }

    chartRef.current = chart;
    seriesRef.current = series;
    emaSeriesByRoleRef.current = emaSeriesByRole;
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
      emaSeriesByRoleRef.current = {};
      markersRef.current = null;
    };
  }, []);

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

    chart.timeScale().fitContent();
  }, [chartCandles, chartEmaOverlays, selectedVariant, selectedTradeId]);

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
