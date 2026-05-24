## ADDED Requirements

### Requirement: Closed trade records include direction-aware excursion metrics

For each `trade_records` row with `status == "closed"` in a newly generated schema v5 report, the research report SHALL include post-trade MFE / MAE metrics computed over the inclusive candle span from `entry_idx` through `exit_idx`.

Required closed-trade fields:

- `mfe_price`, `mfe_pct`, `mfe_atr`
- `mae_price`, `mae_pct`, `mae_atr`
- `bars_to_mfe`, `bars_to_mae`

For long trades, MFE MUST use `max(high over entry_idx..exit_idx inclusive) - entry_price`, MAE MUST use `min(low over entry_idx..exit_idx inclusive) - entry_price`, and `mae_price` MUST be `<= 0` when valid.

For short trades, MFE MUST use `entry_price - min(low over entry_idx..exit_idx inclusive)`, MAE MUST use `entry_price - max(high over entry_idx..exit_idx inclusive)`, and `mae_price` MUST be `<= 0` when valid.

`*_pct` fields MUST divide the corresponding price distance by `entry_price`. `*_atr` fields MUST divide the corresponding price distance by the entry-bar ATR from an explicit `diagnostic_atr_series` when that series is passed and the entry ATR value is positive; otherwise ATR-normalized fields MUST be `null`.

V1 MUST NOT auto-discover ATR columns by fuzzy name matching. Price and percent fields remain required for schema v5 closed trades even when ATR-normalized fields are `null`.

MFE / MAE are bar-level diagnostics. The entry and exit bars MUST be included. For intrabar stop/take exits, exit-bar high/low MAY include movement after the fill because v1 does not reconstruct intrabar order.

`bars_to_mfe` and `bars_to_mae` MUST be zero-based relative to `entry_idx`, where the entry bar is `0`. If multiple bars have the same MFE or MAE value, v1 MUST use the first occurrence.

#### Scenario: Long trade excursion uses highs and lows

- **GIVEN** a closed long trade with `entry_price=100`, entry-to-exit highs `[101, 110, 106]`, and lows `[99, 98, 103]`
- **WHEN** trade diagnostics are computed
- **THEN** `mfe_price` is `10`, `mae_price` is `-2`, `bars_to_mfe` is `1`, and `bars_to_mae` is `1`

#### Scenario: Short trade excursion mirrors long calculations

- **GIVEN** a closed short trade with `entry_price=100`, entry-to-exit highs `[101, 103, 98]`, and lows `[99, 95, 96]`
- **WHEN** trade diagnostics are computed
- **THEN** `mfe_price` is `5`, `mae_price` is `-3`, `bars_to_mfe` is `1`, and `bars_to_mae` is `1`

#### Scenario: ATR-normalized fields are nullable when ATR is unavailable

- **GIVEN** a closed trade with valid high, low, entry, and exit prices but no positive entry ATR value
- **WHEN** trade diagnostics are computed
- **THEN** price and percent excursion fields are populated and `mfe_atr` and `mae_atr` are `null`

#### Scenario: ATR columns are not fuzzy-discovered

- **GIVEN** an enriched frame with columns named like ATR values but no explicit `diagnostic_atr_series` passed to trade quality helpers
- **WHEN** trade diagnostics are computed
- **THEN** all `*_atr` fields are `null`

#### Scenario: First occurrence wins for tied MFE and MAE

- **GIVEN** a closed long trade with duplicate best highs and duplicate worst lows in the entry-to-exit span
- **WHEN** trade diagnostics are computed
- **THEN** `bars_to_mfe` and `bars_to_mae` use the first bar where each extreme value appears

#### Scenario: Exit bar is included for bar-level diagnostics

- **GIVEN** a closed trade whose exit occurs by stop or take-profit inside the exit bar
- **WHEN** trade diagnostics are computed
- **THEN** the exit bar high/low is included in MFE / MAE calculations and the result is documented as bar-level diagnostics that may include post-fill intrabar movement

### Requirement: Closed trade records include capture and giveback metrics

For each `trade_records` row with `status == "closed"` in a newly generated schema v5 report, the research report SHALL include capture and giveback metrics comparing realized exit outcome to MFE.

Required closed-trade fields:

- `captured_price`, `captured_pct`, `captured_atr`
- `capture_ratio`
- `giveback_price`, `giveback_pct`, `giveback_atr`
- `bars_from_mfe_to_exit`

For long trades, `captured_price` MUST equal `exit_price - entry_price`. For short trades, `captured_price` MUST equal `entry_price - exit_price`. `capture_ratio` MUST equal `captured_price / mfe_price` when `mfe_price > 0`, else `null`. `giveback_price` MUST equal `mfe_price - captured_price` and MUST NOT be negative except where invalid values result in `null`.

`bars_from_mfe_to_exit` MUST equal `exit_idx - mfe_idx`, where `mfe_idx` is the absolute bar index selected for `bars_to_mfe`.

