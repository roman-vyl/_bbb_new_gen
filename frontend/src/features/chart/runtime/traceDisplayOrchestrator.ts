import type { SignalTraceLoadStatus } from "@/shared/context/signalTraceLoadPolicy";
import type { RenderWindowInteractionState } from "@/features/chart/runtime/types";

export type TraceSchedulingInput = {
  interactionState: RenderWindowInteractionState;
  hasPendingShift: boolean;
  displayCacheCoversWindow: boolean;
  committedWindowKey: string;
  loadedWindowKey: string | null;
  loadingWindowKey: string | null;
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
