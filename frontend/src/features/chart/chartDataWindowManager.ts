import type {
  ChartAuxEmaOverlay,
  ChartBar,
  ChartEmaOverlay,
  ComponentEvent,
} from "@/api/types";
import { sliceAuxOverlaysToCandleWindow } from "@/features/chart/chartAuxEmaOverlays";
import { filterComponentEventsToTimeRange } from "@/features/chart/chartComponentEvents";
import {
  CHART_RENDER_SAFE_ZONE,
  CHART_RENDER_WINDOW_SIZE,
  sliceOverlaysToCandleWindow,
} from "@/features/chart/chartViewWindow";

export { CHART_RENDER_SAFE_ZONE, CHART_RENDER_WINDOW_SIZE } from "@/features/chart/chartViewWindow";

export type ChartLogicalRange = {
  from: number;
  to: number;
};

export type WindowBounds = {
  windowStartIndex: number;
  windowEndIndex: number;
};

export type ChartDataWindowManagerConfig = {
  renderWindowSize?: number;
  safeZoneSize?: number;
};

export type ChartDataWindowManager = {
  reset(fullLength: number): void;
  setFullLength(fullLength: number): void;
  offsetWindowStart(delta: number): WindowBounds | null;
  getWindowIndices(): WindowBounds;
  getWindowLength(): number;
  buildTailWindow(): WindowBounds | null;
  buildWindowAroundIndex(entryIndex: number): WindowBounds | null;
  shouldRebuildForTrade(entryIndex: number): boolean;
  isNearWindowBoundary(visible: ChartLogicalRange): boolean;
  maybeShiftWindowForVisibleRange(visible: ChartLogicalRange): WindowBounds | null;
  sliceCandles(candles: readonly ChartBar[]): ChartBar[];
  sliceEmaOverlays(
    overlays: readonly ChartEmaOverlay[],
    candles: readonly ChartBar[],
  ): ChartEmaOverlay[];
  sliceAuxOverlays(
    overlays: readonly ChartAuxEmaOverlay[],
    candles: readonly ChartBar[],
  ): ChartAuxEmaOverlay[];
  sliceComponentEvents(
    events: readonly ComponentEvent[],
    candles: readonly ChartBar[],
  ): ComponentEvent[];
};

function clampWindowStart(start: number, fullLength: number, windowSize: number): number {
  if (fullLength <= windowSize) {
    return 0;
  }
  return Math.max(0, Math.min(start, fullLength - windowSize));
}

function boundsEqual(a: WindowBounds, b: WindowBounds): boolean {
  return a.windowStartIndex === b.windowStartIndex && a.windowEndIndex === b.windowEndIndex;
}

function computeWindowAroundIndex(
  entryIndex: number,
  fullLength: number,
  windowSize: number,
): WindowBounds {
  if (fullLength === 0) {
    return { windowStartIndex: 0, windowEndIndex: 0 };
  }

  const size = Math.min(windowSize, fullLength);
  const clampedEntry = Math.max(0, Math.min(entryIndex, fullLength - 1));
  const half = Math.floor(size / 2);
  let start = clampedEntry - half;
  let end = start + size;

  if (start < 0) {
    start = 0;
    end = size;
  }
  if (end > fullLength) {
    end = fullLength;
    start = Math.max(0, end - size);
  }

  return { windowStartIndex: start, windowEndIndex: end };
}

function repositionWindowForVisibleCenter(
  current: WindowBounds,
  fullLength: number,
  windowSize: number,
  visible: ChartLogicalRange,
): WindowBounds {
  const size = Math.min(windowSize, fullLength);
  const visibleCenter = (visible.from + visible.to) / 2;
  const globalCenter = current.windowStartIndex + visibleCenter;
  const start = clampWindowStart(Math.floor(globalCenter - size / 2), fullLength, size);
  return { windowStartIndex: start, windowEndIndex: start + size };
}

