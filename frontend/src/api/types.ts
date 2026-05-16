/** Mirrors future `research_api/contracts` — single source for UI types (phase 0). */

export const SUPPORTED_REPORT_SCHEMA_VERSIONS = [3] as const;
export type ReportSchemaVersion = (typeof SUPPORTED_REPORT_SCHEMA_VERSIONS)[number];

export type ChartBar = {
  /** Unix seconds (from `Candle.open_time_ms / 1000`) for Lightweight Charts. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

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
  strategy_spec: Record<string, unknown>;
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

export type StrategyConfigDraft = {
  config_version: number;
  experiment_id: string;
  family: string;
  execution: {
    init_cash: number;
    fees: number;
    slippage: number;
  };
  instances: StrategyInstanceDraft[];
};

export type StrategyInstanceDraft = {
  instance_id: string;
  variant: string;
  market: { symbol: string; base_timeframe: string };
  strategy: Record<string, unknown>;
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
