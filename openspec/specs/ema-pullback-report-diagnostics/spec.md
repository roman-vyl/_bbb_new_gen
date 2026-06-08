## Purpose

Specify closed-trade diagnostic fields, variant metric breakdowns, context consumption attribution, and report schema versioning for ema_pullback research runs consumed by Workbench Reports and Chart.
## Requirements
### Requirement: Closed trade records include entry and exit diagnostics

For each `trade_records` row with `status == "closed"`, the research report SHALL include profile, context, exit attribution, fee split, and hold duration fields. Open trades MAY omit closed-only fields or set them to `null`.

Required closed-trade fields:

- `entry_profile`: `aligned` | `countertrend` | `neutral` — locked entry profile at the entry bar per ExitPolicyCompiler entry-lock semantics (same source as portfolio `locked_profile` at open), not recomputed from post-hoc context at exit.
- `entry_context_state`: `up` | `down` | `neutral` | `unknown` — HTF context at entry bar.
- `active_exit_profile`: `aligned` | `countertrend` | `neutral` — **locked trade profile for the position lifetime** (same value from entry lock until flat; not the profile of the winning exit rule).
- `exit_group`: `always_on` | `profile` | `null` — `null` when exit attribution is unknown or unattributable.
- `exit_profile`: `aligned` | `countertrend` | `neutral` | `null` — **profile bucket of the winning exit rule**; `null` when `exit_group == "always_on"` or when attribution is unknown/unattributable. MUST NOT be used interchangeably with `active_exit_profile`.
- `exit_component_id`, `exit_instance_id`, `exit_kind`: `string` | `null` — from exit attribution when attributable; `null` for unknown/unattributable exits or when not applicable.
- `gross_pnl`, `fees_paid` — monetary; `pnl` remains net (after fees).
- `gross_return_pct` — return before fees; `return_pct` remains net return.
- `hold_bars` — `exit_idx - entry_idx + 1` (inclusive bar span from entry through exit).
- `hold_minutes` — `hold_bars * base_timeframe_minutes`, where `base_timeframe_minutes` is derived from the run's base timeframe (e.g. via `pandas_freq_alias(timeframe)`).

#### Scenario: Closed trade exposes entry lock profile

- **WHEN** a backtest produces a closed long trade and exit attribution context is aligned with OHLCV index
- **THEN** the trade record `entry_profile` equals the profile locked at `entry_idx` from `profile_long` / entry-lock codes, not a profile inferred only at exit bar

#### Scenario: Active exit profile differs from winning exit profile bucket

- **WHEN** a closed trade was opened under entry-lock profile `countertrend` and the winning exit rule belongs to profile bucket `aligned`
- **THEN** `active_exit_profile` is `countertrend` and `exit_profile` is `aligned` with `exit_group` `profile`

#### Scenario: Always-on exit has null exit profile bucket

- **WHEN** the winning exit rule is always-on (not profile-scoped)
- **THEN** `exit_group` is `always_on` and `exit_profile` is `null`; `active_exit_profile` still reflects the locked trade profile for the position lifetime

#### Scenario: Signal exit attribution fields populated

- **WHEN** `exit_reason` matches `signal:<instance_id>` for a closed trade
- **THEN** `exit_instance_id` equals the instance id, `exit_kind` is `signal`, and `exit_component_id` matches the rule's `component_id` from the compiled exit policy

#### Scenario: Unknown exit attribution yields null metadata

- **WHEN** `exit_reason` is `unknown` or otherwise unattributable for a closed trade
- **THEN** `exit_group`, `exit_profile`, `exit_component_id`, `exit_instance_id`, and `exit_kind` are all `null`; `active_exit_profile` and `entry_profile` remain populated when entry context is available

#### Scenario: Hold duration from bar indices

- **WHEN** a closed trade has `entry_idx` and `exit_idx` on the OHLCV index
- **THEN** `hold_bars` equals `exit_idx - entry_idx + 1` and `hold_minutes` equals `hold_bars * base_timeframe_minutes`

#### Scenario: Net and gross PnL identity

- **WHEN** vectorbt reports entry/exit fees for a closed trade
- **THEN** `gross_pnl - fees_paid` equals `pnl` within floating-point tolerance (e.g. `1e-6` relative or absolute)

### Requirement: Variant metrics include diagnostic breakdowns

