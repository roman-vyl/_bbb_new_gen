# exit-management-combiner Specification

## Purpose
TBD - created by archiving change exit-management-combiner-v1. Update Purpose after archive.
## Requirements
### Requirement: Exit management extends the existing research runtime
The `ema_pullback` research runtime SHALL process stateful exit-management rules and diagnostics inside the existing execution flow using compiled entries, compiled exit-policy outputs, profile/context state, OHLCV, and real trade lifecycle records. It MUST NOT require a separate orchestration engine beside the current research backtest path.

When `trade_management.exit_management.mode` is `diagnostic_only`, the runtime SHALL compute phase state and diagnostics from the same real trade path while preserving the existing exits. When behavior-changing stop/runtime exits are implemented later, they SHALL still operate as extensions of this same managed execution flow, not as a second simulation.

The archived `break_even_stop` `exit_management.always_on/profiles/rules` path SHALL be treated as deprecated compatibility behavior only. It MUST NOT be extended as the product path for the new runtime architecture, and diagnostic runtime v1 MUST NOT use it as a source for phases, stop management, or runtime exits.

#### Scenario: Managed runtime consumes compiled inputs
- **GIVEN** a strategy spec with `trade_management.exit_management`
- **WHEN** the backtest runs
- **THEN** exit management consumes the entries from `build_signals_from_spec`
- **AND** it consumes profile-aware exit-policy outputs from `build_exit_outputs_from_spec`
- **AND** it does not recompute setup, trigger, blocker, EMA, ATR, or context-provider logic

#### Scenario: No management keeps current static path
- **GIVEN** a strategy spec without `trade_management.exit_management`
- **WHEN** the backtest runs
- **THEN** the current static `vectorbt` path remains the execution path
- **AND** trade counts and core metrics match the pre-change behavior within existing test tolerances

#### Scenario: Diagnostic-only management uses the real trade path
- **GIVEN** a strategy spec with `trade_management.exit_management.mode: "diagnostic_only"`
- **WHEN** the backtest runs
- **THEN** exit management derives phase state from the actual opened and closed trades
- **AND** it does not create shadow positions or pseudo-trades
- **AND** it does not replace the existing exit-policy path

#### Scenario: Legacy break-even path remains deprecated compatibility
- **GIVEN** an existing strategy spec uses the archived `break_even_stop` management shape
- **WHEN** the new diagnostic runtime architecture is implemented
- **THEN** that legacy shape is not promoted into the phase-based runtime contract
- **AND** any continued execution support is isolated as deprecated backward compatibility

### Requirement: Break-even requires initial stop from exit_policy
The system MUST NOT allow `break_even_stop` without a resolvable initial protective stop from `exit_policy`. Initial stop and initial risk MUST be taken from compiled `stop_loss` distance rules for the trade’s effective exit group (always_on ∪ locked profile). `break_even_stop` MUST NOT create, infer, or substitute an initial stop.

#### Scenario: Validate rejects break-even with no stop_loss in exit_policy
- **GIVEN** a strategy spec has `break_even_stop` under `exit_management`
- **AND** `exit_policy` contains no `exit_kind: stop_loss` rules in always_on or any profile
- **WHEN** validate or spec validation runs
- **THEN** validation fails with an error that break-even requires an initial stop from exit_policy

#### Scenario: Validate rejects profile break-even without stop in that effective group
- **GIVEN** `exit_management.profiles.aligned.rules` contains `break_even_stop`
- **AND** neither `exit_policy.always_on.exits` nor `exit_policy.profiles.aligned.exits` contains any `stop_loss` rule
- **WHEN** validate runs
- **THEN** validation fails

#### Scenario: Valid config has protective SL and break-even
- **GIVEN** `exit_policy.always_on.exits` contains `atr_stop_loss`
- **AND** `exit_management.always_on.rules` contains `break_even_stop`
- **WHEN** validate runs
- **THEN** validation succeeds

#### Scenario: Runtime fails fast when entry has no initial stop
- **GIVEN** a trade opens with an active `break_even_stop` rule
- **AND** the locked profile’s compiled initial stop at `entry_idx` is not finite
- **WHEN** the combiner initializes the trade
- **THEN** the backtest fails with a clear error
- **AND** break-even is not applied with a synthetic stop

### Requirement: Break-even stop rule semantics
The combiner SHALL support a `break_even_stop` rule with `instance_id`, `trigger_r`, `offset_r`, and `apply_once`. For v1, `trigger_r` MUST be greater than zero, `offset_r` MUST be greater than or equal to zero, and `apply_once` MUST be true.

