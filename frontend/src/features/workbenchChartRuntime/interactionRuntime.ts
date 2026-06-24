import type { ChartRuntimeInteractionOutput } from "./runtimeTypes";

export type InteractionRuntimeBoundary = {
  implemented: false;
  interaction: ChartRuntimeInteractionOutput;
};

export function createInteractionRuntimeBoundary(): InteractionRuntimeBoundary {
  return {
    implemented: false,
    interaction: {
      dispatch() {
        // Phase 2 skeleton: live ChartPanel dispatch is intentionally not connected.
      },
    },
  };
}
