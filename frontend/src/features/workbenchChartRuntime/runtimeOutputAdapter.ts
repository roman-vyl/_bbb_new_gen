import type {
  ChartRuntimeCompatibilityInput,
  ChartRuntimeMarketOutput,
  ChartRuntimeOutput,
  ChartRuntimeTraceOutput,
} from "./runtimeTypes";

export type ChartRuntimeCompatibilityOutput = ChartRuntimeCompatibilityInput & {
  chartViewModel: ChartRuntimeOutput["chartViewModel"];
  market: ChartRuntimeMarketOutput;
  trace: ChartRuntimeTraceOutput;
  display: ChartRuntimeOutput["display"];
  overlays: ChartRuntimeOutput["overlays"];
  viewport: ChartRuntimeOutput["viewport"];
  interaction: ChartRuntimeOutput["interaction"];
};

export function createChartRuntimeCompatibilityOutput(
  runtime: ChartRuntimeOutput,
  compatibility: ChartRuntimeCompatibilityInput,
): ChartRuntimeCompatibilityOutput {
  return {
    ...compatibility,
    chartViewModel: runtime.chartViewModel,
    market: runtime.market,
    trace: runtime.trace,
    display: runtime.display,
    overlays: runtime.overlays,
    viewport: runtime.viewport,
    interaction: runtime.interaction,
  };
}
