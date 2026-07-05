import type { ChartLogicalRange } from "@/features/chart/chartViewport";
import type { ChartBar } from "@/api/types";
import { resolveAnchorTimeFromVisibleRange } from "@/features/chart/chartViewport";
import type { ChartNavigationKey, ChartInteractionEvent } from "@/features/chart/runtime/types";
import { dbgMark, PIPELINE_DEBUG_STEPS as DBG } from "@/shared/diagnostics/pipelineDebug";

const CHART_NAVIGATION_KEYS: readonly ChartNavigationKey[] = [
  "ArrowLeft",
  "ArrowRight",
  "PageUp",
  "PageDown",
  "Home",
  "End",
];

const CHART_DOCUMENT_NAVIGATION_KEYS: readonly ChartNavigationKey[] = [
  "ArrowLeft",
  "ArrowRight",
  "PageUp",
  "PageDown",
];

export type ChartKeyboardListenerScope = "chart_surface" | "document";

export type ChartKeyboardKeydownDecision = {
  accepted: boolean;
  rejectionReason: string | null;
  key: ChartNavigationKey | null;
  listenerScope: ChartKeyboardListenerScope;
};

export function isChartNavigationKey(key: string): key is ChartNavigationKey {
  return (CHART_NAVIGATION_KEYS as readonly string[]).includes(key);
}

export function isChartDocumentNavigationKey(key: string): key is ChartNavigationKey {
  return (CHART_DOCUMENT_NAVIGATION_KEYS as readonly string[]).includes(key);
}

function isBlockedKeyboardTarget(target: HTMLElement): boolean {
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || tag === "BUTTON") {
    return true;
  }
  if (target.isContentEditable) {
    return true;
  }
  if (target.closest(".composer-panel, .reports-panel, [role='dialog']")) {
    return true;
  }
  return false;
}

export function evaluateChartKeyboardKeydown(
  event: KeyboardEvent,
  context: {
    listenerScope: ChartKeyboardListenerScope;
    chartTabActive: boolean;
    chartCanvas?: HTMLElement | null;
  },
): ChartKeyboardKeydownDecision {
  const { listenerScope, chartTabActive, chartCanvas } = context;
  const active = document.activeElement;
  const target = event.target;

  const reject = (rejectionReason: string): ChartKeyboardKeydownDecision => ({
    accepted: false,
    rejectionReason,
    key: null,
    listenerScope,
  });

  if (!chartTabActive) {
    return reject("inactive_chart_tab");
  }
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
    return reject("modifier");
  }

  const navigationKey =
    listenerScope === "document"
      ? isChartDocumentNavigationKey(event.key)
      : isChartNavigationKey(event.key);
  if (!navigationKey) {
    return reject("unsupported_key");
  }

  if (listenerScope === "chart_surface" && chartCanvas) {
    if (active !== chartCanvas && !chartCanvas.contains(active)) {
      return reject("not_focused");
    }
  }

  if (target instanceof HTMLElement && isBlockedKeyboardTarget(target)) {
    return reject(
      target.isContentEditable ? "content_editable" : "editable_target",
    );
  }

  return {
    accepted: true,
    rejectionReason: null,
    key: event.key as ChartNavigationKey,
    listenerScope,
  };
}

export function handleChartNavigationKeydown(
  event: KeyboardEvent,
  options: {
    listenerScope: ChartKeyboardListenerScope;
    chartTabActive: boolean;
    chartCanvas?: HTMLElement | null;
    adapter: Pick<ChartInteractionAdapter, "onKeyboardPanStart">;
  },
): void {
  if (options.listenerScope === "document" && !options.chartTabActive) {
    return;
  }
  if (
    options.listenerScope === "document" &&
    !isChartDocumentNavigationKey(event.key)
  ) {
    return;
  }

  const active = document.activeElement;
  const target = event.target;
  const decision = evaluateChartKeyboardKeydown(event, {
    listenerScope: options.listenerScope,
    chartTabActive: options.chartTabActive,
    chartCanvas: options.chartCanvas,
  });

  dbgMark(DBG.keyboard.keydownDecision, {
    key: event.key,
    code: event.code,
    targetTagName: target instanceof Element ? target.tagName : null,
    activeElementTag: active instanceof Element ? active.tagName : null,
    activeElementClass: active instanceof Element ? String(active.className) : null,
    listenerScope: decision.listenerScope,
    accepted: decision.accepted,
    rejectionReason: decision.rejectionReason,
    chartTabActive: options.chartTabActive,
    chartContainerFocused: options.chartCanvas
      ? active === options.chartCanvas || options.chartCanvas.contains(active)
      : null,
  });

  if (decision.accepted && decision.key) {
    options.adapter.onKeyboardPanStart(decision.key);
  }
}

export type ChartInteractionDispatch = (event: ChartInteractionEvent) => void;

export type ChartInteractionAdapterOptions = {
  dispatch: ChartInteractionDispatch;
  getCandles: () => readonly ChartBar[];
  shouldSuppressRangeEvent: () => boolean;
};

export type ChartInteractionAdapter = {
  onPointerDown: () => void;
  onPointerUp: () => void;
  onWheel: () => void;
  onKeyboardPanStart: (key: ChartNavigationKey) => void;
  onProgrammaticViewportStart: () => void;
  onProgrammaticViewportEnd: () => void;
  onVisibleLogicalRangeChange: (visible: ChartLogicalRange | null) => void;
  dispose: () => void;
};

export function createChartInteractionAdapter(
  options: ChartInteractionAdapterOptions,
): ChartInteractionAdapter {
  const { dispatch, getCandles, shouldSuppressRangeEvent } = options;

  return {
    onPointerDown() {
      dispatch({ type: "pointerdown" });
    },
    onPointerUp() {
      dispatch({ type: "pointerup" });
    },
    onWheel() {
      dispatch({ type: "wheel" });
    },
    onKeyboardPanStart(key) {
      dbgMark(DBG.keyboard.panStartDispatched, {
        key,
        eventType: "keyboard_pan_start",
      });
      dispatch({ type: "keyboard_pan_start", key });
    },
    onProgrammaticViewportStart() {
      dispatch({ type: "programmatic_viewport_start" });
    },
    onProgrammaticViewportEnd() {
      dispatch({ type: "programmatic_viewport_end" });
    },
    onVisibleLogicalRangeChange(visible) {
      if (!visible || shouldSuppressRangeEvent()) {
        return;
      }
      const candles = getCandles();
      const anchorTimeSec = resolveAnchorTimeFromVisibleRange(visible, candles);
      dispatch({
        type: "visible_range_changed",
        visible,
        anchorTimeSec,
      });
    },
    dispose() {},
  };
}
