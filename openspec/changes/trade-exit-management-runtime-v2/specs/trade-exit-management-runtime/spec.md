## ADDED Requirements

### Requirement: Managed mode coexists with diagnostic-only
The strategy spec SHALL support `trade_management.exit_management.mode: "managed"` as a behavior-changing runtime mode alongside unchanged `diagnostic_only`.

`diagnostic_only` SHALL remain a supported permanent control mode with the same parity guarantees as archived v1.

`managed` configs SHALL support:

- `phase_rules` (unchanged semantics from v1).
- `stop_management`: ordered behavior-changing stop rules.
- `take_management`: ordered take-profile switch rules.
- `runtime_exits`: ordered phase-gated runtime exit rules.

#### Scenario: Validation accepts managed mode beside exit policy
- **GIVEN** a strategy spec contains `trade_management.exit_policy`
- **WHEN** the spec also contains `trade_management.exit_management.mode: "managed"`
- **THEN** validation accepts `exit_management` as a sibling of `exit_policy`
- **AND** validation accepts `stop_management`, `take_management`, and `runtime_exits` lists when present

#### Scenario: Diagnostic-only mode remains valid and unchanged
- **GIVEN** a strategy spec contains `trade_management.exit_management.mode: "diagnostic_only"`
- **WHEN** validation runs
- **THEN** validation still rejects non-empty `stop_management`, `take_management`, or `runtime_exits`
- **AND** diagnostic-only parity behavior matches archived v1

### Requirement: Managed mode with empty management arrays preserves baseline parity
When `exit_management.mode` is `managed` and `stop_management`, `take_management`, and `runtime_exits` are all empty, the backtest SHALL preserve the same trading results as a config without behavior-changing exit management: trade count, net PnL, profit factor, and exit reasons.

Phase diagnostics and managed-runtime infrastructure MAY run, but MUST NOT change exit bar, exit price, or exit attribution relative to baseline.

#### Scenario: Managed empty arrays match no exit management
- **GIVEN** two otherwise identical strategy specs on the same candle data
- **AND** one spec omits `exit_management`
- **AND** the other sets `mode: "managed"` with empty `stop_management`, `take_management`, and `runtime_exits`
- **WHEN** both backtests run
- **THEN** trade count matches
- **AND** net PnL matches within existing numeric tolerance
- **AND** profit factor matches within existing numeric tolerance
- **AND** exit reasons match for the same trades

### Requirement: Exit policy remains the initial and fallback exit layer
`trade_management.exit_policy` SHALL remain the declarative source of initial stop loss, safety take profit, and signal exits.

HTF-context-gated exit profile selection SHALL remain owned by `exit_policy` and SHALL NOT be moved into `exit_management` management rules in v2.

The managed runtime SHALL consume effective `exit_policy` outputs and candidates produced by the existing `exit_policy` pipeline as arbitration inputs. It SHALL NOT remove or replace the `exit_policy` configuration surface.

The managed runtime SHALL NOT evaluate HTF context itself. If `exit_policy` locks or gates profiles using HTF context, that ownership and behavior SHALL remain unchanged in `exit_policy`. The managed runtime MUST NOT duplicate or reinterpret HTF context for profile selection.

#### Scenario: Managed runtime consumes exit_policy outputs without HTF reimplementation
- **GIVEN** a strategy spec with `exit_policy` profiles gated by `htf_context.state`
- **WHEN** a managed-mode backtest runs
- **THEN** arbitration receives `exit_policy` candidates from the existing exit-policy pipeline (effective/locked profile outputs as implemented today)
- **AND** the managed runtime does not evaluate HTF context for profile selection
- **AND** managed rules do not reimplement HTF profile switching

#### Scenario: Initial SL remains a candidate when managed stop is active
- **GIVEN** a managed trade with an active managed stop
- **WHEN** a bar hits the initial `exit_policy` stop loss
- **THEN** an `exit_policy` exit candidate is present for arbitration on that bar

### Requirement: Managed runtime evaluates trades bar-by-bar during open life
When `exit_management.mode` is `managed`, the runtime SHALL evaluate each open trade on every bar from entry through close using a bar-by-bar managed loop inside the research execution path.

The managed loop SHALL update trade state, evaluate phase rules, recompute active management snapshot, collect exit candidates, arbitrate, and record events.

The runtime MUST NOT create a second simulated trade path, shadow portfolio, or pseudo-trades.

