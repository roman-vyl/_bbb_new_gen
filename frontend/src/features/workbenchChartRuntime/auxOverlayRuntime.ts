import type { ChartAuxEmaOverlay } from "@/api/types";

export type AuxOverlayRuntimeBoundary = {
  implemented: false;
  auxEmaOverlays: ChartAuxEmaOverlay[];
  displayAuxEmaOverlays: ChartAuxEmaOverlay[];
  htfAuxEmaOverlayStale: boolean;
};

export function createAuxOverlayRuntimeBoundary(): AuxOverlayRuntimeBoundary {
  return {
    implemented: false,
    auxEmaOverlays: [],
    displayAuxEmaOverlays: [],
    htfAuxEmaOverlayStale: false,
  };
}
