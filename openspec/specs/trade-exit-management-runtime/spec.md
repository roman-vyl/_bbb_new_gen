# trade-exit-management-runtime Specification

## Purpose
TBD - created by archiving change trade-exit-management-runtime-v1. Update Purpose after archive.
## Requirements
### Requirement: Exit management runtime is configured inside trade management
The strategy spec SHALL support an optional `trade_management.exit_management` object beside `trade_management.exit_policy`. `exit_policy` SHALL remain the source of declarative exit components. `exit_management` SHALL own runtime state, phase evaluation, active management layers, managed provider outputs, and runtime trace when `mode` is `managed`. Close decisions SHALL be applied by the execution layer when `mode` is `managed`.

`exit_management` SHALL support:

- `mode`: `"diagnostic_only"`, `"managed"`, or omitted (no behavior-changing exit management).
- `phase_rules`: ordered list of phase transition rules.
- `stop_management`: behavior-changing stop rules; MUST be empty for `diagnostic_only`; MAY be non-empty for `managed`.
- `take_management`: take-profile switch rules; MUST be empty for `diagnostic_only`; MAY be non-empty for `managed`.
- `runtime_exits`: phase-gated runtime exit rules; MUST be empty for `diagnostic_only`; MAY be non-empty for `managed`.

The legacy `exit_management.always_on` / `profiles` wire shape SHALL NOT be accepted. Validation SHALL reject presence of those keys with an explicit unsupported-legacy error (including empty wrappers).

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

#### Scenario: Legacy BE shape fails validation
- **GIVEN** a strategy spec uses `exit_management.always_on` or `exit_management.profiles` (any content, including empty)
- **WHEN** validation runs
- **THEN** validation fails with the legacy unsupported error message
- **AND** no managed runtime path executes

### Requirement: Runtime state tracks one real open trade
The runtime SHALL maintain one `TradeRuntimeState` for each real open trade. The state MUST include trade id, side, entry index/time/price, bars in trade, current phase, max phase reached, side-aware best and worst prices, MFE/MAE price and percent, active-stop diagnostics, initial stop/take-profit diagnostics when available, and locked exit profile when available.

`bars_in_trade` SHALL count inclusively from the entry bar, so the entry bar has `bars_in_trade == 1`.

The runtime MUST NOT create pseudo-trades, shadow trades, or a second simulated trade path.

#### Scenario: Long trade updates favorable and adverse extremes
- **GIVEN** a long trade entered at price `100`
- **WHEN** bars after entry have highs `101`, `104` and lows `99`, `98`
- **THEN** `best_price` is `104`
- **AND** `worst_price` is `98`
- **AND** MFE is computed from `104` relative to entry
- **AND** MAE is computed from `98` relative to entry

#### Scenario: Short trade updates favorable and adverse extremes
- **GIVEN** a short trade entered at price `100`
- **WHEN** bars after entry have highs `102`, `103` and lows `97`, `95`
- **THEN** `best_price` is `95`
- **AND** `worst_price` is `103`
- **AND** MFE is computed from `95` relative to entry
- **AND** MAE is computed from `103` relative to entry

#### Scenario: Entry bar counts as first bar in trade
- **GIVEN** a trade opens at bar index `10`
- **WHEN** runtime state is initialized for that trade on bar index `10`
- **THEN** `bars_in_trade` is `1`

### Requirement: Trade phases are driven by ordered phase rules
The runtime SHALL support phases `initial_risk`, `proven`, `protected`, `runner`, and `exhaustion`. New trades SHALL start in `initial_risk`. Phase transitions SHALL be evaluated from configured `phase_rules` in order and SHALL be monotonic: the runtime MUST NOT move a trade back to an earlier phase.

Each `phase_rules[]` entry SHALL contain `rule_id`, `to_phase`, and `condition` with the component-style shape:

```json
{
  "component_id": "<allowlisted_condition_component_id>",
  "params": { }
}
```

The runtime SHALL evaluate conditions through an internal allowlisted phase-rule condition registry. Unknown `component_id` values MUST be rejected at validation time.

Allowlisted condition components in v1:

