import type { ChartRuntimeViewportOutput } from "./runtimeTypes";

function noop(): void {
  // Phase 2 skeleton: viewport commands are intentionally inert.
}

export type ViewportRuntimeBoundary = {
  implemented: false;
  viewport: ChartRuntimeViewportOutput;
};

export function createViewportRuntimeBoundary(): ViewportRuntimeBoundary {
  return {
    implemented: false,
    viewport: {
      command: null,
      commandSeq: 0,
      acknowledge: noop,
      isWindowSwapTransactionCancelled: () => false,
      settleWindowSwapCommit: noop,
    },
  };
}
