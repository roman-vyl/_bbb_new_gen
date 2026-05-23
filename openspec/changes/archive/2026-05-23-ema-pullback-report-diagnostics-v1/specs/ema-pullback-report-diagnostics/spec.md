## ADDED Requirements

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
- `fee_diagnostics`: `total_fees_paid`, `gross_pnl`, `net_pnl`, `fees_rate`, and `fees_as_pct_of_gross_profit` when gross profit sum &gt; 0, else omitted or `null`.

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

New ema_pullback research run payloads SHALL set `report_schema_version` to `4`. Loaders SHALL continue to accept `report_schema_version` `3` without requiring new fields. New diagnostic fields SHALL be absent on v3 artifacts.

#### Scenario: New run writes schema v4

- **WHEN** `build_research_run_payload` assembles a new run after this change
- **THEN** `report_schema_version` is `4`

#### Scenario: API serves v3 historical report

- **WHEN** `results_reader` loads a persisted report with `report_schema_version` 3
- **THEN** the API returns the payload without error and without requiring `profile_breakdown` or enriched trade fields

#### Scenario: Frontend types treat new fields as optional

- **WHEN** TypeScript `TradeRecord` / `VariantMetrics` types are updated
- **THEN** all v4-only fields are optional so v3 fixtures and tests still type-check

### Requirement: Diagnostics do not alter strategy behavior

Implementation of report diagnostics MUST NOT change signal generation, exit compilation, portfolio simulation parameters, or component registry. Only serialization and post-hoc aggregation of existing simulation outputs may change.

#### Scenario: Exit and signal trace regressions unchanged

- **WHEN** existing exit attribution and signal trace tests run after the diagnostics change
- **THEN** they pass without modified golden expectations for trading outputs (only report JSON shape may differ)