Each variant's `metrics` object SHALL include additive diagnostic sections computed only from closed `trade_records`:

- `profile_breakdown`: keys `aligned`, `countertrend`, `neutral`; each with `trades`, `pnl`, `gross_pnl`, `fees_paid`, `profit_factor`, `win_rate`, `avg_return_pct`, `avg_hold_bars`, `exit_reason_mix` (map of full `exit_reason` → count).
- `exit_reason_breakdown`: keyed by full `exit_reason` string; each with `trades`, `pnl`, `gross_pnl`, `fees_paid`, `win_rate`, `avg_return_pct`, `avg_hold_bars`.
- `fee_diagnostics`: `total_fees_paid`, `gross_pnl`, `net_pnl`, `fees_rate`, and `fees_as_pct_of_gross_profit` when gross profit sum > 0, else omitted or `null`.

#### Scenario: Profile breakdown trade counts sum to closed total

- **WHEN** a variant has N closed trades with known `entry_profile`
- **THEN** sum of `profile_breakdown[*].trades` equals N

#### Scenario: Exit reason breakdown trade counts sum to closed total

- **WHEN** a variant has N closed trades with an `exit_reason` other than `open`
- **THEN** sum of `exit_reason_breakdown[*].trades` equals N

#### Scenario: Fee rate matches execution config

- **WHEN** the run used portfolio fees rate `f` and fee diagnostics are computed
- **THEN** `fee_diagnostics.fees_rate` equals `f` (or is derived consistently from configured execution fees, not a hardcoded constant)

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

### Requirement: Context consumption trace records per consumer role

Signal trace and diagnostic payloads for ema_pullback runs SHALL include a `context_consumption_trace` array with one record per consumer that applied context on each traced index. Each record MUST include: `role`, `component_id`, `context_ref`, `policy_id`, `context_applied` (per-bar boolean series), and policy-specific `outcome` when applicable.

For `htf_state_gate` blocker records, `context_applied[i]` MUST equal the gate allow result on bar *i* (true = allow, false = block).

For `exit_policy` records, `context_applied` MUST NOT be interpreted as HTF gate semantics; profile selection causality is carried in `outcome.profile_long` / `outcome.profile_short` when present.

#### Scenario: Blocker gate trace matches runtime mask

- **WHEN** trace is built for a run with `htf_state_gate` on a blocker
- **THEN** `context_applied` on that record matches the blocker mask derived from the same gate function used in execution

#### Scenario: Exit policy trace includes profile outcome

- **WHEN** exit policy has `context_consumption` and trace is built
- **THEN** the exit_policy record includes `outcome.profile_long` and `outcome.profile_short` series aligned to the trace index

#### Scenario: Consumer without consumption omitted from trace

- **WHEN** setup has no `context_consumption`
- **THEN** no setup-role record appears in `context_consumption_trace` for that run

### Requirement: Entry and exit context attribution are separated in trade records

When report schema version 5 is enabled, closed trade records SHALL support separate `entry_context_consumption` and `exit_context_consumption` objects. These objects document **which consumer and policy were configured** for the trade (wiring attribution).

For entry-side `htf_state_gate` blockers, `entry_context_consumption.applied` MUST reflect whether the gate **allowed** context on the **entry bar** (`entry_idx`), using the same gate series as `context_consumption_trace` for that consumer. It MUST NOT be hardcoded to `true` when the gate blocked on the entry bar.

`entry_context_state` MUST continue to represent raw HTF provider state at entry for analytics. It MUST NOT be overloaded to encode gate allow/block or exit policy `policy_id`.

Causal per-bar allow/block and profile selection remain authoritative in `signal_trace.context_consumption_trace` (and related `htf_context` / `outcome` fields), not duplicated as a full time series on each trade row.

#### Scenario: Entry gate blocked on entry bar

- **WHEN** a closed trade's `entry_idx` fails `htf_state_gate` for the configured blocker consumption
- **THEN** `entry_context_consumption.applied` is `false`
- **AND** `entry_context_state` may still be populated with the raw HTF state at that bar

#### Scenario: Entry gate allowed on entry bar

- **WHEN** the gate allows on `entry_idx`
- **THEN** `entry_context_consumption.applied` is `true`

#### Scenario: Trade wiring vs trace causal remain distinct

