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

### Requirement: Execution layer owns position lifecycle
The managed exit-management provider SHALL NOT open positions or own entry sequencing.

The existing execution/backtest layer SHALL own position lifecycle: opening positions from precomputed entry signals, holding open position state, collecting `exit_policy` and managed provider candidates, selecting close decisions, and applying closes.

The managed exit provider SHALL be callable only for already-open position context.

#### Scenario: Provider receives open position context only
- **GIVEN** an open trade in managed mode on bar N
- **WHEN** the execution layer requests managed state or candidates
- **THEN** the provider receives already-open position context (trade id, entry, runtime state, inherited snapshot)
- **AND** the provider does not open the position

#### Scenario: Provider does not evaluate entry pipeline
- **GIVEN** a managed-mode backtest with setup, blocker, trigger, and direction configured
- **WHEN** the managed exit provider runs
- **THEN** the provider does not inspect or recompute setup, blocker, trigger, or direction logic
- **AND** the provider does not consume `entries` or `short_entries` as an entry owner

### Requirement: Managed exit provider supplies candidates for open positions
For an open trade, the managed exit provider SHALL supply:

- bar-open-active managed candidates derived from the inherited snapshot;
- end-of-bar next `ActiveManagementSnapshot` and runtime state updates;
- managed events (`phase_changed`, `active_stop_updated`, `active_take_updated`, `runtime_exit_triggered`);
- `TradeRuntimeState` / phase tracking for the open trade.

The provider SHALL NOT apply trade close; the execution layer applies close using combined candidates.

#### Scenario: Provider returns inherited managed stop candidate
- **GIVEN** an open trade with an active managed stop in the inherited snapshot at bar open
- **AND** bar OHLC hits that stop level
- **WHEN** the execution layer requests bar-open managed candidates
- **THEN** the provider returns a managed stop `ExitCandidate` at the hit price

#### Scenario: Provider returns end-of-bar snapshot for next bar
- **GIVEN** an open trade that does not close on bar N
- **WHEN** the execution layer calls the provider for end-of-bar update
- **THEN** the provider returns an updated `ActiveManagementSnapshot` effective from bar N+1
- **AND** emits management events with `effective_from_bar` metadata where applicable

### Requirement: Exit policy remains the initial and fallback exit layer
`trade_management.exit_policy` SHALL remain the declarative source of initial stop loss, initial take profit, and signal exits.

HTF-context-gated exit profile selection SHALL remain owned by `exit_policy` and SHALL NOT be moved into `exit_management` management rules in v2.

The execution layer SHALL consume effective `exit_policy` outputs and candidates produced by the existing `exit_policy` pipeline as arbitration inputs. It SHALL NOT remove or replace the `exit_policy` configuration surface.

The managed exit provider SHALL NOT evaluate HTF context itself. If `exit_policy` locks or gates profiles using HTF context, that ownership and behavior SHALL remain unchanged in `exit_policy`. The managed exit provider MUST NOT duplicate or reinterpret HTF context for profile selection.

#### Scenario: Execution layer consumes exit_policy outputs; provider does not reimplement HTF
- **GIVEN** a strategy spec with `exit_policy` profiles gated by `htf_context.state`
- **WHEN** a managed-mode backtest runs
- **THEN** the execution layer receives `exit_policy` candidates from the existing exit-policy pipeline (effective/locked profile outputs as implemented today)
- **AND** the managed exit provider does not evaluate HTF context for profile selection
- **AND** managed rules do not reimplement HTF profile switching

#### Scenario: Initial SL remains a candidate when managed stop is active
- **GIVEN** a managed trade with an active managed stop
- **WHEN** a bar hits the initial `exit_policy` stop loss
- **THEN** an `exit_policy` exit candidate is present for arbitration on that bar

### Requirement: Execution layer integrates managed provider per open trade
When `exit_management.mode` is `managed`, the execution layer SHALL call the managed exit provider once per bar for each open trade from entry through close.

The execution layer MUST NOT create a second simulated trade path, shadow portfolio, or pseudo-trades.

The managed exit provider MUST NOT open trades or own the full execution loop.

#### Scenario: Execution layer closes via inherited breakeven stop after protected
- **GIVEN** a managed config with a `stop_management` rule that places breakeven after `protected`
- **AND** a trade reaches `protected` on bar N
- **AND** price returns to breakeven on a later bar M where M > N
- **WHEN** the execution layer integrates the managed provider with delayed activation
- **THEN** the execution layer closes the trade on bar M using the breakeven managed candidate that was active from bar N+1 onward
- **AND** the close is attributed with `exit_layer: "exit_management"`
- **AND** the trade does not close on bar N solely because phase became `protected` on that bar

