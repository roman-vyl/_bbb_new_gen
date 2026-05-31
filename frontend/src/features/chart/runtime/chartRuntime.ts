import {
  createRenderWindowController,
  type RenderWindowController,
  type RenderWindowControllerConfig,
} from "@/features/chart/runtime/renderWindowController";
import { createViewportController, type ViewportController } from "@/features/chart/runtime/viewportController";
import { resetTraceFetchCoalescer } from "@/features/chart/runtime/traceDisplayOrchestrator";
import type {
  ChartInteractionEvent,
  ViewportCommand,
  WindowCommitResult,
} from "@/features/chart/runtime/types";
import type { ChartViewMode } from "@/features/chart/chartViewWindow";

export type ChartRuntimeConfig = {
  renderWindow?: RenderWindowControllerConfig;
};

export type ChartRuntime = {
  renderWindow: RenderWindowController;
  viewport: ViewportController;
  dispatchInteraction(event: ChartInteractionEvent): ViewportCommand | null;
  setViewportPlan(mode: ChartViewMode, centerTimeSec: number | null): void;
  reset(): void;
};

export function createChartRuntime(config: ChartRuntimeConfig = {}): ChartRuntime {
  const viewport = createViewportController();
  const renderWindow = createRenderWindowController({
    ...config.renderWindow,
    onCommit: (commit) => {
      config.renderWindow?.onCommit?.(commit);
    },
  });

  function dispatchInteraction(event: ChartInteractionEvent): ViewportCommand | null {
    renderWindow.dispatch(event);
    const viewportCommand = viewport.dispatch(event);

    if (event.type === "visible_range_changed" && event.anchorTimeSec !== null) {
      renderWindow.recordBoundaryIntent(event.visible, event.anchorTimeSec);
    }

    return viewportCommand;
  }

  return {
    renderWindow,
    viewport,
    dispatchInteraction,
    setViewportPlan(mode: ChartViewMode, centerTimeSec: number | null) {
      viewport.setPlan(mode, centerTimeSec);
    },
    reset() {
      renderWindow.flushIdleCommitTimer();
      resetTraceFetchCoalescer();
    },
  };
}

export type { WindowCommitResult };
