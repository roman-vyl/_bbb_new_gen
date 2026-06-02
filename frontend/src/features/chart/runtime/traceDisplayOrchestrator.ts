import type { SignalTraceLoadDecision } from "@/shared/context/signalTraceLoadPolicy";
import type { SignalTraceLoadStatus } from "@/shared/context/signalTraceLoadPolicy";
import type { SignalTraceBootstrapState } from "@/shared/context/signalTraceBootstrap";
import type { RenderWindowInteractionState } from "@/features/chart/runtime/types";

export type TraceSchedulingInput = {
  interactionState: RenderWindowInteractionState;
  hasPendingShift: boolean;
  displayCacheCoversWindow: boolean;
  committedWindowKey: string;
  loadedWindowKey: string | null;
  status: SignalTraceLoadStatus;
};

/**
 * v1: strict idle-only — no network scheduling while user is actively panning
 * or while only a pending (uncommitted) shift exists.
 */
export function shouldBlockTraceFetchForActivePan(input: TraceSchedulingInput): boolean {
  if (input.displayCacheCoversWindow) {
    return false;
  }
  if (
    input.interactionState === "user_panning" ||
    input.interactionState === "pending_shift" ||
    input.interactionState === "applying_shift"
  ) {
    return true;
  }
  if (input.hasPendingShift) {
    return true;
  }
  return false;
}

export type CoalescedFetchIntent = {
  windowKey: string;
  superseded: boolean;
};

let pendingFetchIntent: CoalescedFetchIntent | null = null;

export function resetTraceFetchCoalescer(): void {
  pendingFetchIntent = null;
}

export function queueTraceFetchIntent(windowKey: string): CoalescedFetchIntent {
  const superseded = pendingFetchIntent !== null && pendingFetchIntent.windowKey !== windowKey;
  pendingFetchIntent = { windowKey, superseded };
  return pendingFetchIntent;
}

export function takeCommittedTraceFetchIntent(): string | null {
  const key = pendingFetchIntent?.windowKey ?? null;
  pendingFetchIntent = null;
  return key;
}

export function peekPendingTraceFetchIntent(): string | null {
  return pendingFetchIntent?.windowKey ?? null;
}

export type TraceDisplayLoadPlan =
  | { action: "bootstrap_blocked" }
  | { action: "fetch_superseded" }
  | { action: "pan_block"; applyDisplayFromCache: boolean }
  | { action: "restore_session" }
  | { action: "evaluate_network" }
  | { action: "defer"; reason: SignalTraceLoadDecision["action"] };

/**
 * Display / pan / session plan. Durable network authorization is coordinator-only.
 */
export function planTraceDisplayLoad(input: {
  bootstrap: SignalTraceBootstrapState;
  coalescedWindowKey: string | null;
  committedWindowKey: string;
  panScheduling: TraceSchedulingInput;
  loadDecision: SignalTraceLoadDecision;
}): TraceDisplayLoadPlan {
  if (!input.bootstrap.ready) {
    return { action: "bootstrap_blocked" };
  }

  if (
    input.coalescedWindowKey !== null &&
    input.coalescedWindowKey !== input.committedWindowKey
  ) {
    return { action: "fetch_superseded" };
  }

  if (shouldBlockTraceFetchForActivePan(input.panScheduling)) {
    return {
      action: "pan_block",
      applyDisplayFromCache: input.panScheduling.displayCacheCoversWindow,
    };
  }

  switch (input.loadDecision.action) {
    case "restore_session_cache":
      return { action: "restore_session" };
    case "skip_idle":
      return { action: "defer", reason: "skip_idle" };
    case "proceed":
      return { action: "evaluate_network" };
    default:
      return { action: "defer", reason: "skip_idle" };
  }
}

/** Display-cache updates must never imply a viewport command. */
export function traceDisplayPlanTouchesViewport(_plan: TraceDisplayLoadPlan): boolean {
  return false;
}
