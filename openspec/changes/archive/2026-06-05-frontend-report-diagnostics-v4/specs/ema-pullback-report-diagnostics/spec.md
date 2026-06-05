## ADDED Requirements

### Requirement: Closed trades include nested path diagnostics

For each `trade_records` row with `status == "closed"` and valid OHLCV indices, the research report SHALL include `path_diagnostics` computed only over bars **entry through actual exit** (inclusive). No post-exit bars SHALL be included.

`path_diagnostics` SHALL contain `mfe`, `mae`, and `capture` with fields as defined in the change design (non-negative `mfe`/`mae` `price_move`, `capture_ratio` nullable when `MFE_price <= 0`, negative `capture_ratio` allowed on losing trades with positive MFE).

Open trades SHALL **omit** keys `path_diagnostics` and `reference_levels` (not `null`).

All path metrics MUST be computed in `trade_analyzer.py` as the single formula source; consumers MUST NOT recompute from raw OHLC.

#### Scenario: Long trade MFE inside executed window

- **WHEN** a closed long trade has valid `entry_idx`, `exit_idx`, and OHLC
- **THEN** `path_diagnostics.mfe.price_move` equals `max(0, max(high[entry..exit]) - entry_price)`
- **AND** no bar after `exit_idx` is used

#### Scenario: Losing trade negative capture_ratio

- **WHEN** a closed long trade has `entry_price` 100, maximum high 108 in window, and `exit_price` 95
- **THEN** `path_diagnostics.capture.capture_ratio` is approximately `-0.625`
- **AND** `capture_ratio` is not clamped to zero

#### Scenario: Zero MFE null capture and giveback

- **WHEN** `path_diagnostics.mfe.price_move` is 0
- **THEN** `capture.capture_ratio`, `giveback_price`, and `giveback_pct` are `null`

#### Scenario: Giveback exceeds MFE on loser

- **WHEN** `mfe.price_move` is 8 and `realized_favorable_move` is -5
- **THEN** `capture.giveback_price` is 13 and `giveback_pct` is `0.13` when `entry_price` is 100

### Requirement: Closed trades include reference level diagnostics

Every closed trade with path diagnostics SHALL include `reference_levels` with boolean `reference_levels_available`.

When `reference_levels_available` is `false`, level fields are `null`, reach flags `false`, `first_level_hit` is `none`, timing fields `null`.

When `reference_levels_available` is `true`, initial SL/TP prices and touch flags reflect the entry..exit window; `first_level_hit` is `take_profit`, `stop_loss`, `ambiguous_same_bar`, or `none` (levels known but untouched).

Same-bar TP+SL touch SHALL yield `ambiguous_same_bar` without intrabar ordering guess.

Reference level logic MUST live in `trade_analyzer.py` (may call `exit_attribution` helpers).

#### Scenario: TP before SL on separate bars

- **WHEN** initial TP is touched on bar `t` before SL on any later bar
- **THEN** `first_level_hit` is `take_profit`

#### Scenario: Levels unavailable

- **WHEN** no usable initial SL or TP at entry
- **THEN** `reference_levels_available` is `false`

#### Scenario: Open trade omits nested keys

- **WHEN** `status` is not `closed`
- **THEN** the trade record has no `path_diagnostics` or `reference_levels` keys

### Requirement: Variant metrics include path diagnostics summary

`metrics` SHALL include `path_diagnostics_summary` with required buckets `total`, `by_side.long`, `by_side.short`, and `by_exit_reason` keyed by full `exit_reason`.

Each bucket SHALL include at minimum: `trade_count`, MFE/MAE percentile summaries, capture/giveback averages and medians, reference-level counts (`reference_levels_available_count`, `reference_levels_unavailable_count`, `no_reference_level_hit_count` where the latter counts only `reference_levels_available=true` and `first_level_hit=none`), and bar-timing aggregates per design.

Optional buckets MAY include `by_entry_profile`, `by_entry_context_state`, `by_active_exit_profile` when those fields exist on trades.

#### Scenario: Summary trade count

- **WHEN** N closed trades have `path_diagnostics`
- **THEN** `path_diagnostics_summary.total.trade_count` equals N

#### Scenario: Unavailable levels not counted as no hit