#### Scenario: Long winner captures part of available move

- **GIVEN** a closed long trade with `entry_price=100`, best post-entry high `110`, `exit_price=106`, and positive entry ATR `2`
- **WHEN** trade diagnostics are computed
- **THEN** `mfe_price` is `10`, `captured_price` is `6`, `capture_ratio` is `0.6`, `giveback_price` is `4`, `captured_atr` is `3`, and `giveback_atr` is `2`

#### Scenario: Short winner captures part of available move

- **GIVEN** a closed short trade with `entry_price=100`, best post-entry low `90`, and `exit_price=94`
- **WHEN** trade diagnostics are computed
- **THEN** `mfe_price` is `10`, `captured_price` is `6`, `capture_ratio` is `0.6`, and `giveback_price` is `4`

#### Scenario: Exit after MFE records delay from peak

- **GIVEN** a closed trade whose MFE occurs 18 bars after entry and whose exit occurs 25 bars after entry
- **WHEN** trade diagnostics are computed
- **THEN** `bars_to_mfe` is `18` and `bars_from_mfe_to_exit` is `7`

### Requirement: Closed trade records include exit quality flags

For each `trade_records` row with `status == "closed"` in a newly generated schema v5 report, the research report SHALL include `quality_flags` as a list of zero or more strings.

Supported v1 flags:

- `high_mfe_high_capture`
- `high_mfe_low_capture`
- `signal_exit_winner`
- `signal_exit_giveback_failure`
- `stop_loss_after_low_mfe`
- `stop_loss_after_bad_context`

Flags MUST be additive, not mutually exclusive. Entry context used by `stop_loss_after_bad_context` MUST be the entry-bar context already recorded on the trade; future candles from the entry-to-exit span MUST NOT be used to compute entry context.

#### Scenario: High MFE and high capture flag a good entry and exit

- **GIVEN** a closed trade with high MFE and `capture_ratio >= 0.60`
- **WHEN** quality flags are computed
- **THEN** `quality_flags` contains `high_mfe_high_capture`

#### Scenario: High MFE and low capture flag giveback

- **GIVEN** a closed trade with high MFE and `capture_ratio < 0.30`
- **WHEN** quality flags are computed
- **THEN** `quality_flags` contains `high_mfe_low_capture`

#### Scenario: Signal exit winner uses attribution and capture

- **GIVEN** a closed trade with `exit_kind == "signal"`, positive `captured_price`, and `capture_ratio >= 0.60`
- **WHEN** quality flags are computed
- **THEN** `quality_flags` contains `signal_exit_winner`

#### Scenario: Signal exit giveback failure uses attribution and giveback

- **GIVEN** a closed trade with `exit_kind == "signal"`, high MFE, and low capture or large giveback
- **WHEN** quality flags are computed
- **THEN** `quality_flags` contains `signal_exit_giveback_failure`

#### Scenario: Stop loss after low MFE flags weak entry potential

- **GIVEN** a closed trade attributed to a stop-loss exit with low MFE
- **WHEN** quality flags are computed
- **THEN** `quality_flags` contains `stop_loss_after_low_mfe`

#### Scenario: Stop loss after bad context uses entry context only

- **GIVEN** a closed long trade attributed to a stop-loss exit whose `entry_context_state` is `down` or `neutral`
- **WHEN** quality flags are computed after the trade closes
- **THEN** `quality_flags` contains `stop_loss_after_bad_context` and no post-entry candle is used to derive that entry context

### Requirement: Variant metrics include exit quality aggregate breakdowns

Each variant's `metrics` object in a newly generated schema v5 report SHALL include additive aggregate sections computed only from closed `trade_records`:

- `quality_flag_breakdown`: keyed by quality flag, each with `trades`, `avg_mfe_atr`, `avg_mfe_pct`, `avg_capture_ratio`, `avg_giveback_atr`, `avg_giveback_pct`, and `exit_reason_mix`.
- `exit_component_quality_breakdown`: keyed by `exit_component_id`, each with `trades`, `avg_mfe_atr`, `avg_mfe_pct`, `avg_capture_ratio`, `avg_giveback_atr`, `avg_giveback_pct`, `quality_flag_mix`, `signal_exit_winners`, and `signal_exit_giveback_failures`.

Trades without a given `quality_flags` value MUST NOT contribute to that flag's bucket. Trades without an `exit_component_id` MUST NOT contribute to `exit_component_quality_breakdown`.

Aggregate averages MUST ignore `null` values and MUST return `null` when no non-null values exist for that metric. They MUST NOT coerce missing ATR-normalized values to `0`.

#### Scenario: Quality flag counts sum by membership

- **GIVEN** a variant with three closed trades where two contain `high_mfe_low_capture`
- **WHEN** `quality_flag_breakdown` is built
- **THEN** `quality_flag_breakdown.high_mfe_low_capture.trades` is `2`

#### Scenario: Exit component breakdown summarizes ema cross runner exits

