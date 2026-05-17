/** Mirrors future `research_api/contracts` — single source for UI types (phase 0). */

export const SUPPORTED_REPORT_SCHEMA_VERSIONS = [3] as const;
export type ReportSchemaVersion = (typeof SUPPORTED_REPORT_SCHEMA_VERSIONS)[number];

/** JSON object maps in reports/config drafts (avoids bare `Record` under TS 5.8). */
export type JsonObject = Record<string, unknown>;

export type ChartBar = {
  /** Unix seconds (from `Candle.open_time_ms / 1000`) for Lightweight Charts. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

/** BFF overlay discriminator — not strategy features / not Data Engine indicators. */
export const CHART_OVERLAY_EMA_KIND = "chart_overlay_ema" as const;

export type IndicatorPoint = {
  time: number;
  value: number;
  kind: typeof CHART_OVERLAY_EMA_KIND;
};

export type ChartMarketBundle = {
  candles: ChartBar[];
  ema: IndicatorPoint[];
};

/** MVP chart market timeframe (execution/research TF for Workbench). */
export const CHART_MARKET_TIMEFRAME = "5m" as const;

/**
 * Default chart overlay EMA period (BFF view-layer series).
 * Computed only over the loaded candle window; not `ema_close_*` strategy features.
 */
export const CHART_EMA_PERIOD = 200;

export type TradeOverlay = {
  trade_id: number;
  direction: "long" | "short";
  status: "open" | "closed";
  entry_time_ms: number;
  exit_time_ms: number | null;
  entry_price: number | null;
  exit_price: number | null;
  exit_reason: string;
};

export type TradeRecord = TradeOverlay & {
  size: number | null;
  pnl: number | null;
  return_pct: number | null;
};

export type SideMetrics = {
  trades: number;
  pnl: number;
  return_pct: number;
  profit_factor: number | null;
  win_rate: number | null;
};

export type TotalMetrics = SideMetrics & {
  sharpe: number;
  max_drawdown: number;
};

export type VariantMetrics = {
  long: SideMetrics;
  short: SideMetrics;
  total: TotalMetrics;
  open_trades: { long: number; short: number; total: number };
};

export type RunVariant = {
  variant: string;
  config_id: string;
  symbol: string;
  timeframe: string;
  strategy_spec: JsonObject;
  metrics: VariantMetrics;
  component_counters: unknown[];
  trade_records: TradeRecord[];
};

export type RunReport = {
  run_id: string;
  created_at: string;
  report_schema_version: number;
  family: string;
  symbol: string;
  timeframe: string;
  candles: number;
  data_range: { from_open_time_ms: number; to_open_time_ms: number };
  variants_count: number;
  variants: RunVariant[];
};

export type RunSummary = {
  run_id: string;
  created_at: string;
  family: string;
  symbol: string;
  timeframe: string;
};

export type ExecutionDraft = {
  init_cash?: number;
  fees?: number;
  slippage?: number;
};

export type StrategyConfigDraft = {
  config_version: number;
  experiment_id: string;
  family: string;
  execution: ExecutionDraft;
  instances: StrategyInstanceDraft[];
};

export type StrategyInstanceDraft = {
  instance_id: string;
  variant: string;
  market: { symbol: string; base_timeframe: string };
  strategy: JsonObject;
};

export type ParamFieldSchema = {
  type: "integer" | "number" | "string" | "boolean";
  label?: string | null;
  min?: number | null;
  max?: number | null;
  enum?: string[] | null;
  default?: unknown;
};

export type ComponentSchema = {
  component_id: string;
  role: "direction" | "setup" | "trigger" | "blockers" | "exits" | "risk";
  label: string;
  description?: string | null;
  params_schema?: Record<string, ParamFieldSchema>;
  list_slot?: boolean;
};

export type ComposerSectionSchema = {
  section_id: string;
  label: string;
  role?: string | null;
  list_slot?: boolean;
};

export type ComponentCatalog = {
  family: string;
  schema_version: number;
  sections: ComposerSectionSchema[];
  components: ComponentSchema[];
};

export type ValidationErrorItem = {
  path: string;
  message: string;
};

export type ValidationResult = {
  ok: boolean;
  errors: ValidationErrorItem[];
};

export type SerializeResult = {
  ok: boolean;
  format: "json" | "yaml";
  content: string;
  errors: ValidationErrorItem[];
};

export type SaveConfigResult = {
  ok: boolean;
  path: string | null;
  errors: ValidationErrorItem[];
};

export type RunBacktestRequest = {
  draft?: StrategyConfigDraft;
  config_path?: string;
};

export type BacktestResult = {
  ok: boolean;
  run_id: string | null;
  config_path: string | null;
  errors: ValidationErrorItem[];
};

export type WorkbenchTab = "chart" | "composer" | "reports";

export function assertSupportedReportSchema(version: number): void {
  if (!(SUPPORTED_REPORT_SCHEMA_VERSIONS as readonly number[]).includes(version)) {
    throw new Error(
      `Unsupported report_schema_version ${version}. Supported: ${SUPPORTED_REPORT_SCHEMA_VERSIONS.join(", ")}.`,
    );
  }
}

export function tradeToOverlay(trade: TradeRecord): TradeOverlay {
  return {
    trade_id: trade.trade_id,
    direction: trade.direction,
    status: trade.status,
    entry_time_ms: trade.entry_time_ms,
    exit_time_ms: trade.exit_time_ms,
    entry_price: trade.entry_price,
    exit_price: trade.exit_price,
    exit_reason: trade.exit_reason,
  };
}

export function msToChartTime(openTimeMs: number): number {
  return Math.floor(openTimeMs / 1000);
}