export function createChartDataWindowManager(
  config: ChartDataWindowManagerConfig = {},
): ChartDataWindowManager {
  const renderWindowSize = config.renderWindowSize ?? CHART_RENDER_WINDOW_SIZE;
  const safeZoneSize = config.safeZoneSize ?? CHART_RENDER_SAFE_ZONE;

  let fullLength = 0;
  let windowStartIndex = 0;
  let windowEndIndex = 0;

  function currentBounds(): WindowBounds {
    return { windowStartIndex, windowEndIndex };
  }

  function applyBounds(next: WindowBounds): WindowBounds | null {
    if (boundsEqual(currentBounds(), next)) {
      return null;
    }
    windowStartIndex = next.windowStartIndex;
    windowEndIndex = next.windowEndIndex;
    return next;
  }

  function effectiveWindowSize(): number {
    return fullLength === 0 ? 0 : Math.min(renderWindowSize, fullLength);
  }

  return {
    reset(nextFullLength: number) {
      fullLength = Math.max(0, nextFullLength);
      windowStartIndex = 0;
      windowEndIndex = effectiveWindowSize();
    },

    setFullLength(nextFullLength: number) {
      fullLength = Math.max(0, nextFullLength);
      const size = effectiveWindowSize();
      if (windowEndIndex > fullLength) {
        windowEndIndex = fullLength;
        windowStartIndex = clampWindowStart(windowStartIndex, fullLength, size);
        windowEndIndex = windowStartIndex + size;
      }
    },

    offsetWindowStart(delta: number) {
      if (delta === 0 || fullLength === 0) {
        return null;
      }
      const size = effectiveWindowSize();
      const nextStart = clampWindowStart(windowStartIndex + delta, fullLength, size);
      return applyBounds({
        windowStartIndex: nextStart,
        windowEndIndex: nextStart + size,
      });
    },

    getWindowIndices: currentBounds,

    getWindowLength() {
      return windowEndIndex - windowStartIndex;
    },

    buildTailWindow() {
      if (fullLength === 0) {
        return applyBounds({ windowStartIndex: 0, windowEndIndex: 0 });
      }
      const size = effectiveWindowSize();
      return applyBounds({
        windowStartIndex: Math.max(0, fullLength - size),
        windowEndIndex: fullLength,
      });
    },

    buildWindowAroundIndex(entryIndex: number) {
      if (fullLength === 0) {
        return applyBounds({ windowStartIndex: 0, windowEndIndex: 0 });
      }
      return applyBounds(computeWindowAroundIndex(entryIndex, fullLength, renderWindowSize));
    },

    shouldRebuildForTrade(entryIndex: number) {
      if (fullLength === 0) {
        return false;
      }
      if (entryIndex < windowStartIndex || entryIndex >= windowEndIndex) {
        return true;
      }
      const offset = entryIndex - windowStartIndex;
      const windowLen = windowEndIndex - windowStartIndex;
      if (offset < safeZoneSize) {
        return true;
      }
      if (offset >= windowLen - safeZoneSize) {
        return true;
      }
      return false;
    },

    isNearWindowBoundary(visible: ChartLogicalRange) {
      const windowLen = windowEndIndex - windowStartIndex;
      if (windowLen <= 0) {
        return false;
      }
      if (visible.from < safeZoneSize) {
        return windowStartIndex > 0;
      }
      if (visible.to > windowLen - safeZoneSize) {
        return windowEndIndex < fullLength;
      }
      return false;
    },

    maybeShiftWindowForVisibleRange(visible: ChartLogicalRange) {
      const windowLen = windowEndIndex - windowStartIndex;
      if (windowLen <= 0 || fullLength === 0) {
        return null;
      }

      const nearLeft = visible.from < safeZoneSize && windowStartIndex > 0;
      const nearRight = visible.to > windowLen - safeZoneSize && windowEndIndex < fullLength;

      if (!nearLeft && !nearRight) {
        return null;
      }

      const next = repositionWindowForVisibleCenter(
        currentBounds(),
        fullLength,
        renderWindowSize,
        visible,
      );
      return applyBounds(next);
    },

    sliceCandles(candles: readonly ChartBar[]) {
      if (candles.length === 0 || windowEndIndex <= windowStartIndex) {
        return [];
      }
      return candles.slice(windowStartIndex, windowEndIndex);
    },

    sliceEmaOverlays(overlays: readonly ChartEmaOverlay[], candles: readonly ChartBar[]) {
      const windowCandles = this.sliceCandles(candles);
      return sliceOverlaysToCandleWindow(overlays, windowCandles);
    },

    sliceAuxOverlays(overlays: readonly ChartAuxEmaOverlay[], candles: readonly ChartBar[]) {
      const windowCandles = this.sliceCandles(candles);
      return sliceAuxOverlaysToCandleWindow(overlays, windowCandles);
    },

    sliceComponentEvents(events: readonly ComponentEvent[], candles: readonly ChartBar[]) {
      const windowCandles = this.sliceCandles(candles);
      if (windowCandles.length === 0) {
        return [];
      }
      const fromSec = windowCandles[0]!.time;
      const toSec = windowCandles[windowCandles.length - 1]!.time;
      return filterComponentEventsToTimeRange(events, fromSec, toSec);
    },
  };
}

/** Initial tail window placement (used when resetting without trade focus). */
export function buildInitialTailWindowBounds(
  fullLength: number,
  renderWindowSize: number = CHART_RENDER_WINDOW_SIZE,
): WindowBounds {
  if (fullLength === 0) {
    return { windowStartIndex: 0, windowEndIndex: 0 };
  }
  const size = Math.min(renderWindowSize, fullLength);
  return {
    windowStartIndex: Math.max(0, fullLength - size),
    windowEndIndex: fullLength,
  };
}