- `mfe_atr`
- `mfe_pct`
- `bars_in_trade`
- `adx_di_threshold`

Legacy `condition.type` and flat condition fields (`type`, `threshold`, `atr` at the condition root) SHALL NOT be accepted. Validation MUST fail with an explicit unsupported-legacy error when `condition.type` is present.

`mfe_atr` params SHALL be `threshold` (> 0) and `atr: { timeframe, period }`. Evaluation SHALL use side-aware MFE against the configured ATR series aligned to the backtest index. If ATR is missing, non-finite, or not positive on a bar, the condition SHALL NOT trigger on that bar.

`mfe_pct` params SHALL be `threshold` (> 0). Evaluation SHALL compare side-aware `mfe_pct` from trade runtime state.

`bars_in_trade` params SHALL be `threshold` as an integer `>= 1`. Non-integer values (e.g. `1.5`) MUST be rejected at validation time. Evaluation SHALL compare inclusive `bars_in_trade` from trade runtime state (`state.bars_in_trade >= params.threshold`).

`adx_di_threshold` params SHALL be `timeframe`, `period` (> 0), `adx_threshold` (> 0), and optional `require_di_alignment` (boolean, default `true`). Evaluation SHALL use prepared ADX, +DI, and -DI aligned to the backtest index. The condition SHALL be true when `ADX >= adx_threshold` and either `require_di_alignment` is false or DI is aligned with trade side (`long`: +DI > -DI; `short`: -DI > +DI). If any required indicator value is missing or non-finite, the condition SHALL NOT trigger on that bar.

Phase rules SHALL only change phase state and MUST NOT directly close trades or move stops. Delayed activation semantics remain: evaluation on end-of-bar N, snapshot effects from bar N+1.

#### Scenario: MFE ATR component moves trade to proven
- **GIVEN** a long trade in `initial_risk`
- **AND** a phase rule has `to_phase: "proven"` and `condition.component_id: "mfe_atr"` with `params.threshold: 1.0` and `params.atr` for base period 14
- **WHEN** the trade's side-aware MFE reaches at least one configured ATR on end-of-bar evaluation
- **THEN** the runtime changes the trade phase to `proven`
- **AND** `max_phase_reached` becomes `proven`

#### Scenario: Bars-in-trade component moves trade by age
- **GIVEN** a trade in `initial_risk`
- **AND** a phase rule has `to_phase: "proven"` and `condition.component_id: "bars_in_trade"` with `params.threshold: 12` (integer)
- **WHEN** the trade reaches 12 bars in trade
- **THEN** the runtime changes the trade phase to `proven`

#### Scenario: bars_in_trade rejects non-integer threshold
- **GIVEN** a phase rule with `condition.component_id: "bars_in_trade"` and `params.threshold: 1.5`
- **WHEN** validation runs
- **THEN** validation fails with a clear error that `params.threshold` must be an integer `>= 1`

#### Scenario: Phase does not move backward
- **GIVEN** a trade already reached `runner`
- **WHEN** a later bar no longer satisfies a previous `protected` threshold
- **THEN** the trade remains in `runner`
- **AND** `max_phase_reached` remains `runner`

#### Scenario: Legacy condition.type is rejected
- **GIVEN** a strategy spec contains `phase_rules[].condition.type: "mfe_atr"`
- **WHEN** validation runs
- **THEN** validation fails with an explicit unsupported-legacy error referencing `condition.type`
- **AND** no backtest executes with the legacy shape

#### Scenario: Unknown condition component_id is rejected
- **GIVEN** a phase rule with `condition.component_id: "unknown_phase_condition"`
- **WHEN** validation runs
- **THEN** validation fails with a clear unknown component error

#### Scenario: ADX/DI component moves long trade to protected
- **GIVEN** a long trade below `protected`
- **AND** a phase rule has `to_phase: "protected"` and `condition.component_id: "adx_di_threshold"` with `params.timeframe: "base"`, `params.period: 14`, `params.adx_threshold: 40`, `params.require_di_alignment: true`
- **WHEN** on end-of-bar evaluation ADX is `42`, +DI is `31`, and -DI is `18`
- **THEN** the runtime changes the trade phase to `protected`
- **AND** emits `phase_changed` with `metadata.condition_component_id: "adx_di_threshold"`

