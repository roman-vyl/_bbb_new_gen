## ADDED Requirements

### Requirement: Composer authors runtime_exits with allowlisted reusable components
The Research Workbench Composer SHALL allow authors to add rules to `trade_management.exit_management.runtime_exits[]` using components whose catalog `allowed_roles` includes `exit_management.runtime_exit`.

V1 allowlist for picker:

- `rsi_signal_exit`
- `ema_cross_loss_exit`
- `phase_runtime_exit`

Each authored rule MUST include `rule_id`, `component_id`, `role: "exit_management.runtime_exit"`, `activate_when.phase_at_least`, and `exit_kind` (except `phase_runtime_exit` may default `exit_kind` to `market_close`).

Composer MUST NOT create duplicate component ids (e.g. `runner_rsi_exit`).

#### Scenario: Author adds runner RSI runtime exit
- **WHEN** the author adds `rsi_signal_exit` to `runtime_exits` with `activate_when.phase_at_least: "runner"` and `exit_kind: "take_profit"`
- **THEN** the draft serializes the rule under `trade_management.exit_management.runtime_exits`
- **AND** `role` is `exit_management.runtime_exit`

#### Scenario: Author adds runner EMA cross protective exit
- **WHEN** the author adds `ema_cross_loss_exit` to `runtime_exits` with `exit_kind: "protective_exit"`
- **THEN** the draft preserves `fast_ema` / `slow_ema` nested params
- **AND** validate accepts the draft when `exit_policy` contains required baseline exits

### Requirement: Validate rejects runtime_exits authoring violations
Composer validate SHALL forward research validation for:

- missing `activate_when` on runtime exits
- `component_id` not in catalog allowlist for `exit_management.runtime_exit`
- explicit `role` mismatch
- disallowed `exit_kind` values (including `signal`)

Errors MUST surface to the author; Composer MUST NOT strip invalid rules silently.

#### Scenario: Composer rejects runtime exit without activate_when
- **GIVEN** a draft `runtime_exits` rule missing `activate_when`
- **WHEN** validate runs
- **THEN** validation fails with a clear `activate_when` required message

#### Scenario: Composer rejects exit_kind signal on runtime exit
- **GIVEN** a draft `runtime_exits` rule with `exit_kind: "signal"`
- **WHEN** validate runs
- **THEN** validation fails with a message listing allowed runtime exit kinds

#### Scenario: Composer rejects atr_stop_loss in runtime_exits picker
- **GIVEN** the component catalog for `ema_pullback`
- **WHEN** the author opens the runtime_exits component picker
- **THEN** `atr_stop_loss` is not offered
- **AND** pasted JSON with `atr_stop_loss` fails validate

## MODIFIED Requirements

### Requirement: Catalog exposes break_even_stop for exit_management role
The component catalog SHALL register management components with `allowed_roles` appropriate to their consumer. `break_even_stop` SHALL include `exit_management.stop_rule` (or equivalent) in `allowed_roles`. Signal exit components used in runtime_exits SHALL appear in catalog with both `exit_policy.signal_exit` and `exit_management.runtime_exit` when authorized.

Catalog sections SHALL mirror exit-management lists (`phase_rules`, `stop_management`, `take_management`, `runtime_exits`).

#### Scenario: Catalog lists rsi_signal_exit for runtime_exits section
- **WHEN** the Composer loads the component catalog for `ema_pullback`
- **THEN** `rsi_signal_exit` is selectable for `runtime_exits` authoring
- **AND** its `allowed_roles` includes `exit_management.runtime_exit`

#### Scenario: Param schema round-trips for runtime RSI rule
- **WHEN** the author sets RSI thresholds on a `runtime_exits` `rsi_signal_exit` rule and saves
- **THEN** validate accepts the draft
- **AND** the saved JSON preserves `params` identically to exit_policy signal exit shape
