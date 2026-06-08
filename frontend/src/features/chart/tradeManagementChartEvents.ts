import type { SeriesMarker, Time } from "lightweight-charts";

import { msToChartTime, type TradeManagementEvent, type TradeRecord } from "@/api/types";
import { filterMarkersToTimeRange } from "@/features/chart/chartMarkers";
import { tradeIdsEqual } from "@/features/chart/tradeLookup";

export const TRADE_MANAGEMENT_MARKER_LEGEND = [
  { kind: "phase_proven", label: "Proven", description: "Phase transition · proven" },
  { kind: "phase_protected", label: "Protected", description: "Phase transition · protected" },
  { kind: "phase_runner", label: "Runner", description: "Phase transition · runner" },
  { kind: "phase_exhaust", label: "Exhaust", description: "Phase transition · exhaustion" },
  { kind: "managed_stop", label: "Stop↑", description: "Active stop updated" },
  { kind: "managed_take", label: "Take", description: "Take profile updated" },
  { kind: "managed_runtime", label: "Runtime", description: "Runtime exit triggered" },
  { kind: "exit_rule", label: "Rule", description: "Exit rule triggered" },
  { kind: "exit_executed", label: "Exit", description: "Trade management exit executed" },
] as const;

/** Cap markers when no trade is selected to avoid chart spam. */
export const TRADE_MANAGEMENT_MAX_MARKERS_WITHOUT_SELECTION = 200;

export function hasTradeManagementEvents(
  events: readonly TradeManagementEvent[] | null | undefined,
): boolean {
  return Array.isArray(events) && events.length > 0;
}

export function phaseTransitionMarkerLabel(toPhase: string | null | undefined): string {
  switch (toPhase) {
    case "proven":
      return "Proven";
    case "protected":
      return "Protected";
    case "runner":
      return "Runner";
    case "exhaustion":
      return "Exhaust";
    default:
      return toPhase?.trim() ? toPhase : "?";
  }
}

function formatPct(value: number | null | undefined): string | null {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }
  return `${(value * 100).toFixed(2)}%`;
}

function metadataString(
  metadata: TradeManagementEvent["metadata"],
  key: string,
): string | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const raw = metadata[key];
  if (raw === null || raw === undefined) {
    return null;
  }
  return String(raw);
}

function exitLayerFromEvent(event: TradeManagementEvent, trade?: TradeRecord): string | null {
  if (trade?.trade_management?.exit_layer) {
    return trade.trade_management.exit_layer;
  }
  if (trade?.exit_kind) {
    return trade.exit_kind;
  }
  const exitReason = metadataString(event.metadata, "exit_reason");
  if (exitReason && exitReason.includes(":")) {
    return exitReason.split(":")[0] ?? null;
  }
  return null;
}

export function tradeManagementEventTooltip(
  event: TradeManagementEvent,
  trade?: TradeRecord,
): string {
  const lines: string[] = [`trade_id: ${event.trade_id}`];

  if (event.event_type === "phase_changed") {
    if (event.from_phase || event.to_phase) {
      lines.push(`phase: ${event.from_phase ?? "?"} → ${event.to_phase ?? "?"}`);
    }
    if (event.rule_id) {
      lines.push(`rule_id: ${event.rule_id}`);
    }
  }

  if (event.event_type === "active_stop_updated") {
    if (event.rule_id) {
      lines.push(`rule_id: ${event.rule_id}`);
    }
    if (event.component_id) {
      lines.push(`component_id: ${event.component_id}`);
    }
    if (event.stop_price !== null && event.stop_price !== undefined) {
      lines.push(`stop_price: ${event.stop_price}`);
    }
  }

  if (event.event_type === "active_take_updated") {
    if (event.rule_id) {
      lines.push(`rule_id: ${event.rule_id}`);
    }
    if (event.component_id) {
      lines.push(`component_id: ${event.component_id}`);
    }
    const action = metadataString(event.metadata, "action");
    if (action) {
      lines.push(`action: ${action}`);
    }
  }

  if (event.event_type === "runtime_exit_triggered") {
    if (event.rule_id) {
      lines.push(`rule_id: ${event.rule_id}`);
    }
    if (event.component_id) {
      lines.push(`component_id: ${event.component_id}`);
    }
  }

  if (event.event_type === "exit_rule_triggered" || event.event_type === "exit_executed") {
    const exitLayer = exitLayerFromEvent(event, trade);
    if (exitLayer) {
      lines.push(`exit_layer: ${exitLayer}`);
    }
    if (event.rule_id) {
      lines.push(`exit_rule_id: ${event.rule_id}`);
    }
    if (event.component_id) {
      lines.push(`exit_component_id: ${event.component_id}`);
    }
    const exitReason = metadataString(event.metadata, "exit_reason");
    if (exitReason) {
      lines.push(`exit_reason: ${exitReason}`);
    }
    if (event.from_phase) {
      lines.push(`phase_at_event: ${event.from_phase}`);
    }
    if (trade?.trade_management?.max_phase_reached) {
      lines.push(`max_phase: ${trade.trade_management.max_phase_reached}`);
    }
  }

  if (event.bar_index !== null && event.bar_index !== undefined) {
    lines.push(`bar_index: ${event.bar_index}`);
  }
  const mfe = formatPct(event.mfe_pct);
  if (mfe) {
    lines.push(`mfe_pct: ${mfe}`);
  }
  const mae = formatPct(event.mae_pct);
  if (mae) {
    lines.push(`mae_pct: ${mae}`);
  }
  if (event.bars_in_trade !== null && event.bars_in_trade !== undefined) {
    lines.push(`bars_in_trade: ${event.bars_in_trade}`);
  }

  return lines.join("\n");
}

