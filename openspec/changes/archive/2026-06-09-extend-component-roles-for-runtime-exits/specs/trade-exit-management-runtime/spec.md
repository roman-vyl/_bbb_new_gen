## ADDED Requirements

### Requirement: Runtime exits reference reusable signal components with explicit role
Each `trade_management.exit_management.runtime_exits[]` rule SHALL include:

- `rule_id` (non-empty, unique across management lists)
- `component_id` (allowlisted for `exit_management.runtime_exit`)
- `role` MUST be `"exit_management.runtime_exit"`
- `activate_when` with `phase_at_least` (REQUIRED)
- `exit_kind` — one of `take_profit`, `protective_exit`, `market_close` (required for signal components; `phase_runtime_exit` defaults to `market_close`)
- `params` — component-specific params matching the primitive's `input_contract`

Allowlisted `component_id` values for reusable signal runtime exits in this change:

- `rsi_signal_exit`
- `ema_cross_loss_exit`
- `phase_runtime_exit` (existing bar-close placeholder)

Validation MUST reject `runtime_exits` rules without `activate_when`. Validation MUST reject `exit_kind: "signal"` on runtime exits. Validation MUST reject components not present in registry `allowed_roles` for `exit_management.runtime_exit`.

#### Scenario: Valid rsi runtime exit after runner
- **GIVEN** a managed config with `runtime_exits` containing `component_id: "rsi_signal_exit"`, `role: "exit_management.runtime_exit"`, `activate_when.phase_at_least: "runner"`, and `exit_kind: "take_profit"`
- **WHEN** validation runs
- **THEN** validation succeeds

#### Scenario: Invalid runtime exit without activate_when
- **GIVEN** a `runtime_exits` rule with `component_id: "rsi_signal_exit"` and no `activate_when`
- **WHEN** validation runs
- **THEN** validation fails with a message that `activate_when` is required

#### Scenario: Invalid ema runtime exit in disallowed role
- **GIVEN** a `runtime_exits` rule with `component_id: "ema_cross_loss_exit"` but `role: "exit_policy.signal_exit"`
- **WHEN** validation runs
- **THEN** validation fails

#### Scenario: Invalid exit_kind signal on runtime exit
- **GIVEN** a `runtime_exits` rule with `component_id: "rsi_signal_exit"` and `exit_kind: "signal"`
- **WHEN** validation runs
- **THEN** validation fails with a message that runtime `exit_kind` must be one of `take_profit`, `protective_exit`, `market_close`

### Requirement: Runtime signal exits evaluate only when activate_when is satisfied
For `rsi_signal_exit` and `ema_cross_loss_exit` in `exit_management.runtime_exit`, the managed provider SHALL evaluate the primitive signal only on bars where `activate_when.phase_at_least` is satisfied for the open trade.

Before activation, the rule MUST NOT emit a runtime exit candidate or `runtime_exit_triggered` event.

After activation, evaluation SHALL follow delayed arm semantics: condition evaluated end-of-bar N; armed candidate available from bar N+1 onward (inherited snapshot), consistent with other management rules.

#### Scenario: Runtime RSI does not trigger before runner
- **GIVEN** a managed config with `rsi_signal_exit` runtime rule `activate_when.phase_at_least: "runner"`
- **AND** a trade in `protected` with RSI above the long threshold
- **WHEN** the provider evaluates runtime exits on that bar
- **THEN** no `runtime_exit_triggered` event is recorded for that rule
- **AND** no runtime exit candidate is armed

#### Scenario: Runtime RSI triggers after runner for long
- **GIVEN** a long trade in `runner` with `rsi_signal_exit` `long_exit_above: 90`
- **AND** prepared RSI is `92` on end-of-bar evaluation
- **WHEN** delayed activation applies on the next bar
- **THEN** a `runtime_exit_triggered` event is recorded with `component_id: "rsi_signal_exit"` and `exit_kind: "take_profit"`

#### Scenario: Runtime RSI triggers after runner for short
- **GIVEN** a short trade in `runner` with `rsi_signal_exit` `short_exit_below: 10`
- **AND** prepared RSI is `8` on end-of-bar evaluation
- **WHEN** delayed activation applies on the next bar
- **THEN** a runtime exit candidate is armed with side-aware short semantics

#### Scenario: Runtime EMA cross triggers after runner for long
- **GIVEN** a long trade in `runner` with `ema_cross_loss_exit` runtime rule
- **AND** fast EMA crosses below slow EMA per primitive semantics
- **WHEN** evaluation runs after activation threshold is met
- **THEN** a `runtime_exit_triggered` event is recorded with `component_id: "ema_cross_loss_exit"`

