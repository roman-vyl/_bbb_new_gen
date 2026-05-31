export type SignalTraceLoadStatus = "idle" | "loading" | "ready" | "error";

export type SignalTraceRequest = {
  windowKey: string;
  runId: string;
  variant: string;
  fromMs: number;
  toOpenTimeMs: number;
};

export type SignalTraceLoadDecision =
  | { action: "skip_idle" }
  | { action: "skip_display_cache_hit" }
  | { action: "restore_session_cache" }
  | { action: "skip_already_loading" }
  | { action: "skip_identical_in_flight" }
  | { action: "load_start"; request: SignalTraceRequest };

export type DecideSignalTraceLoadInput = {
  chartWindowKey: string | null;
  displayCacheCoversWindow: boolean;
  sessionCacheHasWindow: boolean;
  /** Window key for the current `signalTrace` bundle (lanes/diagnostics). */
  loadedSignalTraceWindowKey: string | null;
  loadingTraceWindowKey: string | null;
  signalTraceStatus: SignalTraceLoadStatus;
  inFlightRequest: SignalTraceRequest | null;
  request: SignalTraceRequest | null;
};

export function signalTraceMatchesChartWindow(
  chartWindowKey: string | null,
  loadedSignalTraceWindowKey: string | null,
): boolean {
  return chartWindowKey !== null && loadedSignalTraceWindowKey === chartWindowKey;
}

/** Lanes/diagnostics: only expose per-window trace when it matches the render window. */
export function lanesSignalTraceStatus(
  chartWindowKey: string | null,
  loadedSignalTraceWindowKey: string | null,
  signalTraceStatus: SignalTraceLoadStatus,
): SignalTraceLoadStatus {
  if (signalTraceMatchesChartWindow(chartWindowKey, loadedSignalTraceWindowKey)) {
    return signalTraceStatus;
  }
  // Stale status from another window (including its error) — current window refetch pending/active.
  return "loading";
}

/** Only show trace error when it belongs to the current render window. */
export function lanesSignalTraceError(
  chartWindowKey: string | null,
  loadedSignalTraceWindowKey: string | null,
  signalTraceError: string | null,
): string | null {
  if (signalTraceError === null) {
    return null;
  }
  if (signalTraceMatchesChartWindow(chartWindowKey, loadedSignalTraceWindowKey)) {
    return signalTraceError;
  }
  return null;
}

export function signalTraceRequestsEqual(
  a: SignalTraceRequest,
  b: SignalTraceRequest,
): boolean {
  return (
    a.windowKey === b.windowKey &&
    a.runId === b.runId &&
    a.variant === b.variant &&
    a.fromMs === b.fromMs &&
    a.toOpenTimeMs === b.toOpenTimeMs
  );
}

/** Whether to start signalTrace fetch or skip (display cache / dedup / guards). */
export function decideSignalTraceLoad(
  input: DecideSignalTraceLoadInput,
): SignalTraceLoadDecision {
  if (input.chartWindowKey === null || input.request === null) {
    return { action: "skip_idle" };
  }

  const { request } = input;

  if (
    input.sessionCacheHasWindow &&
    !signalTraceMatchesChartWindow(input.chartWindowKey, input.loadedSignalTraceWindowKey)
  ) {
    return { action: "restore_session_cache" };
  }

  if (
    input.displayCacheCoversWindow &&
    signalTraceMatchesChartWindow(input.chartWindowKey, input.loadedSignalTraceWindowKey) &&
    input.signalTraceStatus === "ready"
  ) {
    return { action: "skip_display_cache_hit" };
  }

  if (
    input.chartWindowKey === input.loadingTraceWindowKey &&
    input.signalTraceStatus === "loading"
  ) {
    return { action: "skip_already_loading" };
  }

  if (
    input.inFlightRequest !== null &&
    signalTraceRequestsEqual(input.inFlightRequest, request)
  ) {
    return { action: "skip_identical_in_flight" };
  }

  return { action: "load_start", request };
}
