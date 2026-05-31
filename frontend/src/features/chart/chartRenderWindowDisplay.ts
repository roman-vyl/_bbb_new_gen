import type { ChartAuxEmaOverlay, ChartBar, ComponentEvent } from "@/api/types";
import { filterComponentEventsToTimeRange } from "@/features/chart/chartComponentEvents";
import { sliceAuxOverlaysToCandleWindow } from "@/features/chart/chartAuxEmaOverlays";

export type CandleTimeBounds = {
  fromSec: number;
  toSec: number;
};

export function candleTimeBounds(candles: readonly ChartBar[]): CandleTimeBounds | null {
  if (candles.length === 0) {
    return null;
  }
  return {
    fromSec: candles[0]!.time,
    toSec: candles[candles.length - 1]!.time,
  };
}

/** Re-slice aux overlays (incl. frozen HTF source) to current render-window candles. */
export function displayAuxOverlaysForRenderWindow(
  slicedOverlays: readonly ChartAuxEmaOverlay[],
  frozenHtfOverlays: readonly ChartAuxEmaOverlay[],
  traceMatchesWindow: boolean,
  renderWindowCandles: readonly ChartBar[],
): ChartAuxEmaOverlay[] {
  const bffOverlays = slicedOverlays.filter((overlay) => !overlay.id.startsWith("htf_"));
  const htfFromSlice = slicedOverlays.filter((overlay) => overlay.id.startsWith("htf_"));

  const htfSource =
    !traceMatchesWindow && frozenHtfOverlays.length > 0 ? frozenHtfOverlays : htfFromSlice;

  const htfDisplay =
    renderWindowCandles.length === 0
      ? []
      : sliceAuxOverlaysToCandleWindow(htfSource, renderWindowCandles);

  return [...bffOverlays, ...htfDisplay];
}

/** Filter component events (incl. frozen stale source) to current render-window bounds. */
export function displayComponentEventsForRenderWindow(
  traceEvents: readonly ComponentEvent[],
  frozenEvents: readonly ComponentEvent[],
  traceMatchesWindow: boolean,
  renderWindowCandles: readonly ChartBar[],
): ComponentEvent[] {
  const bounds = candleTimeBounds(renderWindowCandles);
  if (!bounds) {
    return [];
  }

  const { fromSec, toSec } = bounds;
  const liveSlice = filterComponentEventsToTimeRange(traceEvents, fromSec, toSec);

  if (traceMatchesWindow) {
    return liveSlice;
  }

  if (frozenEvents.length > 0) {
    return filterComponentEventsToTimeRange(frozenEvents, fromSec, toSec);
  }

  return liveSlice;
}

/** Pick frozen HTF snapshot to store when trace matches current window key. */
export function frozenHtfOverlaysForStorage(
  slicedOverlays: readonly ChartAuxEmaOverlay[],
): ChartAuxEmaOverlay[] {
  return slicedOverlays.filter((overlay) => overlay.id.startsWith("htf_"));
}

/** Pick component events snapshot to store when trace matches current window key. */
export function frozenComponentEventsForStorage(
  events: readonly ComponentEvent[],
): ComponentEvent[] {
  return [...events];
}

/** Stable array reference when render-window bounds are unchanged. */
export function stabilizeByWindowBoundsKey<T>(
  cacheRef: { current: { key: string; value: T } },
  boundsKey: string,
  nextValue: T,
): T {
  if (boundsKey !== "" && cacheRef.current.key === boundsKey) {
    return cacheRef.current.value;
  }
  cacheRef.current = { key: boundsKey, value: nextValue };
  return nextValue;
}

export function buildRenderWindowBoundsKey(
  firstTimeSec: number | null,
  lastTimeSec: number | null,
  count: number,
): string {
  if (count === 0 || firstTimeSec === null || lastTimeSec === null) {
    return "";
  }
  return `${firstTimeSec}:${lastTimeSec}:${count}`;
}

/** Bounds key for aux overlay stabilize cache — must change when HTF/BFF points arrive without pan. */
export function buildAuxOverlaysStabilizeKey(
  boundsKey: string,
  overlays: readonly ChartAuxEmaOverlay[],
): string {
  if (boundsKey === "") {
    return "";
  }
  const fingerprint = overlays.map((o) => `${o.id}:${o.points.length}`).join("|");
  return `${boundsKey}|${fingerprint}`;
}
