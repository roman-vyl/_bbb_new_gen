import type { ComponentEvent } from "@/api/types";
import type { RuntimeTraceStatus } from "./runtimeTypes";

export type TraceDisplayRuntimeBoundary = {
  implemented: false;
  status: RuntimeTraceStatus;
  componentEvents: ComponentEvent[];
  componentEventsStale: boolean;
  displayApplyRevision: number;
  missingRange: { fromSec: number; toSec: number } | null;
};

export function createTraceDisplayRuntimeBoundary(): TraceDisplayRuntimeBoundary {
  return {
    implemented: false,
    status: "idle",
    componentEvents: [],
    componentEventsStale: false,
    displayApplyRevision: 0,
    missingRange: null,
  };
}