- **WHEN** a consumer inspects both trade record and signal trace for the same run
- **THEN** trade `*_context_consumption` identifies configured `context_ref` and `policy_id`
- **AND** trace `context_applied[i]` explains bar *i* gate outcome for blockers

#### Scenario: Exit-only consumption leaves entry consumption null

- **WHEN** only exit policy consumes context
- **THEN** `exit_context_consumption` is populated and `entry_context_consumption` is null or absent

### Requirement: Report schema version 5 is additive with v4 compatibility

New runs that emit per-consumer context attribution SHALL set `report_schema_version` to `5`. Loaders MUST accept `report_schema_version` `4` and `3` without requiring v5 fields. v5-only fields MUST be absent on older artifacts.

#### Scenario: New run writes schema v5 when attribution enabled

- **WHEN** Phase 4 reporting is enabled for a backtest
- **THEN** `report_schema_version` is `5`

#### Scenario: Historical v4 report loads unchanged

- **WHEN** results_reader loads a persisted v4 report
- **THEN** the API returns the payload without error and without `entry_context_consumption`

### Requirement: Historical reports readable without old config authoring

Reading a historical report (v3/v4) or a run whose embedded `strategy_spec` still contains legacy `exit_policy.context` MUST NOT imply that Composer or validate API support authoring or validating that old config shape. Report display MAY surface legacy fields for forensics only.

#### Scenario: Old report loads without requiring new strategy shape in API

- **WHEN** results_reader loads a v4 report from before this change
- **THEN** the API returns the report successfully as a historical artifact

#### Scenario: Validate rejects old exit_policy.context for new drafts

- **WHEN** validate receives a new draft containing `trade_management.exit_policy.context`
- **THEN** validation fails even if a historical report on disk still embeds the legacy shape

### Requirement: Optional gate forensics in trace outcome

When trace enrichment is enabled for `htf_state_gate`, blocker trace records MUST include an `outcome` object with per-bar `state_at_bar` (HTF state labels) and the configured `allowed_states` list for display and forensics. Correctness of `context_applied` MUST NOT depend on this enrichment.

#### Scenario: Enriched trace exposes allowed states

- **WHEN** trace enrichment is enabled for `htf_state_gate`
- **THEN** the blocker trace record `outcome.allowed_states` matches the policy params on the strategy spec
- **AND** `outcome.state_at_bar[i]` matches `htf_context` state at index *i* for the consumed `context_ref`

### Requirement: Bounce counter entry diagnostics are available for configured setup

When an `ema_pullback` run uses `ema_bounce_counter_setup`, closed trade diagnostics SHALL include optional entry-bar bounce counter fields when the setup trace/state is available:

- `entry_trend_episode_id`
- `entry_effective_bounce_number`
- `entry_completed_bounce_count`
- `entry_bounce_counter_side`

These fields SHALL snapshot the setup component state at the trade's `entry_idx`. They MUST NOT be inferred from the number of trades, from later exit state, or from post-hoc raw-touch counting.

#### Scenario: Closed trade records bounce state at entry

- **GIVEN** a strategy run uses `ema_bounce_counter_setup`
- **AND** a closed long trade enters while `trend_episode_id` is `7`, `effective_bounce_number` is `2`, and `completed_bounce_count` is `1`
- **WHEN** the report builds the closed trade record
- **THEN** the record includes `entry_trend_episode_id: 7`
- **AND** `entry_effective_bounce_number: 2`
- **AND** `entry_completed_bounce_count: 1`
- **AND** `entry_bounce_counter_side: long`

#### Scenario: Diagnostics absent when setup is not configured

- **GIVEN** a strategy run uses a setup component other than `ema_bounce_counter_setup`
- **WHEN** the report builds closed trade records
- **THEN** bounce counter entry diagnostic fields are absent or `null`
- **AND** existing report diagnostics remain valid

#### Scenario: Entry diagnostics use entry index not exit index

- **GIVEN** a trade enters during bounce number `1`
- **AND** exits after the setup counter has advanced to a later bounce number
- **WHEN** the report builds the closed trade record
- **THEN** `entry_effective_bounce_number` reflects the setup state at `entry_idx`
- **AND** it does not reflect setup state at the exit bar

### Requirement: Bounce counter breakdowns can group variant performance

When bounce counter entry diagnostics are present, variant metrics MAY include bounce-level breakdowns keyed by side and entry effective bounce number. Any such breakdown SHALL be computed from closed `trade_records` only and SHALL preserve additive trade counts.

