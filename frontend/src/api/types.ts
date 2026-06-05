/** Mirrors future `research_api/contracts` — single source for UI types (phase 0). */

export const SUPPORTED_REPORT_SCHEMA_VERSIONS = [3, 4, 5, 6] as const;
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

export type AnchorStackEmaRole = "fast" | "anchor" | "slow";

export type AnchorStackPeriods = {
  fast: number;
  anchor: number;
  slow: number;
};

/** One anchor-stack overlay line (computed from chart candle closes, not research features). */
export type ChartEmaOverlay = {
  role: AnchorStackEmaRole;
  period: number;
  points: IndicatorPoint[];
};

export type ChartMarketBundle = {
  candles: ChartBar[];
  ema_overlays: ChartEmaOverlay[];
};

/** Non-anchor-stack EMA line (exit policy on chart TF or HTF context from signal trace). */
export type ChartAuxEmaOverlay = {
  id: string;
  label: string;
  period: number;
  timeframe: string;
  points: IndicatorPoint[];
  dashed: boolean;
};

/** MVP chart market timeframe (execution/research TF for Workbench). */
export const CHART_MARKET_TIMEFRAME = "5m" as const;

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

export type ExitProfileLabel = "aligned" | "countertrend" | "neutral";

/** Per setup instance_id at entry bar (schema v5+ setup stack). */
export type SetupEntryDiagnostics = {
  trend_episode_id?: number | null;
  effective_bounce_number?: number | null;
  completed_bounce_count?: number | null;
  side?: "long" | "short" | null;
};

export type BreakEvenDiagnostics = {
  enabled: boolean;
  instance_id: string;
  trigger_r: number;
  trigger_price?: number | null;
  triggered: boolean;
  trigger_time_ms?: number | null;
  stop_moved_to?: number | null;
  initial_stop_price: number;
  initial_risk: number;
  active_stop_management_source: "profile" | "always_on";
};

export type TradeRecord = TradeOverlay & {
  size: number | null;
  pnl: number | null;
  return_pct: number | null;
  /** Schema v4 — closed trades only */
  entry_profile?: ExitProfileLabel;
  entry_context_state?: "up" | "down" | "neutral" | "unknown";
  active_exit_profile?: ExitProfileLabel;
  exit_group?: "always_on" | "profile" | null;
  exit_profile?: ExitProfileLabel | null;
  exit_component_id?: string | null;
  exit_instance_id?: string | null;
  exit_kind?: string | null;
  gross_pnl?: number | null;
  fees_paid?: number | null;
  gross_return_pct?: number | null;
  hold_bars?: number | null;
  hold_minutes?: number | null;
  /** Schema v5 — closed trades only */
  mfe_price?: number | null;
  mfe_pct?: number | null;
  mfe_atr?: number | null;
  mae_price?: number | null;
  mae_pct?: number | null;
  mae_atr?: number | null;
  bars_to_mfe?: number | null;
  bars_to_mae?: number | null;
  captured_price?: number | null;
  captured_pct?: number | null;
  captured_atr?: number | null;
  capture_ratio?: number | null;
  giveback_price?: number | null;
  giveback_pct?: number | null;
  giveback_atr?: number | null;
  bars_from_mfe_to_exit?: number | null;
  quality_flags?: string[] | null;
  entry_context_consumption?: ContextConsumptionAttribution | null;
  exit_context_consumption?: ContextConsumptionAttribution | null;
  /** Namespaced setup diagnostics keyed by setup instance_id. */
  entry_setup_diagnostics?: Record<string, SetupEntryDiagnostics>;
  /** Exit management combiner — break_even_stop when present on trade record. */
  break_even?: BreakEvenDiagnostics;
  /** Schema v6 — closed trades only */
  path_diagnostics?: TradePathDiagnostics;
  reference_levels?: TradeReferenceLevels;
};

export type TradePathExcursion = {
  price_move: number;
  pct: number;
  time_ms: number | null;
  bars_from_entry: number;
};

export type TradePathCapture = {
  capture_ratio: number | null;
  captured_pct: number;
  giveback_price: number | null;
  giveback_pct: number | null;
  bars_from_mfe_to_exit: number;
};

export type TradePathDiagnostics = {
  mfe: TradePathExcursion;
  mae: TradePathExcursion;
  capture: TradePathCapture;
};

export type TradeReferenceLevels = {
  reference_levels_available: boolean;
  initial_stop_price: number | null;
  initial_take_profit_price: number | null;
  initial_risk_price_move: number | null;
  initial_reward_price_move: number | null;
  reached_initial_tp: boolean;
  reached_initial_sl: boolean;
  first_level_hit: "take_profit" | "stop_loss" | "ambiguous_same_bar" | "none";
  first_level_hit_time_ms: number | null;
  bars_to_first_level_hit: number | null;
};

