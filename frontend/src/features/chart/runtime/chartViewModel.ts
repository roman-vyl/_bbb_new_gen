import type { ChartViewModelInput } from "@/features/chart/runtime/types";

/** Pure projection of chart-facing display state for renderer and inspector consumers. */
export type ChartViewModel = ChartViewModelInput & {
  seriesKey: string;
};

export function buildChartViewModel(input: ChartViewModelInput): ChartViewModel {
  const seriesKey = [
    input.firstTimeSec ?? "",
    input.lastTimeSec ?? "",
    input.count,
    input.viewMode,
    input.centerTimeSec ?? "",
  ].join(":");

  return {
    ...input,
    seriesKey,
  };
}
