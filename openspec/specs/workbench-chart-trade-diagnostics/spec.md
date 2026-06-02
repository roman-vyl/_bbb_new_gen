# workbench-chart-trade-diagnostics Specification

## Purpose
TBD - created by archiving change trade-context-causal-diagnostics-v1. Update Purpose after archive.
## Requirements
### Requirement: Chart trade diagnostics distinguish wiring from causal context decisions

When the Chart tab displays a selected trade with schema v5 context fields, the diagnostics panel SHALL present **two separate sections** for context:

1. **Configured consumer (wiring)** — from `entry_context_consumption` / `exit_context_consumption` on the trade record (`context_ref`, `policy_id`, `component_id`, `instance_id` when present). This section answers which consumer/policy was attached to the trade, not the per-bar gate outcome.

2. **Bar decision (causal)** — from loaded `signal_trace` at the trade's entry bar index (and exit bar index for closed trades). This section answers what HTF state and policy result applied on that specific bar.

The panel MUST NOT label wiring fields as “applied at entry” without also showing causal gate/profile fields when trace data is available.

#### Scenario: Closed trade with trace shows entry gate block

- **WHEN** the user selects a closed trade whose entry bar index has `context_consumption_trace` for a blocker with `policy_id: htf_state_gate` and `context_applied[index] == false`
- **AND** signal trace is loaded for a window covering the entry bar
- **THEN** the **Entry bar decision** section shows gate result `block` (or equivalent label)
- **AND** the **Configured consumer** section still lists `policy_id: htf_state_gate` and `context_ref`

#### Scenario: HTF state at entry shown in causal section

- **WHEN** signal trace includes `htf_context.state` for the entry bar index
- **THEN** the **Entry bar decision** section shows that state value
- **AND** the separate field labeled for raw HTF state at entry (`entry_context_state` in Diagnostics) remains consistent with the same value

#### Scenario: Exit bar decision shows profile from trace outcome

- **WHEN** the user selects a closed long trade and exit bar index is inside the loaded trace window
- **AND** exit-policy consumption trace includes `outcome.profile_long`
- **THEN** the **Exit bar decision** section shows the profile label at the exit bar index
- **AND** it does not claim `context_applied` alone explains exit profile selection

#### Scenario: Trace not loaded shows explicit empty causal state

- **WHEN** a trade is selected but signal trace is not loaded or not `ready`
- **THEN** causal sections show an explicit message that bar-level decisions require signal trace
- **AND** wiring sections still render when v5 trade fields exist

#### Scenario: Entry bar outside trace window

- **WHEN** `entry_time_ms` does not resolve to an index inside the loaded trace series
- **THEN** the **Entry bar decision** section shows that the entry bar is outside the loaded trace window
- **AND** the UI does not infer gate results from trade wiring fields

### Requirement: Causal diagnostics do not compute HTF in the browser

Chart trade causal sections MUST read only from API-provided `signal_trace` and trade/report fields. The frontend MUST NOT recompute `htf_state_gate`, EMA stacks, or profile compilation from candles.

#### Scenario: No client-side gate recompute

- **WHEN** causal sections are rendered
- **THEN** `context_applied` and `htf_context.state` values are taken from the trace payload at the resolved bar index only

### Requirement: Chart trade diagnostics panel

When `selectedTradeId` is set, the Chart tab SHALL show a trade diagnostics panel listing the selected trade's fields:

- `trade_id`, `direction`, `status`
- `entry_time_ms`, `exit_time_ms`
- `entry_price`, `exit_price`
- `pnl`, `return_pct`, `gross_pnl`, `fees_paid`, `gross_return_pct` (when present)
- `exit_reason`, `exit_group`, `exit_profile`, `exit_component_id`, `exit_instance_id`, `exit_kind`
- `hold_bars`, `hold_minutes` (when present)
- `entry_profile`, `active_exit_profile`, `entry_context_state` (when present)
- `entry_context_consumption`, `exit_context_consumption` (when present, wiring section)

Field labels MUST distinguish:

- **HTF state at entry** (`entry_context_state`) — raw provider state on the entry bar
- **Exit profile** (`active_exit_profile`) — locked exit regime/profile for the trade lifetime
- **Configured consumer** — v5 `*_context_consumption` wiring attribution
- **Entry / Exit bar decision** — causal trace-backed sections per ADDED requirement above

The panel SHALL use the same field semantics as Reports trade detail and [`openspec/specs/ema-pullback-report-diagnostics/spec.md`](../../../../specs/ema-pullback-report-diagnostics/spec.md) for core trade fields.

#### Scenario: v4 trade without v5 consumption omits wiring sections

- **WHEN** the selected trade has no `entry_context_consumption` or `exit_context_consumption`
- **THEN** wiring sections are omitted
- **AND** causal sections still appear when trace data exists for entry/exit bars

#### Scenario: No trade selected hides panel

- **WHEN** `selectedTradeId` is not set
- **THEN** the Chart trade diagnostics panel is not shown (or shows only an instruction to select a trade)

#### Scenario: Unknown trade id shows empty state

- **WHEN** `selectedTradeId` is set but the trade is not found in the current variant's `trade_records`
- **THEN** the Chart trade diagnostics panel shows a neutral empty state (e.g. trade not found for current variant)

### Requirement: Selected trade diagnostics display break-even data read-only
When a selected trade includes a `break_even` object, Workbench trade diagnostics SHALL display a read-only Break-even section. The frontend MUST use API-provided fields and MUST NOT recompute break-even trigger, initial risk, or moved stop values from candles.

Displayed fields SHALL include:

- `enabled`
- `triggered`
- `trigger_r`
- `trigger_price`
- `trigger_time_ms`
- `stop_moved_to`
- `initial_stop_price`
- `initial_risk`
- `instance_id`
- `active_stop_management_source`

#### Scenario: Selected trade shows break-even section
- **GIVEN** the selected trade has a `break_even` object
- **WHEN** the Chart trade diagnostics panel renders
- **THEN** it shows a Break-even section
- **AND** the section displays the API-provided break-even fields

#### Scenario: Old trade omits break-even section
- **GIVEN** the selected trade has no `break_even` object
- **WHEN** the Chart trade diagnostics panel renders
- **THEN** the Break-even section is omitted
- **AND** the panel does not crash

#### Scenario: Frontend does not recompute break-even
- **GIVEN** candles and selected trade data are loaded
- **WHEN** the Break-even section renders
- **THEN** displayed values come from `trade.break_even`
- **AND** the frontend does not compute trigger price, initial risk, or stop movement from candle OHLC data

### Requirement: Break-even diagnostics do not add chart stop overlays
This slice SHALL NOT draw break-even stop lines or add new chart overlay runtime behavior.

#### Scenario: Break-even diagnostics are display-only
- **GIVEN** a selected trade includes `break_even`
- **WHEN** the Chart tab renders
- **THEN** no new stop-line overlay is added for break-even
- **AND** chart viewport, pan, and cache behavior remain unchanged