#### Scenario: Bounce breakdown counts closed trades

- **GIVEN** a variant has closed trade records with `entry_effective_bounce_number` values `1`, `2`, and `3`
- **WHEN** bounce counter breakdown metrics are computed
- **THEN** the sum of breakdown trade counts equals the number of closed trades with bounce counter diagnostics
- **AND** open trades are excluded from the breakdown

#### Scenario: Breakdown separates side

- **GIVEN** a variant has long and short closed trades with the same `entry_effective_bounce_number`
- **WHEN** bounce counter breakdown metrics are computed by side
- **THEN** long and short trades are not merged into the same side-specific bucket

### Requirement: Entry diagnostics namespace setup state by instance_id

When a strategy configures multiple setup instances, closed-trade (and bar-level, where applicable) entry diagnostics that capture setup-internal fields (e.g. `setup_allowed`, `completed_bounce_count`, `effective_bounce_number`, `trend_episode_id`) MUST be stored per setup `instance_id`. Diagnostic consumers MUST NOT rely on a single flat setup object that can be overwritten when two setups expose the same field names.

#### Scenario: Dual setup entry diagnostics

- **GIVEN** a backtest with `untouched_anchor_setup` and `ema_bounce_counter_setup` in `setups`
- **WHEN** a closed trade record includes entry setup diagnostics
- **THEN** diagnostics for each setup are addressable by that setup's `instance_id`
- **AND** bounce-counter fields remain available without clobbering untouched-anchor fields

#### Scenario: Single setup retains instance_id keying

- **GIVEN** a strategy with one setup instance `instance_id: setup`
- **WHEN** entry diagnostics are emitted
- **THEN** setup diagnostics are nested under `setup` (or equivalent map) keyed by `instance_id`

### Requirement: Closed trade records include optional break-even diagnostics
Closed `ema_pullback` trade records SHALL support an optional `break_even` object when a `break_even_stop` rule was active for that trade. The object SHALL be sourced from the Exit Management Combiner runtime state, not inferred only from post-hoc OHLC after portfolio simulation.

When present, `break_even` SHALL include:

- `enabled`
- `instance_id`
- `trigger_r`
- `trigger_price`
- `triggered`
- `trigger_time_ms` (unix ms, aligned with `entry_time_ms` / `exit_time_ms`)
- `stop_moved_to`
- `initial_stop_price`
- `initial_risk`
- `active_stop_management_source`

#### Scenario: Triggered break-even diagnostics
- **GIVEN** a closed trade had an active `break_even_stop` rule
- **AND** the trade reached the break-even trigger
- **WHEN** the report builds `trade_records`
- **THEN** the trade record includes `break_even.enabled` as true
- **AND** `break_even.triggered` is true
- **AND** `break_even.trigger_time_ms` is set
- **AND** `break_even.stop_moved_to` equals the combiner moved stop
- **AND** `break_even.initial_risk` equals the entry-time stop distance

#### Scenario: Configured but never triggered break-even diagnostics
- **GIVEN** a closed trade had an active `break_even_stop` rule
- **AND** the trade never reached the break-even trigger
- **WHEN** the report builds `trade_records`
- **THEN** the trade record includes `break_even.enabled` as true
- **AND** `break_even.triggered` is false
- **AND** `break_even.trigger_time_ms` is null
- **AND** `break_even.stop_moved_to` is null

#### Scenario: No active management omits diagnostics
- **GIVEN** a closed trade had no active `break_even_stop` rule
- **WHEN** the report builds `trade_records`
- **THEN** the `break_even` object is absent or has `enabled` false

#### Scenario: Profile override source is explicit
- **GIVEN** an `always_on` break-even rule exists
- **AND** the locked profile also has a break-even rule
- **WHEN** a trade opens under that locked profile
- **THEN** `trade_records[].break_even.instance_id` matches the profile rule
- **AND** `trade_records[].break_even.active_stop_management_source` is `profile`

#### Scenario: Always-on fallback source is explicit
- **GIVEN** an `always_on` break-even rule exists
- **AND** the locked profile has no break-even rule
- **WHEN** a trade opens
- **THEN** `trade_records[].break_even.instance_id` matches the `always_on` rule
- **AND** `trade_records[].break_even.active_stop_management_source` is `always_on`