### Requirement: Delayed activation applies to provider snapshots
On each bar N of an open managed trade, the execution layer and provider SHALL follow this order:

1. Start bar N with open position state, inherited `phase` and `ActiveManagementSnapshot` from end of bar N−1, and effective `exit_policy` candidates from the existing pipeline.
2. Request bar-open-active managed candidates from the provider (inherited snapshot only).
3. If multiple bar-open candidates are hit on bar N OHLC, the execution layer selects one winner using `same_bar_policy: "v1"` among `exit_policy` and inherited managed candidates.
4. If a winner is selected, the execution layer closes the trade and stops further processing for that trade on later bars.
5. If no close on bar N, the execution layer calls the provider for end-of-bar update: MFE/MAE/`bars_in_trade`, `phase_rules`, next `ActiveManagementSnapshot`, and management events; new snapshot applies from bar N+1.

Rules that become eligible because of phase or snapshot changes computed **at end of bar N** MUST NOT produce exit candidates on bar N.

#### Scenario: New breakeven stop does not exit on phase transition bar
- **GIVEN** a `stop_management` `break_even_stop` rule with `activate_when.phase_at_least: "protected"`
- **AND** a trade transitions to `protected` on bar N due to `phase_rules`
- **WHEN** bar N is evaluated
- **THEN** breakeven stop is not an exit candidate on bar N
- **AND** breakeven stop may become an exit candidate starting bar N+1 if present in the inherited snapshot

#### Scenario: Armed runtime exit uses previous bar arm state
- **GIVEN** a `phase_runtime_exit` rule that becomes armed when phase reaches `exhaustion` on bar N
- **WHEN** bar N is evaluated for exits
- **THEN** runtime exit is not a bar-open candidate on bar N
- **AND** runtime exit may be a bar-open candidate on bar N+1 if armed in the inherited snapshot

### Requirement: Active management snapshot tracks all managed layers
For each open trade in managed mode, the managed exit provider SHALL maintain an active management snapshot including at minimum:

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

#### Scenario: Stop rule activates after protected with delayed exit eligibility
- **GIVEN** a `stop_management` rule with `activate_when.phase_at_least: "protected"`
- **WHEN** the trade phase becomes `protected` on bar N
- **THEN** the rule is included in the snapshot computed at end of bar N
- **AND** the rule's stop may affect exits starting bar N+1
- **AND** the rule remains inactive before `protected`
- **AND** the rule does not produce bar-open exit candidates on bar N

### Requirement: Component pack v1 covers all active management layers
Managed mode v2 SHALL support the following component contracts:

**stop_management**

- `break_even_stop`
- `lock_profit_stop` (minimal working: side-aware entry ± `lock_atr` × ATR, tighten-only)

**take_management**

- `take_profile_switch` with actions `keep_initial`, `disable_initial_tp`

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

#### Scenario: Take profile switch can disable initial take profit in candidate view
- **GIVEN** a managed config with `take_profile_switch` action `disable_initial_tp`
- **AND** a trade that would have hit the initial `exit_policy` take-profit candidate
- **WHEN** the take profile is active from the inherited snapshot (delayed activation)
- **THEN** the initial take-profit candidate is suppressed in the managed/execution candidate view
- **AND** `exit_policy` config and compiled masks remain unchanged
- **AND** an `active_take_updated` event records the profile change with `effective_from_bar`

#### Scenario: Deprecated disable_fixed_tp alias normalizes to disable_initial_tp
- **GIVEN** a config that authors `take_profile_switch` with `action: "disable_fixed_tp"`
- **WHEN** validation or parsing runs
- **THEN** the action is normalized to `disable_initial_tp`
- **AND** behavior matches `disable_initial_tp` semantics

#### Scenario: Phase runtime exit emits candidate at close when phase active
- **GIVEN** a managed config with `phase_runtime_exit`, `activate_when.phase_at_least: "exhaustion"`, and `params.exit_price: "close"`
- **AND** a trade whose current phase is `exhaustion`
- **WHEN** the provider evaluates end-of-bar state for that bar
- **THEN** a `runtime_exit_triggered` event is recorded
- **AND** a runtime exit candidate is available at that bar's close price from the next bar onward if armed in inherited snapshot

#### Scenario: Phase runtime exit rejects pattern trigger in v2
- **GIVEN** a managed config with `component_id: "phase_runtime_exit"` and a `trigger` sub-object
- **WHEN** validation runs for v2
- **THEN** validation fails with a message that pattern triggers are not supported in v2