- **WHEN** one trade has `reference_levels_available` false and one has available true with `first_level_hit` none
- **THEN** `reference_levels_unavailable_count` is 1 and `no_reference_level_hit_count` is 1

### Requirement: Flat v5 fields match nested v6 values

Schema v6 closed trades SHALL continue emitting flat fields (`mfe_pct`, `mae_pct`, `capture_ratio`, `giveback_pct`, `bars_to_mfe`, `bars_to_mae`, `bars_from_mfe_to_exit`, `quality_flags`, etc.) populated from the same `trade_analyzer` computation as nested fields.

#### Scenario: Flat mfe_pct equals nested mfe pct

- **WHEN** a v6 closed trade has both `mfe_pct` and `path_diagnostics.mfe.pct`
- **THEN** values match within floating-point tolerance

### Requirement: Path diagnostics config on v6 runs

New runs SHALL set `report_schema_version` to `6` and include `path_diagnostics_config` with `schema` `trade_path_diagnostics`, `version` `1`, and window policy fields (no thresholds).

#### Scenario: New run schema v6

- **WHEN** `build_research_run_payload` assembles a new run after this change
- **THEN** `report_schema_version` is `6`

### Requirement: Compact run summary artifact alongside full report

When `write_research_results` persists a full run report at `research/results/runs/<RUN_ID>.json`, the system SHALL also write `research/results/runs/<RUN_ID>.summary.json` in the same directory.

The summary file SHALL be a projection of the full report without per-trade heavy arrays. It MUST NOT replace or alter the full report file or `latest.json`.

The summary payload SHALL include top-level run metadata from the full report (`report_schema_version`, `run_id`, `family`, `symbol`, `timeframe`, `created_at`, `path_diagnostics_config`, `trade_quality_config`, `batch_metadata`, and other non-heavy top-level fields present in the full report).

Per variant, the summary SHALL retain `variant`, `config_id`, `metrics`, `strategy_spec`, `component_counters`, and other non-heavy variant fields. It SHALL omit `trade_records` and other known heavy keys (`trades`, `candles`, `ohlcv`, `component_events`, `signal_trace`, `trace`).

Before omitting `trade_records`, the summary SHALL add `trade_records_count`, `closed_trades_count`, and `open_trades_count` per variant.

The summary SHALL include markers written last (so they override any same-named keys from the full payload): `artifact_kind` `run_summary`, `summary_schema_version` `1`, and `source_report_path` pointing at the full report path.

`build_compact_report_payload` MUST NOT mutate the input full report in place.

#### Scenario: Summary written on save

- **WHEN** `write_research_results` saves a run with `run_id` `R`
- **THEN** `research/results/runs/R.summary.json` exists
- **AND** `research/results/runs/R.json` still contains full `trade_records`

#### Scenario: Summary omits trade records

- **WHEN** a variant in the full report has `trade_records`
- **THEN** the summary variant has no `trade_records` key
- **AND** `trade_records_count` equals the full report trade count

#### Scenario: Summary retains path diagnostics aggregates

- **WHEN** variant `metrics` includes `path_diagnostics_summary`
- **THEN** the summary variant `metrics.path_diagnostics_summary` matches the full report

#### Scenario: Summary markers win on collision

- **WHEN** the full report contains `artifact_kind` or `summary_schema_version` keys
- **THEN** the summary file still has `artifact_kind` `run_summary` and `summary_schema_version` `1`

## MODIFIED Requirements

### Requirement: Report schema version 4 with backward-compatible v3

New ema_pullback research run payloads SHALL set `report_schema_version` to **6** after this change. Loaders SHALL accept **3**, **4**, and **5** without requiring nested path fields. Historical artifacts MUST NOT be silently migrated.

#### Scenario: API serves v5 report without migration

- **WHEN** a persisted report has `report_schema_version` 5
- **THEN** the API returns it unchanged without requiring `path_diagnostics`

#### Scenario: Batch summary on v5

- **WHEN** `extract_candidate_summary` runs on a v5 report
- **THEN** extraction succeeds with the same required fields as before

### Requirement: Diagnostics do not alter strategy behavior

Path diagnostics serialization MUST NOT change signal generation, exit compilation, or portfolio simulation parameters.

#### Scenario: Trade count unchanged

- **WHEN** a baseline backtest is re-run with v6 serialization enabled
- **THEN** trade count and net PnL match baseline within tolerance
