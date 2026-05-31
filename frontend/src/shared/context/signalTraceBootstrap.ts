import type { ChartBar, RunReport, RunVariant } from "@/api/types";

import type { SignalTraceRequest } from "@/shared/context/signalTraceLoadPolicy";

export type SignalTraceBootstrapMarketStatus = "idle" | "loading" | "ready" | "error";

export type SignalTraceBootstrapBlockReason =
  | "no_report"
  | "no_run"
  | "no_variant"
  | "market_not_ready"
  | "no_render_window"
  | "no_bounds";

export type SignalTraceFetchSource = "initial" | "window_shift" | "session_restore";

export type SignalTraceBootstrapReady = {
  ready: true;
  windowKey: string;
  request: SignalTraceRequest;
  fetchSource: SignalTraceFetchSource;
};

export type SignalTraceBootstrapBlocked = {
  ready: false;
  reason: SignalTraceBootstrapBlockReason;
};

export type SignalTraceBootstrapState = SignalTraceBootstrapReady | SignalTraceBootstrapBlocked;

export function resolveSignalTraceFetchSource(
  previousWindowKey: string | null,
  nextWindowKey: string,
): SignalTraceFetchSource {
  if (previousWindowKey === null || previousWindowKey === nextWindowKey) {
    return "initial";
  }
  return "window_shift";
}

export function evaluateSignalTraceBootstrap(input: {
  report: RunReport | null;
  selectedRunId: string | null;
  selectedVariant: RunVariant | null;
  marketLoadStatus: SignalTraceBootstrapMarketStatus;
  chartWindowKey: string | null;
  candles: readonly ChartBar[];
  renderWindowBounds: { fromSec: number; toSec: number } | null;
  previousWindowKey: string | null;
}): SignalTraceBootstrapState {
  if (input.report === null) {
    return { ready: false, reason: "no_report" };
  }
  if (input.selectedRunId === null) {
    return { ready: false, reason: "no_run" };
  }
  if (input.selectedVariant === null) {
    return { ready: false, reason: "no_variant" };
  }
  if (input.marketLoadStatus !== "ready") {
    return { ready: false, reason: "market_not_ready" };
  }
  if (input.chartWindowKey === null) {
    return { ready: false, reason: "no_render_window" };
  }
  if (input.candles.length === 0 || input.renderWindowBounds === null) {
    return { ready: false, reason: "no_bounds" };
  }

  const fromMs = input.candles[0]!.time * 1000;
  const toOpenTimeMs = input.candles[input.candles.length - 1]!.time * 1000;
  const windowKey = input.chartWindowKey;
  const request: SignalTraceRequest = {
    windowKey,
    runId: input.selectedRunId,
    variant: input.selectedVariant.variant,
    fromMs,
    toOpenTimeMs,
  };

  return {
    ready: true,
    windowKey,
    request,
    fetchSource: resolveSignalTraceFetchSource(input.previousWindowKey, windowKey),
  };
}