function eventChartTime(event: TradeManagementEvent): number | null {
  if (event.time_ms === null || event.time_ms === undefined || !Number.isFinite(event.time_ms)) {
    return null;
  }
  return msToChartTime(event.time_ms);
}

function phaseMarkerStyle(
  toPhase: string | null | undefined,
  side: "long" | "short",
  highlighted: boolean,
): { color: string; shape: "circle" | "square"; position: "aboveBar" | "belowBar" } {
  const position = side === "long" ? "belowBar" : "aboveBar";
  if (highlighted) {
    return { color: "#fbbf24", shape: "circle", position };
  }
  switch (toPhase) {
    case "proven":
      return { color: "#22d3ee", shape: "circle", position };
    case "protected":
      return { color: "#818cf8", shape: "circle", position };
    case "runner":
      return { color: "#f472b6", shape: "circle", position };
    case "exhaustion":
      return { color: "#fb923c", shape: "circle", position };
    default:
      return { color: "#94a3b8", shape: "circle", position };
  }
}

function exitMarkerStyle(
  side: "long" | "short",
  highlighted: boolean,
): { color: string; shape: "circle" | "square"; position: "aboveBar" | "belowBar" } {
  const position = side === "long" ? "aboveBar" : "belowBar";
  return {
    color: highlighted ? "#fbbf24" : "#c084fc",
    shape: "square",
    position,
  };
}

function managedLayerMarkerStyle(
  eventType: TradeManagementEvent["event_type"],
  side: "long" | "short",
  highlighted: boolean,
): { color: string; shape: "circle" | "square"; position: "aboveBar" | "belowBar"; label: string } {
  const position = side === "long" ? "belowBar" : "aboveBar";
  if (highlighted) {
    return { color: "#fbbf24", shape: "circle", position, label: "M" };
  }
  switch (eventType) {
    case "active_stop_updated":
      return { color: "#34d399", shape: "circle", position, label: "Stop↑" };
    case "active_take_updated":
      return { color: "#60a5fa", shape: "circle", position, label: "Take" };
    case "runtime_exit_triggered":
      return { color: "#fb923c", shape: "circle", position, label: "Runtime" };
    case "exit_rule_triggered":
      return { color: "#a78bfa", shape: "square", position, label: "Rule" };
    default:
      return { color: "#94a3b8", shape: "circle", position, label: "M" };
  }
}

