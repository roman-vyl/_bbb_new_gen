## MODIFIED Requirements

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

## ADDED Requirements

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
