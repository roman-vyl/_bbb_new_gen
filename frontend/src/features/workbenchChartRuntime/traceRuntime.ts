import type { ChartRuntimeTraceOutput } from "./runtimeTypes";

export type TraceRuntimeBoundary = {
  implemented: false;
  trace: ChartRuntimeTraceOutput;
  displayRequestKey: string | null;
  denseRequestKey: string | null;
};

export function createTraceRuntimeBoundary(): TraceRuntimeBoundary {
  return {
    implemented: false,
    trace: {
      lanesSignalTrace: null,
      lanesSignalTraceStatus: "idle",
      lanesSignalTraceError: null,
    },
    displayRequestKey: null,
    denseRequestKey: null,
  };
}
