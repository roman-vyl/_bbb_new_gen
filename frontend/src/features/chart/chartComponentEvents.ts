import type { SeriesMarker, Time } from "lightweight-charts";

import type { ComponentEvent, ComponentEventRole, ComponentEventType } from "@/api/types";

export const COMPONENT_EVENT_LEGEND: {
  event_type: ComponentEventType;
  label: string;
  description: string;
}[] = [
  { event_type: "source", label: "◆", description: "Source — causal triggering bar" },
  { event_type: "span_start", label: "▶", description: "Span start — block/regime begins" },
  { event_type: "span_end", label: "■", description: "Span end — block/regime ends" },
  { event_type: "point", label: "□", description: "Point — one-shot event (exit, setup, trigger)" },
];

export const COMPONENT_EVENT_ROLE_LEGEND: {
  role: ComponentEventRole;
  label: string;
  description: string;
}[] = [
  { role: "entry_block", label: "entry_block", description: "Entry blocked span / source" },
  { role: "exit_signal", label: "exit_signal", description: "Exit signal point" },
];

type MarkerStyle = {
  color: string;
  shape: "circle" | "square" | "arrowUp" | "arrowDown";
  position: "aboveBar" | "belowBar";
};

function styleForEvent(
  event_type: ComponentEventType,
  role: ComponentEventRole,
  side: "long" | "short",
): MarkerStyle {
  const above = side === "long" ? "aboveBar" : "belowBar";
  if (role === "entry_block") {
    if (event_type === "source") {
      return { color: "#fbbf24", shape: "circle", position: above };
    }
    return { color: "#fb923c", shape: "circle", position: above };
  }
  return { color: "#a78bfa", shape: "square", position: above };
}

export function buildComponentEventChartMarkers(
  events: readonly ComponentEvent[],
  options: {
    showEntryBlock: boolean;
    showExitSignal: boolean;
  },
): SeriesMarker<Time>[] {
  const out: SeriesMarker<Time>[] = [];
  for (const event of events) {
    if (event.role === "entry_block" && !options.showEntryBlock) {
      continue;
    }
    if (event.role === "exit_signal" && !options.showExitSignal) {
      continue;
    }
    const style = styleForEvent(event.event_type, event.role, event.side);
    out.push({
      time: event.time as Time,
      position: style.position,
      color: style.color,
      shape: style.shape,
      text: event.label,
    });
  }
  return out.sort((a, b) => (a.time as number) - (b.time as number));
}

export function filterComponentEventsToTimeRange(
  events: readonly ComponentEvent[],
  fromSec: number,
  toSec: number,
): ComponentEvent[] {
  return events.filter((event) => event.time >= fromSec && event.time <= toSec);
}

export function buildComponentEventsForView(
  events: readonly ComponentEvent[],
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
  const inView = filterComponentEventsToTimeRange(events, fromSec, toSec);
  return buildComponentEventChartMarkers(inView, {
    showEntryBlock: options.showEntryBlock,
    showExitSignal: options.showExitSignal,
  });
}

export function componentEventTooltip(event: ComponentEvent): string {
  if (event.tooltip) {
    return event.tooltip;
  }
  return `${event.event_type} · ${event.role} · ${event.component_id} · ${event.instance_id}`;
}

export function hasHtfAlignedComponentEvents(events: readonly ComponentEvent[]): boolean {
  return events.some(
    (event) =>
      event.source_timeframe != null &&
      event.base_timeframe != null &&
      event.source_timeframe !== event.base_timeframe,
  );
}