#### Scenario: Managed mode can close before vectorbt baseline exit
- **GIVEN** a managed config with a `stop_management` rule that places breakeven after `protected`
- **AND** a trade reaches `protected` then returns to breakeven before the original stop loss
- **WHEN** the managed bar-by-bar loop runs
- **THEN** the trade closes via `exit_management` on the breakeven stop hit bar
- **AND** the close is attributed with `exit_layer: "exit_management"`

### Requirement: Active management snapshot tracks all managed layers
For each open trade in managed mode, the runtime SHALL maintain an active management snapshot including at minimum:

- active stop price and originating `rule_id` / `component_id` when a stop rule is active;
- active take profile state and originating `rule_id` / `component_id` when a take rule is active;
- armed runtime exit rule identifiers when runtime exit rules are active.

#### Scenario: Stop update emits active stop event
- **GIVEN** a managed trade that activates `break_even_stop` after reaching `protected`
- **WHEN** the managed stop price is first computed
- **THEN** the runtime records an `active_stop_updated` event
- **AND** the event includes `rule_id` and `component_id`

#### Scenario: Take profile switch emits active take event
- **GIVEN** a managed trade that activates `take_profile_switch`
- **WHEN** the take profile changes from the initial profile
- **THEN** the runtime records an `active_take_updated` event
- **AND** the event includes the new take profile action

### Requirement: Management rules activate by phase threshold
Managed rules in `stop_management`, `take_management`, and `runtime_exits` SHALL support activation via `activate_when.phase_at_least` using the ordered phase enum (`initial_risk`, `proven`, `protected`, `runner`, `exhaustion`).

A rule SHALL become active when the trade's current phase is at or beyond the configured threshold.

Phase rules SHALL only change phase state and MUST NOT directly close trades or move stops.

#### Scenario: Stop rule activates after protected
- **GIVEN** a `stop_management` rule with `activate_when.phase_at_least: "protected"`
- **WHEN** the trade phase becomes `protected`
- **THEN** the rule becomes active on that bar or later
- **AND** the rule remains inactive before `protected`

### Requirement: Component pack v1 covers all active management layers
Managed mode v2 SHALL support the following component contracts:

**stop_management**

- `break_even_stop`
- `lock_profit_stop` (minimal working: side-aware entry ± `lock_atr` × ATR, tighten-only)

**take_management**

- `take_profile_switch` with actions `keep_initial`, `disable_fixed_tp`, `extend_safety_tp_atr`

**runtime_exits**

- `phase_runtime_exit` — phase-gated exit at bar close; `params.exit_price` MUST be `"close"` in v2; MUST NOT use a `trigger` sub-object or pattern component ids in v2

Each component SHALL be testable in isolation and SHALL be able to influence trade outcome when configured with non-empty rules (outcome change via arbitration in managed mode).

#### Scenario: Break-even stop changes outcome versus baseline
- **GIVEN** a managed config with `break_even_stop` after `protected`
- **AND** a baseline config without behavior-changing management
- **WHEN** both run on the same fixture where price returns to entry after `protected`
- **THEN** the managed run closes at breakeven via `exit_management`
- **AND** the baseline run does not close at breakeven on that path

#### Scenario: Lock profit stop computes side-aware protective price
- **GIVEN** a long trade entered at price `100`
- **AND** a `lock_profit_stop` rule with `lock_atr: 0.5` and configured ATR `2.0` on the activation bar
- **WHEN** the rule becomes active
- **THEN** the managed active stop candidate is `101.0` (`100 + 0.5 × 2.0`)

#### Scenario: Lock profit stop is tighten-only for long trades
- **GIVEN** a long trade with an active `lock_profit_stop` at price `101.0`
- **WHEN** a later bar would recompute a lower protective stop at `100.5`
- **THEN** the active stop remains `101.0`
- **AND** an `active_stop_updated` event is not emitted for a loosening move

#### Scenario: Lock profit stop merges with break-even by tightest protective stop
- **GIVEN** a long trade with both `break_even_stop` at `100.0` and `lock_profit_stop` at `101.0` active
- **WHEN** stop merge runs
- **THEN** the merged managed active stop is `101.0`

#### Scenario: Take profile switch can disable fixed take profit
- **GIVEN** a managed config with `take_profile_switch` action `disable_fixed_tp`
- **AND** a trade that would have hit fixed take profit under initial policy
- **WHEN** the take rule is active
- **THEN** the fixed take profit candidate is not the winning exit while disabled
- **AND** an `active_take_updated` event records the profile change

