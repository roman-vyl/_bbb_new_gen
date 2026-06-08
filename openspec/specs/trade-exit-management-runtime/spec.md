# trade-exit-management-runtime Specification

## Purpose
TBD - created by archiving change trade-exit-management-runtime-v1. Update Purpose after archive.
## Requirements
### Requirement: Exit management runtime is configured inside trade management
The strategy spec SHALL support an optional `trade_management.exit_management` object beside `trade_management.exit_policy`. `exit_policy` SHALL remain the source of declarative exit components. `exit_management` SHALL own runtime state, phase evaluation, active-stop diagnostics, runtime trace, and later behavior-changing runtime controls.

For v1, `exit_management` SHALL support:

- `mode`: `"diagnostic_only"` or omitted defaulting to behavior-compatible disabled/legacy handling.
- `phase_rules`: ordered list of phase transition rules.
- `stop_management`: list reserved for behavior-changing stop rules; v1 diagnostic-only configs MUST leave it empty.
- `runtime_exits`: list reserved for phase-gated runtime exit rules; v1 diagnostic-only configs MUST leave it empty.

The legacy `exit_management.always_on/profiles/rules` `break_even_stop` shape SHALL NOT be considered part of this runtime contract. It MAY remain temporarily as deprecated backward-compatible parsing/runtime support for existing artifacts, but new diagnostic runtime behavior MUST NOT depend on it.

#### Scenario: Config places runtime controller beside exit policy
- **GIVEN** a strategy spec contains `trade_management.exit_policy`
- **WHEN** the spec also contains `trade_management.exit_management.mode: "diagnostic_only"`
- **THEN** validation accepts `exit_management` as a sibling of `exit_policy`
- **AND** validation does not move runtime rules into `exit_policy`

#### Scenario: Old config without exit management preserves behavior
- **GIVEN** a strategy spec does not contain `trade_management.exit_management`
- **WHEN** a backtest runs
- **THEN** no trade-management phase diagnostics are emitted
- **AND** the existing exit-policy behavior is preserved

#### Scenario: Diagnostic-only rejects behavior-changing rule lists in v1
- **GIVEN** a strategy spec contains `trade_management.exit_management.mode: "diagnostic_only"`
- **AND** `stop_management` or `runtime_exits` contains one or more rules
- **WHEN** validation runs for v1
- **THEN** validation fails with a message that behavior-changing exit management is out of scope for diagnostic-only v1

#### Scenario: Legacy BE shape is not runtime v1 input
- **GIVEN** an existing strategy spec uses `exit_management.always_on/profiles/rules` with `break_even_stop`
- **WHEN** diagnostic runtime v1 is implemented
- **THEN** the diagnostic runtime does not read those legacy rules as phase, stop-management, or runtime-exit inputs
- **AND** any continued support for that shape is treated as deprecated compatibility only

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

V1 phase-rule conditions SHALL support:

- `mfe_atr`
- `mfe_pct`
- `bars_in_trade`

`mfe_atr` conditions SHALL use the configured ATR reference aligned to the backtest index. If the ATR value required for a bar is missing, non-finite, or not positive, the condition SHALL NOT trigger on that bar.

#### Scenario: MFE ATR rule moves trade to proven
- **GIVEN** a long trade in `initial_risk`
- **AND** a phase rule has `to_phase: "proven"` and condition `mfe_atr >= 1.0`
- **WHEN** the trade's side-aware MFE reaches at least one configured ATR
- **THEN** the runtime changes the trade phase to `proven`
- **AND** `max_phase_reached` becomes `proven`

#### Scenario: Bars-in-trade rule moves trade by age
- **GIVEN** a trade in `initial_risk`
- **AND** a phase rule has `to_phase: "proven"` and condition `bars_in_trade >= 12`
- **WHEN** the trade reaches 12 bars in trade
- **THEN** the runtime changes the trade phase to `proven`

#### Scenario: Phase does not move backward
- **GIVEN** a trade already reached `runner`
- **WHEN** a later bar no longer satisfies a previous `protected` threshold
- **THEN** the trade remains in `runner`
- **AND** `max_phase_reached` remains `runner`

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
The runtime SHALL support `TradeManagementEvent` records with trade id, time, bar index, side, event type, phase transition fields, rule/component identifiers, price fields, MFE/MAE percent, bars in trade, and metadata.

V1 diagnostic-only runtime SHALL emit:

- `phase_changed` when a phase rule changes the trade phase.
- `exit_executed` when the real trade closes.

The `active_stop_updated` and `exit_rule_triggered` event types SHALL be reserved for later behavior-changing stop/runtime exits.

#### Scenario: Phase transition emits event
- **GIVEN** a diagnostic-only trade in `initial_risk`
- **WHEN** rule `to_proven_at_1atr` moves it to `proven`
- **THEN** the runtime records a `phase_changed` event
- **AND** the event has `from_phase: "initial_risk"`
- **AND** the event has `to_phase: "proven"`
- **AND** the event has `rule_id: "to_proven_at_1atr"`

#### Scenario: Closed trade emits final exit event
- **GIVEN** a diagnostic-only trade with runtime state
- **WHEN** the real trade closes by an existing exit-policy rule
- **THEN** the runtime records an `exit_executed` event
- **AND** the event includes the current phase and exit attribution when available

### Requirement: Exit priority is explicit before behavior-changing runtime exits
The runtime contract SHALL define explicit priority before any behavior-changing `stop_management` or `runtime_exits` implementation is enabled. The intended priority order is protective active stop, hard SL, runtime structure-loss exit, RSI overheat cap, static signal exits, and far safety TP.

V1 diagnostic-only mode SHALL NOT alter exits using this priority; it only records diagnostics.

#### Scenario: Diagnostic-only does not apply priority model
- **GIVEN** a diagnostic-only config with phase rules
- **WHEN** a bar would satisfy both an existing signal exit and a future reserved runtime-exit concept
- **THEN** the actual exit remains determined by the existing research execution path
- **AND** diagnostic-only mode does not use reserved priority ordering to change the trade