- **GIVEN** closed trades with `exit_component_id == "ema_cross_loss_exit"` and populated capture metrics
- **WHEN** `exit_component_quality_breakdown` is built
- **THEN** the `ema_cross_loss_exit` bucket includes trade count, average MFE, average capture ratio, average giveback, `signal_exit_winners`, and `signal_exit_giveback_failures`

#### Scenario: Aggregate averages preserve null ATR values

- **GIVEN** a quality flag bucket where every closed trade has `mfe_atr == null` and `giveback_atr == null`
- **WHEN** `quality_flag_breakdown` is built
- **THEN** `avg_mfe_atr` and `avg_giveback_atr` are `null`, not `0`

### Requirement: Generated reports include trade quality configuration metadata

Newly generated reports SHALL set `report_schema_version` to `5` and SHALL include top-level `trade_quality_config` metadata documenting the thresholds and ATR source used for exit quality diagnostics.

Required `trade_quality_config` fields:

- `schema`: `trade-exit-quality-diagnostics-v1`
- `high_mfe_atr`: `2.0`
- `high_mfe_pct_fallback`: `0.02`
- `high_capture_ratio`: `0.60`
- `low_capture_ratio`: `0.30`
- `low_mfe_atr`: `1.0`
- `low_mfe_pct_fallback`: `0.005`
- `giveback_failure_atr`: `1.5`
- `atr_source`: string or `null`

`atr_source` MUST be `null` when no explicit `diagnostic_atr_series` is used.

#### Scenario: New report writes schema v5 with threshold metadata

- **GIVEN** a new ema-pullback research run with trade quality diagnostics enabled
- **WHEN** `build_research_run_payload` assembles the report
- **THEN** `report_schema_version` is `5` and `trade_quality_config` contains the v1 threshold values used by the analyzer

#### Scenario: ATR source metadata is null without explicit ATR

- **GIVEN** no explicit `diagnostic_atr_series` is passed to trade quality helpers
- **WHEN** the report payload is assembled
- **THEN** `trade_quality_config.atr_source` is `null`

### Requirement: Report readers and UI contracts preserve backward compatibility

Report readers and Workbench TypeScript contracts SHALL treat all new v5 trade, aggregate, and `trade_quality_config` fields as optional for existing v3 and v4 artifacts. Readers MUST keep accepting v3/v4, and the API SHALL serve persisted reports without recomputing exit quality diagnostics.

#### Scenario: Existing v4 report without exit quality fields still loads

- **GIVEN** a persisted schema v4 report that contains existing diagnostics but not MFE, MAE, capture, giveback, quality flags, or exit quality aggregates
- **WHEN** `results_reader` parses the report and Workbench loads it
- **THEN** parsing succeeds and missing new fields are represented as absent or `null` optional fields

#### Scenario: New v5 report loads through API and frontend contracts

- **GIVEN** a persisted schema v5 report with exit quality fields and `trade_quality_config`
- **WHEN** `results_reader` parses the report and Workbench loads it
- **THEN** parsing succeeds and the serialized v5 fields are available to the UI as optional contract fields

#### Scenario: API does not recompute diagnostics

- **GIVEN** a persisted report with trade records and aggregate metrics
- **WHEN** the BFF serves the run report
- **THEN** it returns serialized fields from the report and does not calculate MFE, MAE, capture, giveback, or quality flags

### Requirement: Workbench reports expose exit quality diagnostics

Workbench SHALL display optional exit quality diagnostics in trade tables and selected-trade chart diagnostics when the fields are present, and SHALL keep rendering older reports when they are absent.

The trade table SHALL include columns for MFE %, MAE %, capture %, capture ratio, giveback %, and quality flags. The Reports filters SHALL include quality filters for high MFE high capture, high MFE low capture, signal exit winners, signal exit giveback failures, stop loss after low MFE, and bad-context stop losses.

The selected-trade chart diagnostics panel SHALL display MFE, MAE, captured, capture ratio, giveback, bars to MFE, bars from MFE to exit, and quality flags for a selected closed trade when available.

#### Scenario: Trade table renders new diagnostic columns

- **GIVEN** a loaded report whose closed trade has MFE, MAE, capture, giveback, and quality flag fields
- **WHEN** the Reports trade table renders
- **THEN** the row shows MFE %, MAE %, capture %, capture ratio, giveback %, and quality flags

#### Scenario: Quality filter selects high MFE low capture trades

- **GIVEN** a report with one trade containing `high_mfe_low_capture` and one trade without that flag
- **WHEN** the high MFE low capture filter is active
- **THEN** only the trade containing `high_mfe_low_capture` remains visible

#### Scenario: Chart diagnostics show selected trade exit quality

- **GIVEN** a selected closed trade with populated exit quality diagnostics
- **WHEN** the chart diagnostics panel renders
- **THEN** it displays MFE, MAE, captured, capture ratio, giveback, bars to MFE, bars from MFE to exit, and quality flags