#### Scenario: ADX/DI component does not trigger when DI opposes long side
- **GIVEN** a long trade below `protected` and an `adx_di_threshold` rule with `require_di_alignment: true`
- **WHEN** on end-of-bar evaluation ADX is `45` but +DI is `15` and -DI is `28`
- **THEN** the trade phase does not change on that bar

#### Scenario: ADX/DI protected phase does not activate BE on same bar
- **GIVEN** a managed config with `break_even_stop` at `phase_at_least: "protected"`
- **AND** a trade transitions to `protected` on bar N due to `adx_di_threshold`
- **WHEN** bar N completes
- **THEN** breakeven managed stop is not active for close arbitration on bar N
- **AND** breakeven may become active from bar N+1

### Requirement: Phase rule conditions use an internal allowlisted registry
The research runtime SHALL maintain an internal allowlisted registry mapping `component_id` to phase-rule condition definitions. Each definition SHALL support:

- param validation at spec load time;
- feature planning contribution;
- end-of-bar evaluation for open trades;
- optional evaluation diagnostics for event metadata.

The registry MUST NOT load arbitrary external plugins. Only allowlisted `component_id` values defined for v1 are valid.

#### Scenario: Registry dispatches mfe_atr evaluation
- **GIVEN** a validated phase rule with `condition.component_id: "mfe_atr"`
- **WHEN** `evaluate_phase_rules` runs on an open trade
- **THEN** evaluation is performed by the `mfe_atr` registry entry
- **AND** not by ad-hoc `condition.type` branching

#### Scenario: Registry dispatches adx_di_threshold evaluation
- **GIVEN** a validated phase rule with `condition.component_id: "adx_di_threshold"`
- **WHEN** `evaluate_phase_rules` runs on an open trade
- **THEN** evaluation is performed by the `adx_di_threshold` registry entry

### Requirement: Feature plan dispatches phase rule condition feature requests
When building a feature plan, the planner SHALL iterate `exit_management.phase_rules`, resolve each `condition.component_id`, and invoke that component's feature-planning hook.

`mfe_atr` SHALL request ATR features for configured `params.atr`.

`adx_di_threshold` SHALL request ADX, +DI, and -DI for configured `(params.timeframe, params.period)` without requiring entry blocker configuration.

Duplicate feature requests for the same key SHALL be deduplicated in the plan.

#### Scenario: adx_di_threshold alone schedules ADX/DMI
- **GIVEN** a spec with `adx_di_threshold` on `timeframe: "1h"`, `period: 14` and no ADX/DMI blocker
- **WHEN** the feature plan is built
- **THEN** ADX, +DI, and -DI for `1h`/14 are planned
- **AND** runtime evaluation can read aligned columns

#### Scenario: mfe_atr and adx_di_threshold share no duplicate ADX planning
- **GIVEN** phase rules using only `mfe_atr` and `adx_di_threshold`
- **WHEN** the feature plan is built
- **THEN** only `adx_di_threshold` contributes ADX/DMI features
- **AND** `mfe_atr` contributes ATR features only

### Requirement: Phase changed events record condition component identity
When a phase rule fires, `phase_changed` events SHALL include `metadata.condition_component_id` set to the rule's `condition.component_id`.

For `adx_di_threshold`, metadata SHOULD also include evaluation diagnostics (`adx`, `di_plus`, `di_minus`, `di_aligned`, `timeframe`, `period`, `adx_threshold`) when values are available, without breaking existing report consumers.

#### Scenario: Phase changed metadata uses component_id
- **GIVEN** a `mfe_pct` phase rule fires
- **WHEN** `phase_changed` is recorded
- **THEN** `metadata.condition_component_id` is `mfe_pct`

#### Scenario: ADX phase changed includes diagnostics
- **GIVEN** an `adx_di_threshold` rule fires with finite indicator values
- **WHEN** `phase_changed` is recorded
- **THEN** `metadata.condition_component_id` is `adx_di_threshold`
- **AND** `metadata` includes the ADX and DI values used for evaluation

