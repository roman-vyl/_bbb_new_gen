import {
  createRenderWindowController,
  type RenderWindowController,
  type RenderWindowControllerConfig,
} from "@/features/chart/runtime/renderWindowController";
import { createViewportController, type ViewportController } from "@/features/chart/runtime/viewportController";
import { resetTraceFetchCoalescer } from "@/features/chart/runtime/traceDisplayOrchestrator";
import type { ChartInteractionEvent, WindowCommitResult } from "@/features/chart/runtime/types";

export type ChartRuntimeConfig = {
  renderWindow?: RenderWindowControllerConfig;
};

export type ChartRuntime = {
  renderWindow: RenderWindowController;
  viewport: ViewportController;
  dispatchInteraction(event: ChartInteractionEvent): void;
  reset(): void;
};

export function createChartRuntime(config: ChartRuntimeConfig = {}): ChartRuntime {
  const viewport = createViewportController();
  const renderWindow = createRenderWindowController({
    ...config.renderWindow,
    onCommit: (commit) => {
      config.renderWindow?.onCommit?.(commit);
      viewport.onWindowSwapCommitted({
        anchorTimeSec: commit.anchorTimeSec,
        previousVisible: commit.previousVisible,
        tradeFocusPending: false,
        entryTimeSec: null,
      });
    },
  });

  function dispatchInteraction(event: ChartInteractionEvent): void {
    renderWindow.dispatch(event);
    viewport.dispatch(event);

    if (event.type === "visible_range_changed" && event.anchorTimeSec !== null) {
      renderWindow.recordBoundaryIntent(event.visible, event.anchorTimeSec);
    }
  }

  return {
    renderWindow,
    viewport,
    dispatchInteraction,
    reset() {
      renderWindow.flushIdleCommitTimer();
      resetTraceFetchCoalescer();
    },
  };
}

export type { WindowCommitResult };
