# composer-exit-management Specification

## Purpose
TBD - created by archiving change exit-management-combiner-v1. Update Purpose after archive.
## Requirements
### Requirement: Composer authors exit_management separately from exit_policy
The Research Workbench Composer SHALL expose exit-management rule lists under `trade_management.exit_management`, separate from `trade_management.exit_policy` exit lists. Authors MUST be able to add `break_even_stop` rules to:

- `exit_management.always_on.rules[]`
- `exit_management.profiles.aligned.rules[]`
- `exit_management.profiles.countertrend.rules[]`
- `exit_management.profiles.neutral.rules[]`

Composer MUST NOT place `break_even_stop` in `exit_policy.always_on.exits` or `exit_policy.profiles.*.exits`.

#### Scenario: Add break-even to always_on management rules
- **WHEN** the author adds component `break_even_stop` to Exit management always-on rules
- **THEN** the draft contains `trade_management.exit_management.always_on.rules[]` with `component_id: break_even_stop`
- **AND** the rule is not written under `exit_policy.always_on.exits`

#### Scenario: Add break-even to profile management rules
- **WHEN** the author adds `break_even_stop` to Profile aligned management rules
- **THEN** the draft contains `trade_management.exit_management.profiles.aligned.rules[]` with the configured instance
- **AND** other profile buckets remain independent lists

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

### Requirement: Validate enforces v1 exit_management constraints
Validate SHALL reject invalid exit-management drafts: empty `instance_id`, duplicate `instance_id` across exit policy and exit management, more than one `break_even_stop` per group, `trigger_r <= 0`, `offset_r < 0`, `apply_once` not true when v1 requires it, or **`break_even_stop` without a resolvable initial `stop_loss` in the matching `exit_policy` group**.

#### Scenario: Break-even without protective stop fails validate
- **GIVEN** the draft has `break_even_stop` under exit management
- **AND** the effective exit_policy group for that bucket has no `stop_loss` rule (e.g. only signal exits)
- **WHEN** validate runs
- **THEN** validation fails with a message that break-even requires an initial stop from exit policy

#### Scenario: Duplicate break_even in same group fails validate
- **GIVEN** `exit_management.profiles.aligned.rules` already contains one `break_even_stop`
- **WHEN** the author adds a second `break_even_stop` to the same aligned group
- **THEN** validate fails with a clear error on that path

#### Scenario: Valid combined exit_policy and exit_management draft passes
- **GIVEN** `exit_policy.always_on.exits` contains `atr_stop_loss`
- **AND** `exit_management.profiles.aligned.rules` contains one `break_even_stop`
- **WHEN** validate runs
- **THEN** validation succeeds

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