### Requirement: Diagnostic-only mode preserves trading results
When `exit_management.mode` is `diagnostic_only`, the runtime SHALL compute phase state, runtime events, and diagnostics without changing entries, exits, stop prices, exit masks, trade count, PnL, PF, or exit reasons.

#### Scenario: Diagnostic-only matches config without exit management
- **GIVEN** two otherwise identical strategy specs
- **AND** one spec omits `exit_management`
- **AND** the other spec sets `exit_management.mode: "diagnostic_only"` with phase rules only
- **WHEN** both backtests run on the same candle data
- **THEN** trade count matches
- **AND** net PnL matches within existing numeric tolerance
- **AND** profit factor matches within existing numeric tolerance
- **AND** exit reasons match for the same trades

#### Scenario: Diagnostic-only emits phase diagnostics
- **GIVEN** a diagnostic-only config with phase rules
- **WHEN** a closed trade reaches `proven`, `protected`, or `runner`
- **THEN** the closed trade record includes trade-management phase diagnostics
- **AND** the variant metrics include a trade-management summary

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

### Requirement: Legacy exit_management wire shape is rejected
The legacy `exit_management.always_on` / `profiles` wire shape SHALL NOT be supported as a runtime or validation-accepted config.

Validation SHALL use **presence-based rejection**: if `exit_management` contains an `always_on` or `profiles` key at all, validation SHALL fail — including empty `rules: []` or empty profile groups. Rejection is not limited to non-empty legacy rules.

Error message:

`Legacy exit_management shape is no longer supported; use mode=managed with stop_management/take_management/runtime_exits.`

There SHALL be no compatibility migration, no adapter shim, and no `run_managed_bar_loop` call-sites in production code (backtest, signal trace, reports, diagnostics, API/BFF).

New managed `break_even_stop` rules SHALL use the v2 `stop_management` contract with `activate_when` and uniform events.

`exit_policy.always_on` / `profiles` SHALL remain unchanged and MUST NOT be conflated with legacy `exit_management` rejection.

#### Scenario: Legacy always_on key rejected even when rules empty
- **GIVEN** a strategy config contains `exit_management.always_on: { "rules": [] }`
- **WHEN** validation runs
- **THEN** validation fails with the legacy unsupported error message

#### Scenario: Legacy profiles key rejected
- **GIVEN** a strategy config contains `exit_management.profiles` with empty aligned/countertrend/neutral groups
- **WHEN** validation runs
- **THEN** validation fails with the legacy unsupported error message

#### Scenario: Legacy always_on break_even config is rejected
- **GIVEN** a strategy spec contains `exit_management.always_on.rules` with `component_id: "break_even_stop"` and `trigger_r`
- **WHEN** validation runs
- **THEN** validation fails with the legacy unsupported error message

#### Scenario: Managed break-even uses new contract
- **GIVEN** a new managed config authors breakeven protection
- **WHEN** validation runs
- **THEN** the rule is expressed under `stop_management` with `component_id: "break_even_stop"`
- **AND** the legacy always_on/profile rule shape is not accepted

### Requirement: Single managed runtime execution path
When behavior-changing managed rules are active, the backtest SHALL use only the v2 managed execution loop (`run_managed_execution_loop` with `ManagedExitProvider`, `ExitCandidate`, and `ExitArbitrator`).

The backtest SHALL NOT route to `run_managed_bar_loop`, `_run_managed_strategy_spec`, or `has_exit_management_rules` for execution-path selection.

No production module (including `signal_trace.py`, reports, diagnostics, API/BFF) SHALL call `run_managed_bar_loop`.

There SHALL be exactly one behavior-changing bar-by-bar execution owner: the v2 managed execution loop.

#### Scenario: Managed config routes to v2 execution loop
- **GIVEN** a strategy spec with `mode=managed` and non-empty `stop_management`
- **WHEN** a backtest runs
- **THEN** execution uses `run_managed_execution_loop`
- **AND** does not use `run_managed_bar_loop` for trade closes

