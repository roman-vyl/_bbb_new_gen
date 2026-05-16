import {
  assertSupportedReportSchema,
  type ChartBar,
  type IndicatorPoint,
  type RunReport,
  type RunSummary,
} from "@/api/types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function readErrorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: string | { msg?: string }[] };
    if (typeof body.detail === "string") {
      return body.detail;
    }
    if (Array.isArray(body.detail)) {
      return body.detail.map((d) => d.msg ?? JSON.stringify(d)).join("; ");
    }
    return res.statusText;
  } catch {
    return res.statusText;
  }
}

async function requestJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new ApiError(res.status, await readErrorDetail(res));
  }
  return (await res.json()) as T;
}

export async function fetchRunSummaries(): Promise<RunSummary[]> {
  return requestJson<RunSummary[]>("/api/research/runs");
}

export async function fetchLatestRunReport(): Promise<RunReport> {
  const report = await requestJson<RunReport>("/api/research/runs/latest");
  assertSupportedReportSchema(report.report_schema_version);
  return report;
}

export async function fetchRunReport(runId: string): Promise<RunReport> {
  const report = await requestJson<RunReport>(
    `/api/research/runs/${encodeURIComponent(runId)}`,
  );
  assertSupportedReportSchema(report.report_schema_version);
  return report;
}

export function isApiBaseConfigured(): boolean {
  return API_BASE.length > 0;
}

export async function fetchCandles(params: {
  symbol: string;
  timeframe: string;
  fromMs: number;
  toMs: number;
}): Promise<ChartBar[]> {
  const qs = new URLSearchParams({
    symbol: params.symbol,
    timeframe: params.timeframe,
    from: String(params.fromMs),
    to: String(params.toMs),
  });
  return requestJson<ChartBar[]>(`/api/market/candles?${qs.toString()}`);
}

export async function fetchEma(params: {
  symbol: string;
  timeframe: string;
  period: number;
  fromMs: number;
  toMs: number;
}): Promise<IndicatorPoint[]> {
  const qs = new URLSearchParams({
    symbol: params.symbol,
    timeframe: params.timeframe,
    period: String(params.period),
    from: String(params.fromMs),
    to: String(params.toMs),
  });
  return requestJson<IndicatorPoint[]>(`/api/market/indicators/ema?${qs.toString()}`);
}

/** Half-open window end for report ``to_open_time_ms`` + one bar (5m default step). */
export function reportRangeEndMs(toOpenTimeMs: number, chartTimeframe: string): number {
  const stepMs =
    chartTimeframe === "5m"
      ? 300_000
      : chartTimeframe === "1h"
        ? 3_600_000
        : chartTimeframe === "15m"
          ? 900_000
          : 300_000;
  return toOpenTimeMs + stepMs;
}