#### Scenario: Phase runtime exit emits candidate at close when phase active
- **GIVEN** a managed config with `phase_runtime_exit`, `activate_when.phase_at_least: "exhaustion"`, and `params.exit_price: "close"`
- **AND** a trade whose current phase is `exhaustion`
- **WHEN** the managed loop evaluates that bar
- **THEN** a `runtime_exit_triggered` event is recorded
- **AND** a runtime exit candidate is present at that bar's close price

#### Scenario: Phase runtime exit rejects pattern trigger in v2
- **GIVEN** a managed config with `component_id: "phase_runtime_exit"` and a `trigger` sub-object
- **WHEN** validation runs for v2
- **THEN** validation fails with a message that pattern triggers are not supported in v2

#### Scenario: Phase runtime exit can close via arbitration
- **GIVEN** a managed config with `phase_runtime_exit` active on a bar
- **AND** no higher-priority exit candidate wins under `same_bar_policy: "v1"`
- **WHEN** arbitration runs on that bar
- **THEN** the trade MAY close via `exit_management`
- **AND** `exit_executed` includes `exit_component_id: "phase_runtime_exit"`

### Requirement: Uniform managed event trace
Managed mode SHALL emit a uniform event trace using these event types:

- `phase_changed`
- `active_stop_updated`
- `active_take_updated`
- `runtime_exit_triggered`
- `exit_rule_triggered`
- `exit_executed`

`exit_executed` in managed mode SHALL include `exit_layer`, `exit_rule_id`, and `exit_component_id` when available.

Events SHALL be ordered by bar index and creation order within the bar.

#### Scenario: Managed close emits full attribution chain
- **GIVEN** a managed trade closed by an active stop rule
- **WHEN** the trade closes
- **THEN** an `exit_rule_triggered` event precedes or accompanies `exit_executed`
- **AND** `exit_executed` has `exit_layer: "exit_management"`
- **AND** `exit_executed` includes the winning `rule_id` and `component_id`

### Requirement: Same-bar exit arbitration uses explicit v1 policy
When multiple exit candidates are present on one bar, the runtime SHALL select exactly one winner using `same_bar_policy: "v1"` with this priority order:

1. initial stop loss from `exit_policy`
2. managed active stop from `exit_management`
3. initial take profit, managed take, or safety take
4. runtime exit from `exit_management`
5. signal exit from `exit_policy`

The winning candidate SHALL be recorded on `exit_executed`. Losing candidates on the same bar MAY be recorded as optional metadata.

#### Scenario: Initial stop loss wins over managed breakeven on same bar
- **GIVEN** a bar where both initial stop loss and managed active stop are hit
- **WHEN** arbitration runs with `same_bar_policy: "v1"`
- **THEN** the winner is the initial stop loss candidate
- **AND** `exit_layer` is `exit_policy`

#### Scenario: Managed stop wins over take profit on same bar
- **GIVEN** a bar where both managed active stop and take profit candidates are hit
- **WHEN** arbitration runs with `same_bar_policy: "v1"`
- **THEN** the winner is the managed active stop candidate
- **AND** `exit_layer` is `exit_management`

### Requirement: Legacy break-even shape is not managed v2 authoring target
The legacy `exit_management.always_on/profiles/rules` `break_even_stop` shape SHALL remain deprecated backward-compatible parsing only.

New managed `break_even_stop` rules SHALL use the v2 `stop_management` contract with `activate_when` and uniform events.

Product authoring and catalog surfaces MUST NOT revive legacy break-even authoring in v2.

#### Scenario: Managed break-even uses new contract
- **GIVEN** a new managed config authors breakeven protection
- **WHEN** validation runs
- **THEN** the rule is expressed under `stop_management` with `component_id: "break_even_stop"`
- **AND** the legacy always_on/profile rule shape is not required

## MODIFIED Requirements

### Requirement: Exit management runtime is configured inside trade management
The strategy spec SHALL support an optional `trade_management.exit_management` object beside `trade_management.exit_policy`. `exit_policy` SHALL remain the source of declarative exit components. `exit_management` SHALL own runtime state, phase evaluation, active management layers, runtime trace, and behavior-changing managed controls when `mode` is `managed`.

`exit_management` SHALL support:

- `mode`: `"diagnostic_only"`, `"managed"`, or omitted defaulting to behavior-compatible disabled/legacy handling.
- `phase_rules`: ordered list of phase transition rules.
- `stop_management`: behavior-changing stop rules; MUST be empty for `diagnostic_only`; MAY be non-empty for `managed`.
- `take_management`: take-profile switch rules; MUST be empty for `diagnostic_only`; MAY be non-empty for `managed`.
- `runtime_exits`: phase-gated runtime exit rules; MUST be empty for `diagnostic_only`; MAY be non-empty for `managed`.

