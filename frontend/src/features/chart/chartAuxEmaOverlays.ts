import type { ChartAuxEmaOverlay, ChartBar, IndicatorPoint } from "@/api/types";
import { sliceEmaToCandleWindow } from "@/features/chart/chartViewWindow";

export const AUX_EMA_LINE_COLORS = [
  "#f472b6",
  "#fb923c",
  "#a3e635",
  "#facc15",
  "#c084fc",
  "#2dd4bf",
] as const;

export function colorForAuxEmaOverlay(index: number): string {
  return AUX_EMA_LINE_COLORS[index % AUX_EMA_LINE_COLORS.length]!;
}

export function sliceAuxOverlaysToCandleWindow(
  overlays: readonly ChartAuxEmaOverlay[],
  candles: readonly ChartBar[],
): ChartAuxEmaOverlay[] {
  return overlays.map((overlay) => ({
    ...overlay,
    points: sliceEmaToCandleWindow(overlay.points, candles),
  }));
}

export function mergeAuxOverlayPoints(
  overlays: ChartAuxEmaOverlay[],
  incoming: ChartAuxEmaOverlay[],
): ChartAuxEmaOverlay[] {
  const byId = new Map(overlays.map((o) => [o.id, o]));
  for (const overlay of incoming) {
    byId.set(overlay.id, overlay);
  }
  return [...byId.values()];
}

export function overlayHasPoints(points: IndicatorPoint[]): boolean {
  return points.length > 0;
}
