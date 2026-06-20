import type { ChartBar, RunReport } from "@/api/types";

import type { SignalTraceRequest } from "@/shared/context/signalTraceLoadPolicy";

export type SignalTraceBootstrapMarketStatus = "idle" | "loading" | "ready" | "error";

export type SignalTraceBootstrapReportStatus = "idle" | "loading" | "ready" | "error";

export type SignalTraceBootstrapBlockReason =
  | "no_report"
  | "no_run"
  | "no_variant"
  | "report_not_ready"
  | "report_run_mismatch"
  | "run_switch_not_ready"
  | "market_not_ready"
  | "render_window_not_ready"
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

export function variantBelongsToReport(report: RunReport, variantKey: string | null): boolean {
  if (variantKey === null || variantKey === "") {
    return false;
  }
  return report.variants.some((variant) => variant.variant === variantKey);
}

export function chartWindowKeyMatchesRunVariant(
  chartWindowKey: string | null,
  runId: string,
  variantKey: string,
): boolean {
  if (chartWindowKey === null) {
    return false;
  }
  return chartWindowKey.startsWith(`${runId}:${variantKey}:`);
}

export function evaluateSignalTraceBootstrap(input: {
  report: RunReport | null;
  reportLoadStatus: SignalTraceBootstrapReportStatus;
  selectedRunId: string | null;
  selectedVariantKey: string | null;
  marketLoadStatus: SignalTraceBootstrapMarketStatus;
  runMarketViewIdentity: string | null;
  expectedRunMarketViewIdentity: string | null;
  chartWindowKey: string | null;
  candles: readonly ChartBar[];
  renderWindowBounds: { fromSec: number; toSec: number } | null;
  previousWindowKey: string | null;
}): SignalTraceBootstrapState {
  if (input.selectedRunId === null) {
    return { ready: false, reason: "no_run" };
  }
  if (input.reportLoadStatus !== "ready" || input.report === null) {
    if (input.reportLoadStatus === "loading" || input.reportLoadStatus === "idle") {
      return { ready: false, reason: "run_switch_not_ready" };
    }
    return { ready: false, reason: "no_report" };
  }
  if (input.report.run_id !== input.selectedRunId) {
    return { ready: false, reason: "report_run_mismatch" };
  }
  if (input.selectedVariantKey === null || input.selectedVariantKey === "") {
    return { ready: false, reason: "no_variant" };
  }
  if (!variantBelongsToReport(input.report, input.selectedVariantKey)) {
    return { ready: false, reason: "no_variant" };
  }
  if (input.marketLoadStatus !== "ready") {
    return { ready: false, reason: "market_not_ready" };
  }
  if (
    input.runMarketViewIdentity === null ||
    input.expectedRunMarketViewIdentity === null ||
    input.runMarketViewIdentity !== input.expectedRunMarketViewIdentity
  ) {
    return { ready: false, reason: "run_switch_not_ready" };
  }
  if (input.chartWindowKey === null) {
    return { ready: false, reason: "no_render_window" };
  }
  if (
    !chartWindowKeyMatchesRunVariant(
      input.chartWindowKey,
      input.report.run_id,
      input.selectedVariantKey,
    )
  ) {
    return { ready: false, reason: "render_window_not_ready" };
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
    variant: input.selectedVariantKey,
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
