export type SignalTraceLoadStatus = "idle" | "loading" | "ready" | "error";

export type SignalTraceRequest = {
  windowKey: string;
  runId: string;
  variant: string;
  fromMs: number;
  toOpenTimeMs: number;
};

/** Policy gates only — durable network dedupe lives in SignalTraceRequestCoordinator. */
export type SignalTraceLoadDecision =
  | { action: "skip_idle" }
  | { action: "restore_session_cache" }
  | { action: "proceed" };

export type DecideSignalTraceLoadInput = {
  chartWindowKey: string | null;
  sessionCacheHasWindow: boolean;
  /** Window key for the current `signalTrace` bundle (lanes/diagnostics). */
  loadedSignalTraceWindowKey: string | null;
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

/** Bootstrap / session gates before coordinator network authorization. */
export function decideSignalTraceLoad(input: DecideSignalTraceLoadInput): SignalTraceLoadDecision {
  if (input.chartWindowKey === null || input.request === null) {
    return { action: "skip_idle" };
  }

  if (
    input.sessionCacheHasWindow &&
    !signalTraceMatchesChartWindow(input.chartWindowKey, input.loadedSignalTraceWindowKey)
  ) {
    return { action: "restore_session_cache" };
  }

  return { action: "proceed" };
}