export function filterTradeManagementEventsForView(
  events: readonly TradeManagementEvent[] | null | undefined,
  options: {
    selectedTradeId: number | string | null;
    fromSec: number;
    toSec: number;
    maxWithoutSelection?: number;
  },
): TradeManagementEvent[] {
  if (!hasTradeManagementEvents(events)) {
    return [];
  }

  const maxWithoutSelection =
    options.maxWithoutSelection ?? TRADE_MANAGEMENT_MAX_MARKERS_WITHOUT_SELECTION;

  let filtered = events!.filter((event) => {
    const timeSec = eventChartTime(event);
    if (timeSec === null) {
      return false;
    }
    if (timeSec < options.fromSec || timeSec > options.toSec) {
      return false;
    }
    if (options.selectedTradeId !== null) {
      if (!event.trade_id) {
        return false;
      }
      return tradeIdsEqual(options.selectedTradeId, event.trade_id);
    }
    return true;
  });

  if (options.selectedTradeId === null && filtered.length > maxWithoutSelection) {
    filtered = filtered.slice(0, maxWithoutSelection);
  }

  return filtered;
}

const MANAGED_LAYER_EVENT_TYPES = new Set<TradeManagementEvent["event_type"]>([
  "active_stop_updated",
  "active_take_updated",
  "runtime_exit_triggered",
  "exit_rule_triggered",
  "exit_executed",
]);

export function buildTradeManagementEventChartMarkers(
  events: readonly TradeManagementEvent[],
  options: {
    showPhases: boolean;
    showExits: boolean;
    selectedTradeId: number | string | null;
  },
): SeriesMarker<Time>[] {
  const out: SeriesMarker<Time>[] = [];

  for (const event of events) {
    const timeSec = eventChartTime(event);
    if (timeSec === null) {
      continue;
    }

    const highlighted =
      options.selectedTradeId !== null && tradeIdsEqual(options.selectedTradeId, event.trade_id);

    if (event.event_type === "phase_changed") {
      if (!options.showPhases) {
        continue;
      }
      const style = phaseMarkerStyle(event.to_phase, event.side, highlighted);
      const label = phaseTransitionMarkerLabel(event.to_phase);
      out.push({
        time: timeSec as Time,
        position: style.position,
        color: style.color,
        shape: style.shape,
        text: highlighted ? `${label}#${event.trade_id}` : label,
      });
      continue;
    }

    if (!options.showExits || !MANAGED_LAYER_EVENT_TYPES.has(event.event_type)) {
      continue;
    }

    if (event.event_type === "exit_executed") {
      const style = exitMarkerStyle(event.side, highlighted);
      out.push({
        time: timeSec as Time,
        position: style.position,
        color: style.color,
        shape: style.shape,
        text: highlighted ? `Exit#${event.trade_id}` : "Exit",
      });
      continue;
    }

    const style = managedLayerMarkerStyle(event.event_type, event.side, highlighted);
    out.push({
      time: timeSec as Time,
      position: style.position,
      color: style.color,
      shape: style.shape,
      text: highlighted ? `${style.label}#${event.trade_id}` : style.label,
    });
  }

  return out.sort((a, b) => (a.time as number) - (b.time as number));
}

export function buildTradeManagementEventsForView(
  events: readonly TradeManagementEvent[] | null | undefined,
  options: {
    showPhases: boolean;
    showExits: boolean;
    selectedTradeId: number | string | null;
    viewCandles: { time: number }[];
    maxWithoutSelection?: number;
  },
): SeriesMarker<Time>[] {
  if (!options.showPhases && !options.showExits) {
    return [];
  }
  if (options.viewCandles.length === 0) {
    return [];
  }

  const fromSec = options.viewCandles[0]!.time;
  const toSec = options.viewCandles[options.viewCandles.length - 1]!.time;
  const inView = filterTradeManagementEventsForView(events, {
    selectedTradeId: options.selectedTradeId,
    fromSec,
    toSec,
    maxWithoutSelection: options.maxWithoutSelection,
  });

  return buildTradeManagementEventChartMarkers(inView, {
    showPhases: options.showPhases,
    showExits: options.showExits,
    selectedTradeId: options.selectedTradeId,
  });
}

/** Stable merge helper for marker rebuild tests. */
export function mergeChartMarkers(
  ...groups: SeriesMarker<Time>[]
): SeriesMarker<Time>[] {
  return groups.flat().sort((a, b) => (a.time as number) - (b.time as number));
}

export function filterTradeManagementMarkersToTimeRange(
  markers: SeriesMarker<Time>[],
  fromSec: number,
  toSec: number,
): SeriesMarker<Time>[] {
  return filterMarkersToTimeRange(markers, fromSec, toSec);
}