### Requirement: Historical reports load without break-even diagnostics
Report readers and API contracts SHALL continue to accept historical reports whose `trade_records` do not contain `break_even`.

#### Scenario: Old report without break-even loads
- **GIVEN** a persisted report was created before break-even diagnostics existed
- **WHEN** the report is loaded through the API
- **THEN** the payload is returned without validation error
- **AND** missing `break_even` fields are treated as absent optional diagnostics

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

### Requirement: Closed trades include optional trade-management diagnostics
When diagnostic-only exit management is enabled and a trade is closed, the research report SHALL include a nested `trade_management` object on that closed trade record. Open trades MAY omit this object in v1.

The nested object SHALL include phase-at-exit diagnostics, max phase reached, bars-to-phase fields when reached, MFE-at-phase fields when reached, active-stop source/price at exit when available, exit-layer attribution when available, best price before exit, and giveback from best price.

Missing phase milestones SHALL be omitted or set to `null`; they MUST NOT be serialized as zero if the phase was not reached.

#### Scenario: Closed runner trade includes phase diagnostics
- **GIVEN** a diagnostic-only backtest closes a trade that reached `runner`
- **WHEN** the report builds the closed trade record
- **THEN** the trade record includes `trade_management.phase_at_exit: "runner"`
- **AND** `trade_management.max_phase_reached: "runner"`
- **AND** `trade_management.bars_to_proven`, `bars_to_protected`, and `bars_to_runner` are populated
- **AND** `trade_management.mfe_at_runner_pct` is populated

#### Scenario: Initial-risk trade does not fake later milestones
- **GIVEN** a diagnostic-only backtest closes a trade that never leaves `initial_risk`
- **WHEN** the report builds the closed trade record
- **THEN** `trade_management.phase_at_exit` is `initial_risk`
- **AND** `trade_management.max_phase_reached` is `initial_risk`
- **AND** runner-only fields are omitted or `null`
- **AND** runner-only fields are not serialized as `0`

#### Scenario: Open trades omit v1 runtime diagnostics
- **GIVEN** a diagnostic-only backtest has an open trade at report time
- **WHEN** the report builds trade records
- **THEN** the open trade omits the nested `trade_management` object in v1
- **AND** existing open-trade fields continue to serialize as before

### Requirement: Variant metrics include trade-management summary
When at least one closed trade contains trade-management diagnostics, the variant metrics SHALL include `trade_management_summary`.

For `diagnostic_only` reports, existing v1 summary fields (`by_phase_reached`, `runner_capture_summary`, exit-layer diagnostics where present) SHALL remain supported.

For `managed` reports, `trade_management_summary` SHALL additionally include the managed layer breakdown fields defined in this change.

#### Scenario: Diagnostic-only summary unchanged
- **GIVEN** a report produced from `mode: "diagnostic_only"`
- **WHEN** variant metrics are read
- **THEN** `trade_management_summary.by_phase_reached` is present when phases were reached
- **AND** managed-only breakdown fields are absent or empty

#### Scenario: Managed summary includes layer breakdowns
- **GIVEN** a report produced from `mode: "managed"` with closed trades
- **WHEN** variant metrics are read
- **THEN** `trade_management_summary.exit_layer_breakdown` is present

### Requirement: Diagnostic reports include runtime event trace
When diagnostic-only exit management is enabled, the variant payload SHALL include `trade_management_events` containing runtime events emitted for phase changes and executed exits. The event trace SHALL be ordered by bar index and event creation order within the bar.

Each event SHALL include trade id, time, bar index, side, event type, phase transition fields, rule/component identifiers when available, price/stop fields when available, MFE/MAE percent, bars in trade, and metadata.

#### Scenario: Variant includes phase transition event
- **GIVEN** a diagnostic-only trade moves from `initial_risk` to `proven`
- **WHEN** the report builds the variant payload
- **THEN** `trade_management_events` includes a `phase_changed` event for that trade
- **AND** the event identifies the triggering phase rule id

#### Scenario: Variant omits event trace when runtime disabled
- **GIVEN** a report was produced from a config without `exit_management`
- **WHEN** the report builds the variant payload
- **THEN** `trade_management_events` is absent

### Requirement: Trade-management diagnostics remain additive for report compatibility
Reports with trade-management diagnostics SHALL remain backward-compatible for existing readers that ignore unknown optional fields. Historical reports without nested trade-management diagnostics MUST load unchanged and MUST NOT be silently migrated.