export type PathDiagnosticsSummaryBucket = {
  trade_count: number;
  avg_mfe_pct: number | null;
  median_mfe_pct: number | null;
  p75_mfe_pct: number | null;
  p90_mfe_pct: number | null;
  avg_mae_pct: number | null;
  median_mae_pct: number | null;
  p75_mae_pct: number | null;
  p90_mae_pct: number | null;
  avg_capture_ratio: number | null;
  median_capture_ratio: number | null;
  avg_giveback_pct: number | null;
  median_giveback_pct: number | null;
  reference_levels_available_count: number;
  reference_levels_unavailable_count: number;
  reached_initial_tp_count: number;
  reached_initial_sl_count: number;
  first_take_profit_count: number;
  first_stop_loss_count: number;
  ambiguous_first_level_count: number;
  no_reference_level_hit_count: number;
  avg_bars_to_mfe: number | null;
  median_bars_to_mfe: number | null;
  avg_bars_to_mae: number | null;
  median_bars_to_mae: number | null;
  avg_bars_to_first_level_hit: number | null;
  median_bars_to_first_level_hit: number | null;
};

export type PathDiagnosticsSummary = {
  total: PathDiagnosticsSummaryBucket;
  by_side: { long: PathDiagnosticsSummaryBucket; short: PathDiagnosticsSummaryBucket };
  by_exit_reason: Record<string, PathDiagnosticsSummaryBucket>;
  by_entry_profile?: Record<string, PathDiagnosticsSummaryBucket>;
  by_entry_context_state?: Record<string, PathDiagnosticsSummaryBucket>;
  by_active_exit_profile?: Record<string, PathDiagnosticsSummaryBucket>;
};

export type PathDiagnosticsConfig = {
  schema: "trade_path_diagnostics" | string;
  version: string;
  window: string;
  open_trades: string;
  same_bar_level_policy: string;
  post_exit_bars: string;
};

export type ContextConsumptionAttribution = {
  role: string;
  component_id: string;
  context_ref: string;
  policy_id: string;
  applied: boolean;
  instance_id?: string | null;
};

export type DiagnosticBucketMetrics = {
  trades: number;
  pnl: number;
  gross_pnl: number;
  fees_paid: number;
  profit_factor: number | null;
  win_rate: number | null;
  avg_return_pct: number | null;
  avg_hold_bars: number | null;
};

export type ProfileBucketMetrics = DiagnosticBucketMetrics & {
  exit_reason_mix: Record<string, number>;
};

export type ProfileSideSection = Record<ExitProfileLabel | "total", ProfileBucketMetrics>;

export type ProfileSideBreakdown = {
  long: ProfileSideSection;
  short: ProfileSideSection;
  total: ProfileSideSection;
};

export type ExitReasonBucketMetrics = DiagnosticBucketMetrics;
export type BounceCounterBreakdown = {
  long: Record<string, DiagnosticBucketMetrics>;
  short: Record<string, DiagnosticBucketMetrics>;
  total: DiagnosticBucketMetrics;
};

export type FeeDiagnostics = {
  total_fees_paid: number;
  gross_pnl: number;
  net_pnl: number;
  fees_rate: number;
  fees_as_pct_of_gross_profit?: number | null;
};

export type QualityFlagBucketMetrics = {
  trades: number;
  avg_mfe_atr: number | null;
  avg_mfe_pct: number | null;
  avg_capture_ratio: number | null;
  avg_giveback_atr: number | null;
  avg_giveback_pct: number | null;
  exit_reason_mix: Record<string, number>;
};

export type ExitComponentQualityBucketMetrics = {
  trades: number;
  avg_mfe_atr: number | null;
  avg_mfe_pct: number | null;
  avg_capture_ratio: number | null;
  avg_giveback_atr: number | null;
  avg_giveback_pct: number | null;
  quality_flag_mix: Record<string, number>;
  signal_exit_winners: number;
  signal_exit_giveback_failures: number;
};

export type TradeQualityConfig = {
  schema: "trade-exit-quality-diagnostics-v1" | string;
  high_mfe_atr: number;
  high_mfe_pct_fallback: number;
  high_capture_ratio: number;
  low_capture_ratio: number;
  low_mfe_atr: number;
  low_mfe_pct_fallback: number;
  giveback_failure_atr: number;
  atr_source: string | null;
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
  /** Schema v4 */
  profile_breakdown?: Record<ExitProfileLabel, ProfileBucketMetrics>;
  /** Schema v5 — side × HTF entry profile */
  profile_side_breakdown?: ProfileSideBreakdown;
  exit_reason_breakdown?: Record<string, ExitReasonBucketMetrics>;
  fee_diagnostics?: FeeDiagnostics;
  quality_flag_breakdown?: Record<string, QualityFlagBucketMetrics>;
  exit_component_quality_breakdown?: Record<string, ExitComponentQualityBucketMetrics>;
  bounce_counter_breakdown?: BounceCounterBreakdown;
  /** Schema v6 */
  path_diagnostics_summary?: PathDiagnosticsSummary;
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
  trade_quality_config?: TradeQualityConfig | null;
  path_diagnostics_config?: PathDiagnosticsConfig | null;
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
  type: "integer" | "number" | "string" | "boolean" | "array";
  label?: string | null;
  min?: number | null;
  max?: number | null;
  enum?: string[] | null;
  default?: unknown;
};

