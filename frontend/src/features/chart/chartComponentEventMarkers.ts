import type { SeriesMarker, Time } from "lightweight-charts";

import type { ComponentEventMarker, ComponentEventMarkerRole } from "@/api/types";

export const COMPONENT_EVENT_MARKER_LEGEND: {
  role: ComponentEventMarkerRole;
  label: string;
  description: string;
}[] = [
  {
    role: "entry_block",
    label: "X-RSI",
    description: "Entry blocked (RSI extreme lookback)",
  },
  {
    role: "exit_signal",
    label: "RSI↓/↑",
    description: "RSI exit condition active on bar",
  },
];

type MarkerStyle = {
  color: string;
  shape: "circle" | "square";
  position: "aboveBar" | "belowBar";
};

function styleForRole(role: ComponentEventMarkerRole, side: "long" | "short"): MarkerStyle {
  if (role === "entry_block") {
    return {
      color: "#fb923c",
      shape: "circle",
      position: side === "long" ? "aboveBar" : "belowBar",
    };
  }
  return {
    color: "#a78bfa",
    shape: "square",
    position: side === "long" ? "aboveBar" : "belowBar",
  };
}

export function buildComponentEventMarkers(
  markers: readonly ComponentEventMarker[],
  options: {
    showEntryBlock: boolean;
    showExitSignal: boolean;
  },
): SeriesMarker<Time>[] {
  const out: SeriesMarker<Time>[] = [];
  for (const marker of markers) {
    if (marker.role === "entry_block" && !options.showEntryBlock) {
      continue;
    }
    if (marker.role === "exit_signal" && !options.showExitSignal) {
      continue;
    }
    const style = styleForRole(marker.role, marker.side);
    out.push({
      time: marker.time as Time,
      position: style.position,
      color: style.color,
      shape: style.shape,
      text: marker.label,
    });
  }
  return out.sort((a, b) => (a.time as number) - (b.time as number));
}

export function filterComponentEventMarkersToTimeRange(
  markers: readonly ComponentEventMarker[],
  fromSec: number,
  toSec: number,
): ComponentEventMarker[] {
  return markers.filter((marker) => marker.time >= fromSec && marker.time <= toSec);
}

export function buildComponentEventMarkersForView(
  markers: readonly ComponentEventMarker[],
  options: {
    showEntryBlock: boolean;
    showExitSignal: boolean;
    viewCandles: { time: number }[];
  },
): SeriesMarker<Time>[] {
  if (options.viewCandles.length === 0) {
    return [];
  }
  const fromSec = options.viewCandles[0]!.time;
  const toSec = options.viewCandles[options.viewCandles.length - 1]!.time;
  const inView = filterComponentEventMarkersToTimeRange(markers, fromSec, toSec);
  return buildComponentEventMarkers(inView, {
    showEntryBlock: options.showEntryBlock,
    showExitSignal: options.showExitSignal,
  });
}

export function componentEventMarkerTooltip(marker: ComponentEventMarker): string {
  if (marker.tooltip) {
    return marker.tooltip;
  }
  return `${marker.role} · ${marker.component_id} · ${marker.instance_id}`;
}

export function hasHtfAlignedComponentMarkers(
  markers: readonly ComponentEventMarker[],
): boolean {
  return markers.some((marker) => marker.source_timeframe !== marker.base_timeframe);
}