#### Scenario: Runtime EMA cross triggers after runner for short
- **GIVEN** a short trade in `runner` with `ema_cross_loss_exit` runtime rule
- **AND** fast EMA crosses above slow EMA per primitive semantics
- **WHEN** evaluation runs after activation threshold is met
- **THEN** a runtime exit candidate is armed

### Requirement: Runtime exit feature planning reuses exit primitive hooks
When `runtime_exits` references `rsi_signal_exit` or `ema_cross_loss_exit`, the feature planner SHALL schedule the same prepared features as the `exit_policy.signal_exit` consumer (RSI column, fast/slow EMA columns, `confirm_bars` alignment).

Runtime-only configs without the same component in `exit_policy` MUST still receive required features.

#### Scenario: Runtime-only RSI schedules RSI feature
- **GIVEN** a spec with `rsi_signal_exit` only under `runtime_exits` and not under `exit_policy`
- **WHEN** the feature plan is built
- **THEN** RSI features for configured `params.rsi` are planned

### Requirement: Runtime signal exits fill at bar close
When `rsi_signal_exit` or `ema_cross_loss_exit` fires as `exit_management.runtime_exit`, the runtime exit candidate price MUST be the **close** of the arbitration bar. The runtime MUST NOT use intrabar high/low for fill price and MUST NOT attempt optimistic fills inside the bar.

This matches close-based RSI/EMA primitives and `phase_runtime_exit` semantics.

#### Scenario: Runtime RSI exit price is bar close
- **GIVEN** a long trade where an armed `rsi_signal_exit` runtime rule wins arbitration on bar index `N`
- **WHEN** the close is applied
- **THEN** exit price equals the OHLCV close at bar `N`

#### Scenario: Runtime EMA cross exit price is bar close
- **GIVEN** a short trade where an armed `ema_cross_loss_exit` protective runtime rule wins on bar `N`
- **WHEN** the close is applied
- **THEN** exit price equals the OHLCV close at bar `N`

## MODIFIED Requirements

### Requirement: Component pack v1 covers all active management layers
Managed mode v2 SHALL support the following component contracts:

**stop_management**

- `break_even_stop`
- `lock_profit_stop` (minimal working: side-aware entry ± `lock_atr` × ATR, tighten-only)

**take_management**

- `take_profile_switch` with actions `keep_initial`, `disable_initial_tp`

**runtime_exits**

- `phase_runtime_exit` — phase-gated exit at bar close; `params.exit_price` MUST be `"close"`; `exit_kind` defaults to `market_close`
- `rsi_signal_exit` — reusable RSI threshold primitive; `role: exit_management.runtime_exit`; requires `activate_when` and `exit_kind`
- `ema_cross_loss_exit` — reusable EMA cross primitive; `role: exit_management.runtime_exit`; requires `activate_when` and `exit_kind`

Each component SHALL be testable in isolation and SHALL be able to influence trade outcome when configured with non-empty rules (outcome change via arbitration in managed mode).

Pattern `trigger` sub-objects on `phase_runtime_exit` remain rejected in v2.

#### Scenario: Break-even stop changes outcome versus baseline
- **GIVEN** a managed config with `break_even_stop` after `protected`
- **AND** a baseline config without behavior-changing management
- **WHEN** both run on the same fixture where price returns to entry after `protected`
- **THEN** the managed run closes at breakeven with `exit_layer: exit_management.stop_rule`
- **AND** the baseline run does not close at breakeven on that path

#### Scenario: Reusable RSI runtime exit changes outcome versus phase_runtime_exit-only
- **GIVEN** a managed runner fixture where RSI exceeds threshold after runner but bar-close `phase_runtime_exit` would not fire
- **WHEN** a config with `rsi_signal_exit` runtime rule runs
- **THEN** the trade MAY close via `exit_management` with `exit_component_id: "rsi_signal_exit"`

#### Scenario: Phase runtime exit rejects pattern trigger in v2
- **GIVEN** a managed config with `component_id: "phase_runtime_exit"` and a `trigger` sub-object
- **WHEN** validation runs for v2
- **THEN** validation fails with a message that pattern triggers are not supported in v2

### Requirement: Same-bar exit arbitration uses explicit v1 policy among bar-open-active candidates
When multiple **bar-open-active** exit candidates are hit on one bar, the execution layer SHALL select exactly one winner using `same_bar_policy: "v1"` with this priority order:

1. initial stop loss from `exit_policy`
2. managed active stop from `exit_management` (inherited snapshot only)
3. initial take profit from `exit_policy` (unless suppressed by inherited `disable_initial_tp` profile)
4. managed runtime protective exit from `exit_management` (`exit_kind: protective_exit`, inherited armed state only)
5. managed runtime take exit from `exit_management` (`exit_kind: take_profit`, inherited armed state only)
6. managed runtime market close from `exit_management` (`exit_kind: market_close`, inherited armed state only — includes `phase_runtime_exit`)
7. signal exit from `exit_policy`

Candidates that become eligible only from end-of-bar phase or snapshot updates on the same bar MUST be excluded from this arbitration.

The winning candidate SHALL be recorded on `exit_executed`. Losing bar-open candidates on the same bar MAY be recorded as optional metadata.

#### Scenario: Initial stop loss wins over runtime protective exit
- **GIVEN** a bar where both initial stop loss and an armed `ema_cross_loss_exit` protective runtime exit would hit
- **WHEN** arbitration runs with `same_bar_policy: "v1"` on bar-open-active candidates
- **THEN** the winner is the initial stop loss candidate
- **AND** `exit_layer` is `exit_policy`

#### Scenario: Runtime protective exit wins over runtime take exit
- **GIVEN** a bar where both armed protective and take runtime exits would hit
- **WHEN** arbitration runs with `same_bar_policy: "v1"`
- **THEN** the protective runtime exit wins

#### Scenario: Runtime take exit wins over exit_policy signal exit
- **GIVEN** a bar where both armed `rsi_signal_exit` runtime take exit and `exit_policy` signal exit would hit
- **WHEN** arbitration runs with `same_bar_policy: "v1"`
- **THEN** the runtime take exit wins
- **AND** `exit_layer` is `exit_management.runtime_exit`

#### Scenario: Newly activated runtime exit excluded from same-bar arbitration
- **GIVEN** a bar N where phase first reaches `runner` and an RSI runtime rule would become armed in the end-of-bar snapshot
- **AND** RSI condition is true on bar N
- **WHEN** bar N exit arbitration runs
- **THEN** the RSI runtime exit is not among bar-open candidates
- **AND** the trade does not close via that rule on bar N

### Requirement: Uniform managed event trace
Managed mode SHALL emit a uniform event trace using these event types:

- `phase_changed`
- `active_stop_updated`
- `active_take_updated`
- `runtime_exit_triggered`
- `runtime_exit_executed` (when a runtime exit candidate wins arbitration and closes or is the selected exit path)
- `exit_rule_triggered`
- `exit_executed`

`exit_executed` in managed mode SHALL include precise `exit_layer`, `exit_owner`, `exit_rule_id`, `exit_component_id`, `role`, and `exit_kind` when available.

`exit_layer` MUST use the normalized vocabulary: `exit_policy`, `exit_management.stop_rule`, `exit_management.take_rule`, `exit_management.runtime_exit`. Coarse `exit_management` alone MUST NOT be written when a precise layer is known.

`exit_owner` MUST be `exit_policy` or `exit_management` as defined in report diagnostics.

Runtime exit events SHALL include `component_id`, `role: "exit_management.runtime_exit"`, `exit_layer: "exit_management.runtime_exit"`, `exit_owner: "exit_management"`, `rule_id`, `exit_kind`, `phase`, `side`, `price`, `bar_index`, `mfe_pct`, `mae_pct`, `bars_in_trade`, and optional `metadata` per component `diagnostics_contract`.

Events SHALL be ordered by bar index and creation order within the bar.

#### Scenario: Runtime exit triggered records full attribution
- **GIVEN** a managed trade where `rsi_signal_exit` runtime rule arms
- **WHEN** `runtime_exit_triggered` is recorded
- **THEN** the event includes `component_id: "rsi_signal_exit"`, `role: "exit_management.runtime_exit"`, `rule_id`, `exit_kind`, and current `phase`

#### Scenario: Managed close via runtime exit records layer
- **GIVEN** a managed trade closed by an armed `ema_cross_loss_exit` runtime rule
- **WHEN** the trade closes
- **THEN** `exit_executed` has `exit_layer: "exit_management.runtime_exit"`
- **AND** `exit_executed` has `exit_owner: "exit_management"`
- **AND** `exit_component_id` is `ema_cross_loss_exit`
- **AND** `role` is `exit_management.runtime_exit`