export type ContextConsumptionPolicySchema = {
  policy_id: string;
  label: string;
  params_schema?: Record<string, ParamFieldSchema>;
};

export type ContextConsumptionRoleSchema = {
  role: string;
  label: string;
  policies: ContextConsumptionPolicySchema[];
};

export type ContextProviderSchema = {
  component_id: string;
  label: string;
  description?: string | null;
  params_schema?: Record<string, ParamFieldSchema>;
};

export type ComponentSchema = {
  component_id: string;
  role:
    | "direction"
    | "setup"
    | "trigger"
    | "blockers"
    | "exits"
    | "risk"
    | "exit_management";
  label: string;
  description?: string | null;
  params_schema?: Record<string, ParamFieldSchema>;
  /** When "nested", Composer nests params_schema keys under setup.params on save. */
  params_storage?: "flat" | "nested";
  list_slot?: boolean;
  supports_context_consumption?: boolean;
  context_consumption_policies?: ContextConsumptionPolicySchema[];
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
  context_providers?: ContextProviderSchema[];
  context_consumption_roles?: ContextConsumptionRoleSchema[];
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

export type ConfigListEntry = {
  experiment_id: string;
  path: string;
  updated_at: string;
};

export type ConfigStateResponse = {
  family: string;
  selected_experiment_id: string | null;
  selected_path: string | null;
  draft: StrategyConfigDraft | null;
  configs: ConfigListEntry[];
};

/** Exactly one field — mutual exclusion enforced by BFF (422 if both or neither). */
export type RunBacktestRequest =
  | { draft: StrategyConfigDraft; config_path?: never }
  | { config_path: string; draft?: never };

export type BacktestResult = {
  ok: boolean;
  run_id: string | null;
  config_path: string | null;
  errors: ValidationErrorItem[];
};

export type SignalTraceGate =
  | "direction_ok"
  | "blockers_ok"
  | "setup_ok"
  | "trigger_ok"
  | "risk_ok"
  | "stop_ready";

export type SetupComponentRef = {
  instance_id: string;
  component_id: string;
};

export type SetupParamsEntry = SetupComponentRef &
  Record<string, number | string | boolean>;

export type SignalTraceMeta = {
  variant: string;
  component_ids: {
    direction: string;
    setups: SetupComponentRef[];
    trigger: string;
    risk: string;
  };
  setup_params: SetupParamsEntry[];
  trigger_params?: { lookback: number };
  blocker_instances: { instance_id: string; component_id: string }[];
};

export type SideSignalTrace = {
  direction_ok: boolean[];
  blockers_ok: boolean[];
  setup_ok: boolean[];
  trigger_ok: boolean[];
  risk_ok: boolean[];
  signal_entry: boolean[];
  stop_ready: boolean[];
  portfolio_entry: boolean[];
  internals: Record<string, unknown>;
};

export type HtfContextTrace = {
  state: ("up" | "down" | "neutral")[];
  fast: Array<number | null>;
  anchor: Array<number | null>;
  slow: Array<number | null>;
  meta: Record<string, unknown>;
};

export type ContextConsumptionTraceRecord = {
  role: string;
  component_id: string;
  context_ref: string;
  policy_id: string;
  context_applied: boolean[];
  instance_id?: string | null;
  setup_instance_id?: string | null;
  outcome?: Record<string, unknown> | null;
};

export type ComponentEventType = "point" | "span_start" | "span_end" | "source";

export type ComponentEventRole = "entry_block" | "exit_signal" | "setup";

export type ComponentEvent = {
  time: number;
  event_type: ComponentEventType;
  role: ComponentEventRole;
  side: "long" | "short";
  component_id: string;
  instance_id: string;
  label: string;
  tooltip?: string | null;
  span_id?: string | null;
  feature_family?: string | null;
  source_timeframe?: string | null;
  base_timeframe?: string | null;
  metadata: Record<string, unknown>;
};

export type SignalTraceBundle = {
  times: number[];
  meta: SignalTraceMeta;
  htf_context?: HtfContextTrace;
  context_consumption_trace?: ContextConsumptionTraceRecord[];
  component_events?: ComponentEvent[];
  long: SideSignalTrace;
  short: SideSignalTrace;
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