#### Scenario: Default path unchanged for non-behavior-changing configs
- **GIVEN** a strategy spec without behavior-changing managed rules
- **WHEN** a backtest runs
- **THEN** execution uses the default vectorbt / `from_signals` path
- **AND** trade outcomes match baseline parity expectations

### Requirement: Provider end-of-bar update does not run on entry bar
When a position opens on bar N from a precomputed entry signal at bar close, the execution layer SHALL NOT call `update_end_of_bar_snapshot` on bar N.

The first provider end-of-bar update for that trade SHALL occur no earlier than bar N+1.

Rationale: OHLC does not reveal intrabar path; using bar N high/low before close-entry would be lookahead.

#### Scenario: Entry bar skips provider snapshot update
- **GIVEN** a managed trade that opens on bar N from an entry signal
- **WHEN** bar N completes
- **THEN** no `update_end_of_bar_snapshot` call runs for that trade on bar N
- **AND** provider end-of-bar update may run starting bar N+1 if the trade remains open

### Requirement: Legacy exit_management authoring surface is removed
The supported strategy authoring API SHALL NOT expose legacy exit_management builders or catalog entries for R-trigger break-even.

Specifically, production code SHALL NOT provide:

- `break_even_stop_rule(trigger_r, offset_r)` or equivalent legacy builder;
- `exit_management(always_on=…, profiles=…)` legacy BE builder;
- registry/catalog descriptions of trigger_r-based `exit_management` components;
- public `ExitManagementSpec.always_on`, `ExitManagementSpec.profiles`, or `ExitManagementRuleSpec(trigger_r)` as part of the supported contract.

`exit_policy` authoring (`exit_policy.always_on`, `exit_policy.profiles`) SHALL remain unchanged.

#### Scenario: Legacy builders are not importable from public authoring API
- **GIVEN** a consumer imports the supported ema_pullback component builder surface
- **WHEN** they search for legacy `break_even_stop_rule` with `trigger_r` or legacy `exit_management(always_on, profiles)`
- **THEN** those symbols are not available as supported public authoring API

### Requirement: Composer authoring v1 for managed exit_management (Slice 10)
The Workbench Composer SHALL provide authoring UI for `trade_management.exit_management` using the v2 contract:

- `mode`: `diagnostic_only` or `managed`
- `phase_rules`
- `stop_management` with `break_even_stop` and `lock_profit_stop`
- `take_management` with `take_profile_switch` actions `keep_initial` and `disable_initial_tp`
- `runtime_exits` with `phase_runtime_exit` and `params.exit_price: "close"`

Each management rule SHALL be authored with `rule_id`, `component_id`, `activate_when`, and `params` per the backend contract.

Phase rule conditions SHALL be authored with `condition.component_id` and `condition.params` per the allowlisted phase-rule condition registry. The Composer MUST NOT serialize legacy `condition.type` shapes.

The Composer SHALL save and load managed configs without losing `phase_rules`, `stop_management`, `take_management`, or `runtime_exits` fields.

The Composer SHALL NOT expose or serialize legacy exit_management shapes:

- `exit_management.always_on` or `exit_management.profiles`
- `trigger_r`, `offset_r`, or R-trigger break-even authoring
- Legacy `break_even_stop_rule` terminology or fields
- `phase_rules[].condition.type`

The `exit_policy` Composer section SHALL remain unchanged and separate from exit_management authoring.

A Composer-generated managed config SHALL validate and run on the existing backend path without runtime or execution changes.

**Out of scope for this requirement (future work):** Workbench baseline-vs-managed comparison UX, compare runner from Composer, active managed stop line overlay, richer phase/runner chart visualization. Slice 8 read-support (report panels, existing event markers) remains sufficient; Slice 10 does not add comparison UI or new chart overlays.

#### Scenario: Composer saves managed break-even under stop_management
- **GIVEN** a user authors breakeven protection in Composer with `mode: "managed"`
- **WHEN** the draft is saved and validated
- **THEN** the rule appears under `stop_management` with `component_id: "break_even_stop"` and `activate_when.phase_at_least`
- **AND** the saved JSON does not contain `always_on`, `profiles`, `trigger_r`, or `offset_r` under `exit_management`

