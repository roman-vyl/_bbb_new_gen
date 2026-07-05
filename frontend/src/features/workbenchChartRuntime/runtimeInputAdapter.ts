import type { ChartRuntimeFocusIntent, ChartRuntimeInput } from "./runtimeTypes";

export type RuntimeInputAdapterSource = Omit<ChartRuntimeInput, "chartFocusIntent"> & {
  chartFocusIntent?: ChartRuntimeFocusIntent;
};

export function createChartRuntimeInput(source: RuntimeInputAdapterSource): ChartRuntimeInput {
  return {
    ...source,
    chartFocusIntent: source.chartFocusIntent ?? { type: "none" },
  };
}