#### Scenario: Historical report loads without trade-management block
- **GIVEN** a persisted report with `report_schema_version` 6 and no `trade_management_summary`
- **WHEN** result loading or candidate summary extraction reads the report
- **THEN** loading succeeds
- **AND** the payload is not mutated to add empty trade-management diagnostics

#### Scenario: New diagnostics do not break summary extraction
- **GIVEN** a new diagnostic-only report includes nested closed-trade `trade_management` blocks
- **AND** variant metrics include `trade_management_summary`
- **WHEN** batch summary extraction runs
- **THEN** extraction succeeds
- **AND** existing summary fields retain their previous meaning

### Requirement: Managed mode extends closed-trade diagnostics with exit attribution
When `exit_management.mode` is `managed` and a trade is closed, the nested `trade_management` object on that closed trade record SHALL include managed exit attribution fields:

- `active_stop_at_exit` (price or null)
- `active_take_at_exit` (profile action or descriptor)
- `exit_layer` (`exit_policy` or `exit_management`)
- `exit_rule_id`
- `exit_component_id`

These fields SHALL be generic across all managed components and SHALL NOT require component-specific report keys.

#### Scenario: Managed breakeven close includes layer attribution
- **GIVEN** a managed report where a trade closed via `break_even_stop`
- **WHEN** the trade record is read
- **THEN** `trade_management.exit_layer` is `exit_management`
- **AND** `trade_management.exit_component_id` is `break_even_stop`
- **AND** `trade_management.active_stop_at_exit` is populated

#### Scenario: Exit policy close retains exit_policy layer
- **GIVEN** a managed report where a trade closed via initial stop loss without a winning managed candidate
- **WHEN** the trade record is read
- **THEN** `trade_management.exit_layer` is `exit_policy`

### Requirement: Managed variant metrics include layer breakdowns
When a variant is produced from a managed config with at least one closed trade, `trade_management_summary` SHALL include generic breakdown sections:

- `exit_layer_breakdown`
- `stop_management_breakdown` keyed by `rule_id` and/or `component_id`
- `take_management_breakdown` keyed by `rule_id` and/or `component_id`
- `runtime_exit_breakdown` keyed by `rule_id` and/or `component_id`

Adding a new managed component SHALL populate these breakdowns without a report schema change.

#### Scenario: Stop management breakdown includes break_even_stop
- **GIVEN** a managed report with closes attributed to `break_even_stop`
- **WHEN** variant metrics are read
- **THEN** `trade_management_summary.stop_management_breakdown` includes an entry for `break_even_stop`

#### Scenario: Take management breakdown includes profile switch
- **GIVEN** a managed report where `take_profile_switch` changed outcomes
- **WHEN** variant metrics are read
- **THEN** `trade_management_summary.take_management_breakdown` includes an entry for `take_profile_switch`

### Requirement: Managed event trace includes all uniform managed event types
When `exit_management.mode` is `managed`, the variant payload `trade_management_events` SHALL include the uniform managed event types when emitted:

- `phase_changed`
- `active_stop_updated`
- `active_take_updated`
- `runtime_exit_triggered`
- `exit_rule_triggered`
- `exit_executed`

#### Scenario: Managed report includes active stop update events
- **GIVEN** a managed run where an active stop was placed
- **WHEN** the full report is loaded
- **THEN** `trade_management_events` contains at least one `active_stop_updated` event

### Requirement: Comparison summary supports generic baseline versus managed analysis
When a comparison run provides baseline and managed variants, the managed variant metrics SHALL include `baseline_vs_managed_summary` with generic fields including:

- `saved_by_managed_stop`
- `hurt_by_managed_stop`
- `take_disabled_then_won`
- `take_disabled_then_lost`
- `runtime_exit_helped`
- `runtime_exit_hurt`
- `exit_layer_transition_matrix`

Component-specific labels such as `be_helped` SHALL be derived views and SHALL NOT be required as separate top-level report schema fields.

#### Scenario: Comparison summary present for paired runs
- **GIVEN** a comparison artifact with baseline and managed variants on the same fixture
- **WHEN** the managed variant metrics are read
- **THEN** `baseline_vs_managed_summary` is present
- **AND** `exit_layer_transition_matrix` is populated

