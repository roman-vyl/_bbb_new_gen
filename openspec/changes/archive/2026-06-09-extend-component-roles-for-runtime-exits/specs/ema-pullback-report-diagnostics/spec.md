## ADDED Requirements

### Requirement: Exit attribution uses normalized exit_layer and exit_owner
Closed trade records and managed `exit_executed` events SHALL use a precise machine `exit_layer` and a coarse `exit_owner` rollup.

Allowed `exit_layer` values:

- `exit_policy`
- `exit_management.stop_rule`
- `exit_management.take_rule`
- `exit_management.runtime_exit`

Allowed `exit_owner` values:

- `exit_policy`
- `exit_management`

`exit_owner` MUST be derivable from `exit_layer`: `exit_policy` when `exit_layer == "exit_policy"`; `exit_management` for all `exit_management.*` layers.

Trade records SHALL expose both fields on `trade_management` (or equivalent closed-trade attribution block). `exit_layer` MUST NOT use the coarse value `exit_management` alone when a precise layer is known.

#### Scenario: Runtime RSI close uses precise exit_layer
- **GIVEN** a trade closed by an armed `rsi_signal_exit` runtime rule
- **WHEN** the trade record is serialized
- **THEN** `trade_management.exit_layer` is `exit_management.runtime_exit`
- **AND** `trade_management.exit_owner` is `exit_management`

#### Scenario: Breakeven close uses stop_rule layer
- **GIVEN** a trade closed by an active `break_even_stop` managed rule
- **WHEN** the trade record is serialized
- **THEN** `trade_management.exit_layer` is `exit_management.stop_rule`
- **AND** `trade_management.exit_owner` is `exit_management`

#### Scenario: Exit_policy signal close
- **GIVEN** a trade closed by an `exit_policy` signal exit
- **WHEN** the trade record is serialized
- **THEN** `trade_management.exit_layer` is `exit_policy`
- **AND** `trade_management.exit_owner` is `exit_policy`

### Requirement: Variant metrics include exit layer breakdown with precise keys
Each variant's `metrics.trade_management_summary` (or equivalent) SHALL include `exit_layer_breakdown` keyed by the same precise `exit_layer` values:

- `exit_policy`
- `exit_management.stop_rule`
- `exit_management.take_rule`
- `exit_management.runtime_exit`

There MUST NOT be an `exit_management.other` catch-all bucket. Unattributable closes MAY be omitted or counted under a separate `unknown` key outside this enum.

An optional `exit_owner_breakdown` MAY rollup to `exit_policy` and `exit_management` only.

#### Scenario: Breakdown keys match trade record exit_layer
- **GIVEN** closed trades with known precise `exit_layer` values
- **WHEN** variant metrics are computed
- **THEN** each trade increments exactly one `exit_layer_breakdown` key matching its `exit_layer`

#### Scenario: Reports distinguish exit_policy vs runtime_exit
- **GIVEN** one trade closed by `exit_policy` signal exit and one by `rsi_signal_exit` runtime rule
- **WHEN** variant metrics are built
- **THEN** `exit_layer_breakdown.exit_policy` is `1`
- **AND** `exit_layer_breakdown.exit_management.runtime_exit` is `1`

### Requirement: Variant metrics include runtime exit breakdown by component and rule
Variant metrics SHALL include `runtime_exit_breakdown` with:

- `by_component_id` — map `component_id` → `{ trades, pnl, ... }`
- `by_rule_id` — map `rule_id` → `{ trades, component_id, exit_kind, ... }`

Counts MUST include only closes where `exit_layer == "exit_management.runtime_exit"`.

#### Scenario: Runtime RSI count by component_id
- **GIVEN** two trades closed by the same `rsi_signal_exit` runtime rule
- **WHEN** metrics are computed
- **THEN** `runtime_exit_breakdown.by_component_id.rsi_signal_exit.trades` is `2`

#### Scenario: Zero runtime exits before runner in runner-gated config
- **GIVEN** a managed config where RSI runtime rule requires `phase_at_least: runner`
- **AND** no trade reaches runner before close
- **WHEN** metrics are computed
- **THEN** `runtime_exit_breakdown.by_component_id.rsi_signal_exit.trades` is `0`

### Requirement: Runner capture diagnostics include runtime exit attribution
When trade-management diagnostics are present, variant metrics SHALL include runner-oriented summaries sufficient to verify:

- runner-phase trade count
- count of closes via initial/catastrophic stop while in runner (`exit_layer: exit_policy`)
- count of closes via `rsi_signal_exit` runtime rule after runner (`exit_layer: exit_management.runtime_exit`)
- count of closes via `ema_cross_loss_exit` runtime rule after runner
- runner giveback / capture summaries (existing fields preserved)

#### Scenario: Runner RSI exit count visible
- **GIVEN** a fixture where trades enter runner and close via RSI runtime take
- **WHEN** trade-management summary metrics are built
- **THEN** runner-phase RSI runtime exit count is greater than zero
- **AND** pre-runner RSI runtime exit count is zero

### Requirement: Trade records expose managed_events with runtime exit fields
For managed-mode runs, `trade_records[].trade_management.managed_events[]` SHALL support events:

- `phase_changed`
- `active_take_updated`
- `runtime_exit_triggered`
- `runtime_exit_executed`
- `exit_executed`

Each runtime-related event MUST include when available: `component_id`, `role`, `exit_layer`, `exit_owner`, `rule_id`, `exit_kind`, `phase`, `side`, `price`, `bar_index`, `mfe_pct`, `mae_pct`, `bars_in_trade`, `metadata`.

#### Scenario: Trade record lists runtime_exit_triggered before close
- **GIVEN** a trade that closes via armed RSI runtime exit
- **WHEN** the trade record is serialized
- **THEN** `managed_events` contains `runtime_exit_triggered` with `component_id: "rsi_signal_exit"`
- **AND** `exit_executed` (or trade-level attribution) has `exit_layer: "exit_management.runtime_exit"` and `exit_owner: "exit_management"`

#### Scenario: Diagnostics do not alter strategy behavior
- **WHEN** a baseline backtest is re-run with enriched runtime exit diagnostics enabled
- **THEN** trade count and net PnL match within existing numeric tolerance
