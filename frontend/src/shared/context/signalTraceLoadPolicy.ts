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
  | { action: "skip_already_loaded" }
  | { action: "skip_already_loading" }
  | { action: "skip_identical_in_flight" }
  | { action: "load_start"; request: SignalTraceRequest };

export type DecideSignalTraceLoadInput = {
  chartWindowKey: string | null;
  loadedTraceWindowKey: string | null;
  loadingTraceWindowKey: string | null;
  signalTraceStatus: SignalTraceLoadStatus;
  inFlightRequest: SignalTraceRequest | null;
  request: SignalTraceRequest | null;
};

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

/** Whether to start signalTrace fetch or skip (dedup / guards). */
export function decideSignalTraceLoad(
  input: DecideSignalTraceLoadInput,
): SignalTraceLoadDecision {
  if (input.chartWindowKey === null || input.request === null) {
    return { action: "skip_idle" };
  }

  const { request } = input;

  if (
    input.chartWindowKey === input.loadedTraceWindowKey &&
    input.signalTraceStatus === "ready"
  ) {
    return { action: "skip_already_loaded" };
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