The legacy `exit_management.always_on/profiles/rules` `break_even_stop` shape SHALL NOT be considered part of the managed v2 runtime contract. It MAY remain temporarily as deprecated backward-compatible parsing/runtime support for existing artifacts, but new managed runtime behavior MUST NOT depend on it.

#### Scenario: Config places runtime controller beside exit policy
- **GIVEN** a strategy spec contains `trade_management.exit_policy`
- **WHEN** the spec also contains `trade_management.exit_management.mode: "diagnostic_only"` or `"managed"`
- **THEN** validation accepts `exit_management` as a sibling of `exit_policy`
- **AND** validation does not move runtime rules into `exit_policy`

#### Scenario: Old config without exit management preserves behavior
- **GIVEN** a strategy spec does not contain `trade_management.exit_management`
- **WHEN** a backtest runs
- **THEN** no trade-management phase diagnostics are emitted
- **AND** the existing exit-policy behavior is preserved

#### Scenario: Diagnostic-only rejects behavior-changing rule lists
- **GIVEN** a strategy spec contains `trade_management.exit_management.mode: "diagnostic_only"`
- **AND** `stop_management`, `take_management`, or `runtime_exits` contains one or more rules
- **WHEN** validation runs
- **THEN** validation fails with a message that behavior-changing exit management is not allowed in diagnostic-only mode

#### Scenario: Managed mode accepts management rule lists
- **GIVEN** a strategy spec contains `trade_management.exit_management.mode: "managed"`
- **AND** `stop_management` contains a valid `break_even_stop` rule
- **WHEN** validation runs
- **THEN** validation succeeds

#### Scenario: Legacy BE shape is not managed v2 input
- **GIVEN** an existing strategy spec uses `exit_management.always_on/profiles/rules` with `break_even_stop`
- **WHEN** managed runtime v2 is implemented
- **THEN** the managed runtime does not read those legacy rules as managed `stop_management` inputs
- **AND** any continued support for that shape is treated as deprecated compatibility only

### Requirement: Runtime event trace records phase and exit events
The runtime SHALL support `TradeManagementEvent` records with trade id, time, bar index, side, event type, phase transition fields, rule/component identifiers, price fields, MFE/MAE percent, bars in trade, exit layer, and metadata.

In `diagnostic_only` mode, the runtime SHALL emit:

- `phase_changed` when a phase rule changes the trade phase.
- `exit_executed` when the real trade closes.

In `managed` mode, the runtime SHALL additionally emit:

- `active_stop_updated` when managed stop changes.
- `active_take_updated` when managed take profile changes.
- `runtime_exit_triggered` when a runtime exit rule fires.
- `exit_rule_triggered` when the winning exit candidate is selected on a close bar.

#### Scenario: Phase transition emits event
- **GIVEN** a trade in `initial_risk`
- **WHEN** rule `to_proven_at_1atr` moves it to `proven`
- **THEN** the runtime records a `phase_changed` event
- **AND** the event has `from_phase: "initial_risk"`
- **AND** the event has `to_phase: "proven"`
- **AND** the event has `rule_id: "to_proven_at_1atr"`

#### Scenario: Closed trade emits final exit event
- **GIVEN** a trade with runtime state
- **WHEN** the trade closes
- **THEN** the runtime records an `exit_executed` event
- **AND** the event includes the current phase and exit attribution when available

#### Scenario: Managed mode emits stop update before close
- **GIVEN** a managed trade that updates an active stop before closing
- **WHEN** the stop price changes
- **THEN** an `active_stop_updated` event is recorded before `exit_executed`

### Requirement: Exit priority is explicit before behavior-changing runtime exits
The runtime contract SHALL define explicit same-bar priority for behavior-changing managed exits.

`same_bar_policy: "v1"` SHALL be used by managed mode arbitration as defined in the managed arbitration requirement.

`diagnostic_only` mode SHALL NOT alter exits using this priority; it only records diagnostics.

#### Scenario: Diagnostic-only does not apply priority model
- **GIVEN** a diagnostic-only config with phase rules
- **WHEN** a bar would satisfy both an existing signal exit and a hypothetical managed exit
- **THEN** the actual exit remains determined by the existing research execution path
- **AND** diagnostic-only mode does not use reserved priority ordering to change the trade

#### Scenario: Managed mode applies v1 priority model
- **GIVEN** a managed config with multiple exit candidates on one bar
- **WHEN** arbitration runs
- **THEN** the winner is selected using `same_bar_policy: "v1"`
- **AND** the result is reflected in `exit_executed`