#### Scenario: Phase runtime exit can close via arbitration when armed before bar
- **GIVEN** a managed config with `phase_runtime_exit` armed in the inherited snapshot at bar open
- **AND** no higher-priority bar-open exit candidate wins under `same_bar_policy: "v1"`
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

### Requirement: Take profile action disable_initial_tp
`take_profile_switch` SHALL support `disable_initial_tp`.

When active in the inherited snapshot, it SHALL suppress the initial `exit_policy` take-profit candidate in the managed/execution candidate view only.

It SHALL NOT mutate `exit_policy` config or compiled outputs globally.

It SHALL NOT disable managed stops or runtime exits.

`disable_fixed_tp` MAY be accepted as a deprecated alias normalized to `disable_initial_tp` during parsing.

#### Scenario: disable_initial_tp does not mutate exit_policy
- **GIVEN** a managed config with `take_profile_switch` action `disable_initial_tp`
- **WHEN** the provider activates the profile on bar N
- **THEN** `exit_policy` configuration and compiled masks are unchanged
- **AND** suppression applies only in candidate collection for bars where the profile is inherited active

### Requirement: Same-bar exit arbitration uses explicit v1 policy among bar-open-active candidates
When multiple **bar-open-active** exit candidates are hit on one bar, the execution layer SHALL select exactly one winner using `same_bar_policy: "v1"` with this priority order:

1. initial stop loss from `exit_policy`
2. managed active stop from `exit_management` (inherited snapshot only)
3. initial take profit from `exit_policy` (unless suppressed by inherited `disable_initial_tp` profile)
4. runtime exit from `exit_management` (inherited armed state only)
5. signal exit from `exit_policy`

Candidates that become eligible only from end-of-bar phase or snapshot updates on the same bar MUST be excluded from this arbitration.

The winning candidate SHALL be recorded on `exit_executed`. Losing bar-open candidates on the same bar MAY be recorded as optional metadata.

#### Scenario: Initial stop loss wins over already-active managed breakeven
- **GIVEN** a bar where both initial stop loss and an **already-active** managed stop are hit
- **WHEN** arbitration runs with `same_bar_policy: "v1"` on bar-open-active candidates
- **THEN** the winner is the initial stop loss candidate
- **AND** `exit_layer` is `exit_policy`

#### Scenario: Already-active managed stop wins over take profit
- **GIVEN** a bar where both an **already-active** managed stop and take profit candidates are hit
- **WHEN** arbitration runs with `same_bar_policy: "v1"` on bar-open-active candidates
- **THEN** the winner is the managed active stop candidate
- **AND** `exit_layer` is `exit_management`

#### Scenario: Newly activated managed stop excluded from same-bar arbitration
- **GIVEN** a bar N where phase first reaches `protected` and a `break_even_stop` rule would become active in the end-of-bar snapshot
- **AND** price on bar N would hit breakeven if that stop were active
- **WHEN** bar N exit arbitration runs
- **THEN** breakeven is not among bar-open candidates
- **AND** the trade does not close via `break_even_stop` on bar N

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
The strategy spec SHALL support an optional `trade_management.exit_management` object beside `trade_management.exit_policy`. `exit_policy` SHALL remain the source of declarative exit components. `exit_management` SHALL own runtime state, phase evaluation, active management layers, managed provider outputs, and runtime trace when `mode` is `managed`. Close decisions SHALL be applied by the execution layer when `mode` is `managed`.

`exit_management` SHALL support:

- `mode`: `"diagnostic_only"`, `"managed"`, or omitted defaulting to behavior-compatible disabled/legacy handling.
- `phase_rules`: ordered list of phase transition rules.
- `stop_management`: behavior-changing stop rules; MUST be empty for `diagnostic_only`; MAY be non-empty for `managed`.
- `take_management`: take-profile switch rules; MUST be empty for `diagnostic_only`; MAY be non-empty for `managed`.
- `runtime_exits`: phase-gated runtime exit rules; MUST be empty for `diagnostic_only`; MAY be non-empty for `managed`.

The legacy `exit_management.always_on/profiles/rules` `break_even_stop` shape SHALL NOT be considered part of the managed v2 provider contract. It MAY remain temporarily as deprecated backward-compatible parsing support for existing artifacts, but new managed provider behavior MUST NOT depend on it.

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
- **WHEN** managed exit provider v2 is implemented
- **THEN** the managed exit provider does not read those legacy rules as managed `stop_management` inputs
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
