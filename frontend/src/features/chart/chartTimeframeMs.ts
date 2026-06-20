/** Mirrors `data_engine/contracts/timeframes.py` — bar duration in ms. */

const TIMEFRAME_MS_BY_ID: Readonly<Record<string, number>> = {
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};

export const SUPPORTED_CHART_TIMEFRAMES = Object.freeze(
  Object.keys(TIMEFRAME_MS_BY_ID),
) as readonly string[];

export function resolveChartTimeframeMs(chartTimeframe: string): number {
  const key = chartTimeframe.trim();
  const ms = TIMEFRAME_MS_BY_ID[key];
  if (ms === undefined) {
    throw new Error(
      `unsupported chart timeframe ${JSON.stringify(chartTimeframe)}; supported: ${SUPPORTED_CHART_TIMEFRAMES.join(", ")}`,
    );
  }
  return ms;
}