#### Scenario: Composer rejects legacy exit_management keys in draft
- **GIVEN** a draft JSON contains `exit_management.always_on` or `exit_management.profiles`
- **WHEN** validation runs through the Composer validate flow
- **THEN** validation fails with the legacy unsupported error message
- **AND** the Composer UI does not offer controls that produce those keys

#### Scenario: Composer round-trips managed smoke fixture shape
- **GIVEN** the managed smoke config structure (`exit_management_managed_smoke.json`) rewritten to component-style phase conditions
- **WHEN** an equivalent config is authored in Composer, saved, and loaded back
- **THEN** validation succeeds
- **AND** serialized `exit_management` contains `mode`, `phase_rules`, `stop_management`, `take_management`, and `runtime_exits` only
- **AND** loaded draft preserves all management arrays without field loss

#### Scenario: Composer loads saved managed config without field loss
- **GIVEN** a saved managed config with non-empty `phase_rules`, `stop_management`, `take_management`, and `runtime_exits`
- **WHEN** the Composer loads that config into the draft editor
- **THEN** all four arrays are present in Composer state
- **AND** re-serialized draft matches the v2 wire shape

#### Scenario: Composer-generated managed config runs on backend
- **GIVEN** a managed config authored and saved through Composer
- **WHEN** the config is run through the existing research backtest path
- **THEN** the run completes without validation or routing errors attributable to Composer serialization

#### Scenario: Non-managed configs still work in Composer
- **GIVEN** a config with `mode: "diagnostic_only"` or without behavior-changing `exit_management`
- **WHEN** the Composer loads, edits unrelated fields, and saves
- **THEN** validation succeeds
- **AND** `exit_management` shape remains valid for the selected mode

#### Scenario: Composer rejects legacy phase condition.type in draft
- **GIVEN** a draft phase rule contains `condition.type: "mfe_atr"`
- **WHEN** Composer validate runs
- **THEN** validation fails with a clear error that `condition.type` is unsupported
- **AND** the author must use `condition.component_id` and `params`

### Requirement: Composer authors phase rule conditions via component catalog
The phase-rules editor SHALL expose an allowlisted condition component picker (`mfe_atr`, `mfe_pct`, `bars_in_trade`, `adx_di_threshold`) and render params fields per selected `component_id`.

For `bars_in_trade`, `params.threshold` MUST be authored and validated as an integer `>= 1`.

For `adx_di_threshold`, authors MUST be able to set `timeframe`, `period`, `adx_threshold`, and `require_di_alignment`.

Adding a phase condition MUST NOT auto-create blockers, stop_management rules, or runtime exits. Pairing with `break_even_stop` or `take_profile_switch` remains explicit separate authoring.

#### Scenario: Author adds adx_di_threshold for protected phase
- **WHEN** the author adds a phase rule with `to_phase: "protected"` and condition component `adx_di_threshold`
- **AND** sets `params.timeframe: "base"`, `params.period: 14`, `params.adx_threshold: 40`, `params.require_di_alignment: true`
- **THEN** the draft serializes `condition: { component_id, params }` under `phase_rules`
- **AND** no blocker or stop rule is added automatically

#### Scenario: Composer rejects non-integer bars_in_trade threshold
- **GIVEN** a draft phase rule with `condition.component_id: "bars_in_trade"` and `params.threshold: 2.5`
- **WHEN** Composer validate runs
- **THEN** validation fails with a clear error that threshold must be an integer `>= 1`

#### Scenario: Author migrates mfe_atr preset to component style
- **WHEN** the author uses the default diagnostic phase preset after this change
- **THEN** each rule's condition uses `component_id: "mfe_atr"` with equivalent `params`
- **AND** no `condition.type` field is present in the saved draft

#### Scenario: Composer round-trips component-style phase rules with stop_management
- **GIVEN** a saved config with `adx_di_threshold` phase rule and separate `break_even_stop` under `stop_management`
- **WHEN** Composer loads, saves, and reloads
- **THEN** both rules are preserved without field loss
- **AND** backend validation accepts the draft

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

