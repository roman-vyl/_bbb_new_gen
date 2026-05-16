import {
  assertSupportedReportSchema,
  type ChartBar,
  type ChartMarketBundle,
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

function chartMarketQuery(params: {
  symbol: string;
  timeframe: string;
  fromMs: number;
  toOpenTimeMs: number;
}): URLSearchParams {
  return new URLSearchParams({
    symbol: params.symbol,
    timeframe: params.timeframe,
    from: String(params.fromMs),
    to_open_time_ms: String(params.toOpenTimeMs),
  });
}

/** Single request: OHLC + chart overlay EMA (one BFF/SQLite read). */
export async function fetchChartMarketBundle(params: {
  symbol: string;
  timeframe: string;
  fromMs: number;
  toOpenTimeMs: number;
  emaPeriod: number;
}): Promise<ChartMarketBundle> {
  const base = chartMarketQuery(params);
  const bundleQs = new URLSearchParams(base);
  bundleQs.set("ema_period", String(params.emaPeriod));

  try {
    return await requestJson<ChartMarketBundle>(`/api/market/chart-bundle?${bundleQs.toString()}`);
  } catch (err) {
    // Phase 2 fixup added chart-bundle; older BFF only exposes /candles + /indicators/ema.
    if (!(err instanceof ApiError) || err.status !== 404) {
      throw err;
    }
    const [candles, ema] = await Promise.all([
      fetchCandles(params),
      fetchChartOverlayEma({ ...params, period: params.emaPeriod }),
    ]);
    return { candles, ema };
  }
}

export async function fetchCandles(params: {
  symbol: string;
  timeframe: string;
  fromMs: number;
  /** Report ``data_range.to_open_time_ms``; BFF resolves exclusive end via Data Engine ``timeframe_ms``. */
  toOpenTimeMs: number;
}): Promise<ChartBar[]> {
  const qs = new URLSearchParams({
    symbol: params.symbol,
    timeframe: params.timeframe,
    from: String(params.fromMs),
    to_open_time_ms: String(params.toOpenTimeMs),
  });
  return requestJson<ChartBar[]>(`/api/market/candles?${qs.toString()}`);
}

/** Chart overlay EMA from BFF (`kind: chart_overlay_ema`). Not strategy/Data Engine indicators. */
export async function fetchChartOverlayEma(params: {
  symbol: string;
  timeframe: string;
  period: number;
  fromMs: number;
  toOpenTimeMs: number;
}): Promise<IndicatorPoint[]> {
  const qs = new URLSearchParams({
    symbol: params.symbol,
    timeframe: params.timeframe,
    period: String(params.period),
    from: String(params.fromMs),
    to_open_time_ms: String(params.toOpenTimeMs),
  });
  return requestJson<IndicatorPoint[]>(`/api/market/indicators/ema?${qs.toString()}`);
}
