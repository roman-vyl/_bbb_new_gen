import { dbgTimed } from "@/shared/diagnostics/pipelineDebug";
import {
  assertSupportedReportSchema,
  type ChartBar,
  type ChartMarketBundle,
  type ComponentCatalog,
  type IndicatorPoint,
  type RunCompactSummaryReport,
  type RunReport,
  type RunSummary,
  type SignalTraceBundle,
  type BacktestResult,
  type ConfigStateResponse,
  type SaveConfigResult,
  type SerializeResult,
  type StrategyConfigDraft,
  type ValidationResult,
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

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    throw new ApiError(res.status, await readErrorDetail(res));
  }
  return (await res.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  return requestJson<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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
  return dbgTimed("api.fetchRunReport", async () => {
    const report = await requestJson<RunReport>(
      `/api/research/runs/${encodeURIComponent(runId)}`,
    );
    assertSupportedReportSchema(report.report_schema_version);
    return report;
  });
}

export async function fetchRunSummaryReport(runId: string): Promise<RunCompactSummaryReport> {
  const report = await requestJson<RunCompactSummaryReport>(
    `/api/research/runs/${encodeURIComponent(runId)}/summary`,
  );
  assertSupportedReportSchema(report.report_schema_version);
  return report;
}

/** Per-bar entry pipeline trace for Chart Bar Inspector (phase 5). */
export async function fetchSignalTrace(params: {
  runId: string;
  variant: string;
  fromMs: number;
  toOpenTimeMs: number;
  contextOverlayRef?: string | null;
  signal?: AbortSignal;
}): Promise<SignalTraceBundle> {
  const qs = new URLSearchParams({
    variant: params.variant,
    from: String(params.fromMs),
    to_open_time_ms: String(params.toOpenTimeMs),
  });
  if (params.contextOverlayRef) {
    qs.set("context_overlay_ref", params.contextOverlayRef);
  }
  return dbgTimed("api.fetchSignalTrace", () =>
    requestJson<SignalTraceBundle>(
      `/api/research/runs/${encodeURIComponent(params.runId)}/signal-trace?${qs.toString()}`,
      { signal: params.signal },
    ),
  );
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

/** Single request: OHLC + anchor-stack chart overlay EMAs (one BFF/SQLite read). */
export async function fetchChartMarketBundle(params: {
  symbol: string;
  timeframe: string;
  fromMs: number;
  toOpenTimeMs: number;
  emaFast: number;
  emaAnchor: number;
  emaSlow: number;
  signal?: AbortSignal;
}): Promise<ChartMarketBundle> {
  const base = chartMarketQuery(params);
  const bundleQs = new URLSearchParams(base);
  bundleQs.set("ema_fast", String(params.emaFast));
  bundleQs.set("ema_anchor", String(params.emaAnchor));
  bundleQs.set("ema_slow", String(params.emaSlow));
  return dbgTimed("api.fetchChartMarketBundle", () =>
    requestJson<ChartMarketBundle>(`/api/market/chart-bundle?${bundleQs.toString()}`, {
      signal: params.signal,
    }),
  );
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
  signal?: AbortSignal;
}): Promise<IndicatorPoint[]> {
  const qs = new URLSearchParams({
    symbol: params.symbol,
    timeframe: params.timeframe,
    period: String(params.period),
    from: String(params.fromMs),
    to_open_time_ms: String(params.toOpenTimeMs),
  });
  return requestJson<IndicatorPoint[]>(`/api/market/indicators/ema?${qs.toString()}`, {
    signal: params.signal,
  });
}

export async function fetchComponentCatalog(
  family = "ema_pullback",
): Promise<ComponentCatalog> {
  const qs = new URLSearchParams({ family });
  return requestJson<ComponentCatalog>(`/api/research/component-catalog?${qs.toString()}`);
}

export async function validateConfigDraft(
  draft: StrategyConfigDraft,
): Promise<ValidationResult> {
  return postJson<ValidationResult>("/api/research/config/validate", draft);
}

export async function serializeConfigDraft(
  draft: StrategyConfigDraft,
  format: "json" | "yaml" = "json",
): Promise<SerializeResult> {
  const qs = new URLSearchParams({ format });
  return postJson<SerializeResult>(
    `/api/research/config/serialize?${qs.toString()}`,
    draft,
  );
}

export async function saveConfigDraft(
  draft: StrategyConfigDraft,
): Promise<SaveConfigResult> {
  return postJson<SaveConfigResult>("/api/research/config/save", { draft });
}

export async function fetchConfigState(family = "ema_pullback"): Promise<ConfigStateResponse> {
  const qs = new URLSearchParams({ family });
  return requestJson<ConfigStateResponse>(`/api/research/configs/state?${qs.toString()}`);
}

export async function selectSavedConfig(
  family: string,
  experimentId: string,
): Promise<ConfigStateResponse> {
  return requestJson<ConfigStateResponse>("/api/research/configs/selected", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ family, experiment_id: experimentId }),
  });
}

export async function runBacktest(
  body: { draft: StrategyConfigDraft } | { config_path: string },
): Promise<BacktestResult> {
  return dbgTimed("api.runBacktest", () => postJson<BacktestResult>("/api/research/backtests", body));
}
