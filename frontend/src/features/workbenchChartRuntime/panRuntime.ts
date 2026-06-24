import type { RunMarketView } from "@/features/chart/runMarketView";
import { evaluateMarketPanPrefetchExpansion } from "@/features/chart/workbenchMarketLoad";

import type { RuntimeMarketWindow } from "./marketWindowRuntime";

export type PanPrefetchCandidate = {
  implemented: true;
  expansion: RuntimeMarketWindow | null;
  reason: string;
  suppressedProgrammatic: boolean;
};

export type PanRuntimeBoundary = {
  implemented: false;
  pendingCoverageExpansion: RuntimeMarketWindow | null;
};

export type PanRuntimeCandidate = PanPrefetchCandidate | PanRuntimeBoundary;

export function evaluatePanPrefetchCandidate(input: {
  view: RunMarketView | null;
  coverageWindow: RuntimeMarketWindow | null;
  visibleFromSec: number;
  visibleToSec: number;
  timeframeMs: number;
  chartHeavyIoEnabled: boolean;
  interactionState: string;
  forceUserPan?: boolean;
  programmaticViewportActive?: boolean;
}): PanPrefetchCandidate {
  if (input.programmaticViewportActive) {
    return {
      implemented: true,
      expansion: null,
      reason: "suppressed_programmatic",
      suppressedProgrammatic: true,
    };
  }

  if (
    input.view === null ||
    input.coverageWindow === null ||
    !input.chartHeavyIoEnabled
  ) {
    return {
      implemented: true,
      expansion: null,
      reason: "unavailable",
      suppressedProgrammatic: false,
    };
  }

  const isUserPan =
    input.forceUserPan === true ||
    input.interactionState === "user_panning" ||
    input.interactionState === "pending_shift" ||
    input.interactionState === "applying_shift";

  const decision = evaluateMarketPanPrefetchExpansion({
    targetWindow: input.coverageWindow,
    visibleFromSec: input.visibleFromSec,
    visibleToSec: input.visibleToSec,
    reportFromMs: input.view.fromOpenTimeMs,
    reportToMs: input.view.toOpenTimeMs,
    timeframeMs: input.timeframeMs,
    isUserPan,
  });

  return {
    implemented: true,
    expansion: decision.expanded,
    reason: decision.reason,
    suppressedProgrammatic: false,
  };
}

export function createPanRuntimeBoundary(): PanRuntimeBoundary {
  return {
    implemented: false,
    pendingCoverageExpansion: null,
  };
}