#### Scenario: Break-even trigger creates pending stop
- **GIVEN** a long trade entered at price `100` with initial stop `90`
- **AND** a `break_even_stop` rule has `trigger_r: 1.0` and `offset_r: 0.0`
- **WHEN** a bar reaches price `110`
- **THEN** the combiner records the break-even trigger on that bar
- **AND** the moved stop value is `100`
- **AND** the moved stop is pending for the next bar, not effective for the trigger bar

#### Scenario: Short break-even mirrors long semantics
- **GIVEN** a short trade entered at price `100` with initial stop `110`
- **AND** a `break_even_stop` rule has `trigger_r: 1.0` and `offset_r: 0.0`
- **WHEN** a bar reaches price `90`
- **THEN** the combiner records the break-even trigger on that bar
- **AND** the moved stop value is `100`
- **AND** the moved stop is pending for the next bar, not effective for the trigger bar

### Requirement: Next-bar stop promotion
Break-even stop movement SHALL use two-state effective/pending semantics. A pending stop created on bar `t` SHALL become the effective stop for bar `t+1`.

#### Scenario: Trigger bar keeps old effective stop
- **GIVEN** a trade has an initial effective stop
- **WHEN** break-even triggers on bar `t`
- **THEN** the effective stop used for bar `t` remains the initial stop
- **AND** the break-even stop is stored as pending for bar `t+1`

#### Scenario: Next bar uses break-even stop
- **GIVEN** break-even triggered on bar `t`
- **WHEN** the runtime processes bar `t+1`
- **THEN** the pending break-even stop is promoted to effective before stop checks on bar `t+1`

#### Scenario: Same-bar old stop hit is not reported as moved stop exit
- **GIVEN** a long trade with initial stop below entry
- **AND** a bar reaches the break-even trigger price and also trades down through the old effective stop
- **WHEN** the runtime processes that bar
- **THEN** the trade exits by the old effective stop
- **AND** the trade is not reported as exited by the moved break-even stop

### Requirement: Profile scoped management rule resolution
For v1, management rule resolution SHALL choose at most one active `break_even_stop` rule per trade. A rule in the locked entry profile SHALL override an `always_on` rule. If no locked-profile rule exists, the `always_on` rule SHALL be used. Rules SHALL NOT be merged or chained.

#### Scenario: Profile rule overrides always-on rule
- **GIVEN** `always_on` has `break_even_stop` with `trigger_r: 2.0`
- **AND** the locked entry profile is `aligned`
- **AND** profile `aligned` has `break_even_stop` with `trigger_r: 1.0`
- **WHEN** the trade opens
- **THEN** the active management rule is the `aligned` rule
- **AND** diagnostics record source `profile`

#### Scenario: Always-on fallback applies
- **GIVEN** `always_on` has a `break_even_stop` rule
- **AND** the locked entry profile has no management rule
- **WHEN** the trade opens
- **THEN** the active management rule is the `always_on` rule
- **AND** diagnostics record source `always_on`

### Requirement: Managed diagnostics are the source of truth
The combiner SHALL emit trade-level and bar-level diagnostics that downstream report, Signal Trace, API, and frontend layers can consume. Downstream layers MUST NOT recompute break-even formulas independently.

#### Scenario: Report and trace share combiner diagnostics
- **GIVEN** a trade triggers break-even
- **WHEN** report diagnostics and Signal Trace are produced
- **THEN** both outputs use the same trigger bar, initial risk, moved stop, and rule instance id from the combiner diagnostics

#### Scenario: Break-even absent when no rule applies
- **GIVEN** a trade opens under a config with no active `break_even_stop` rule
- **WHEN** diagnostics are emitted
- **THEN** break-even diagnostics are absent or marked disabled

### Requirement: Managed exits attribute break-even stop hits
When the managed path closes a trade because the **effective** stop was hit at the break-even moved level (after `break_even_stop` triggered), the trade record SHALL use `exit_reason` `break_even:<instance_id>`, `exit_kind` `break_even`, and structured exit metadata consistent with other attributed exits. Chart exit markers SHALL classify this reason (not `unknown` / UNK).

#### Scenario: Exit by moved break-even stop is labeled
- **GIVEN** a closed trade exited on a bar where the effective stop equals the combiner moved break-even stop
- **WHEN** managed trade records are built
- **THEN** `exit_reason` starts with `break_even:`
- **AND** `exit_kind` is `break_even`

