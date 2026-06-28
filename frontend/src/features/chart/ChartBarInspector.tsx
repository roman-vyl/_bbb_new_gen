import type { ChartBar, ChartEmaOverlay } from "@/api/types";
import {
  candleAtTime,
  emaValuesAtBar,
  formatChartPrice,
  ohlcPriceDecimals,
} from "@/features/chart/signalTraceLookup";

type ChartBarInspectorProps = {
  selectedBarTimeSec: number | null;
  candles: ChartBar[];
  emaOverlays: ChartEmaOverlay[];
  onClear: () => void;
};

export function ChartBarInspector({
  selectedBarTimeSec,
  candles,
  emaOverlays,
  onClear,
}: ChartBarInspectorProps) {
  if (selectedBarTimeSec === null) {
    return (
      <aside className="bar-inspector bar-inspector--empty">
        <h3>Bar Inspector</h3>
        <p className="bar-inspector__hint">Click a candle to inspect price and EMA values.</p>
      </aside>
    );
  }

  const candle = candleAtTime(candles, selectedBarTimeSec);
  const ema = emaValuesAtBar(emaOverlays, selectedBarTimeSec);
  const priceDecimals = candle ? ohlcPriceDecimals(candle) : 0;
  const timeLabel = new Date(selectedBarTimeSec * 1000).toISOString().replace("T", " ").slice(0, 19);

  return (
    <aside className="bar-inspector">
      <div className="bar-inspector__header">
        <h3>Bar Inspector</h3>
        <button type="button" className="link-btn" onClick={onClear}>
          Clear
        </button>
      </div>
      <p className="bar-inspector__time">
        <strong>Time</strong> {timeLabel} UTC
      </p>
      {candle && (
        <dl className="bar-inspector__dl">
          <dt>OHLC</dt>
          <dd>
            O {formatChartPrice(candle.open, priceDecimals)} H{" "}
            {formatChartPrice(candle.high, priceDecimals)} L{" "}
            {formatChartPrice(candle.low, priceDecimals)} C{" "}
            {formatChartPrice(candle.close, priceDecimals)}
          </dd>
          <dt>EMA fast / anchor / slow</dt>
          <dd>
            {formatChartPrice(ema.fast, priceDecimals)} / {formatChartPrice(ema.anchor, priceDecimals)}{" "}
            / {formatChartPrice(ema.slow, priceDecimals)}
          </dd>
        </dl>
      )}
    </aside>
  );
}
