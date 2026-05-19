export type ChartDataKeyParams = {
  firstTimeSec: number | null;
  lastTimeSec: number | null;
  count: number;
  selectedTradeId: number | string | null;
  centerTimeSec: number | null;
};

/** Stable key for chart series updates / fitContent (excludes selected bar clicks). */
export function buildChartDataKey(params: ChartDataKeyParams): string {
  if (params.count === 0 || params.firstTimeSec === null || params.lastTimeSec === null) {
    return "";
  }
  const tradePart = params.selectedTradeId === null ? "none" : String(params.selectedTradeId);
  const centerPart = params.centerTimeSec === null ? "none" : String(params.centerTimeSec);
  return `${params.firstTimeSec}:${params.lastTimeSec}:${params.count}:trade=${tradePart}:center=${centerPart}`;
}
