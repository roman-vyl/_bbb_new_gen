export type ChartDataKeyParams = {
  firstTimeSec: number | null;
  lastTimeSec: number | null;
  count: number;
  selectedTradeId: number | string | null;
  centerTimeSec: number | null;
};

export type ChartSeriesDataKeyParams = Pick<
  ChartDataKeyParams,
  "firstTimeSec" | "lastTimeSec" | "count"
>;

/** Key for candle/EMA series setData — render window bounds only (excludes trade focus). */
export function buildChartSeriesDataKey(params: ChartSeriesDataKeyParams): string {
  if (params.count === 0 || params.firstTimeSec === null || params.lastTimeSec === null) {
    return "";
  }
  return `${params.firstTimeSec}:${params.lastTimeSec}:${params.count}`;
}

/** Stable key for chart series updates / fitContent (excludes selected bar clicks). */
export function buildChartDataKey(params: ChartDataKeyParams): string {
  const seriesKey = buildChartSeriesDataKey(params);
  if (seriesKey === "") {
    return "";
  }
  const tradePart = params.selectedTradeId === null ? "none" : String(params.selectedTradeId);
  const centerPart = params.centerTimeSec === null ? "none" : String(params.centerTimeSec);
  return `${seriesKey}:trade=${tradePart}:center=${centerPart}`;
}
