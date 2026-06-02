## ADDED Requirements

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
The component catalog SHALL register `break_even_stop` with role `exit_management` and editable parameters for v1: `trigger_r`, `offset_r`, and `apply_once` (default true). Catalog sections SHALL mirror exit-policy buckets (always_on + three profiles) but target `rules[]` lists.

#### Scenario: Catalog lists break_even_stop only under exit management sections
- **WHEN** the Composer loads the component catalog for `ema_pullback`
- **THEN** `break_even_stop` appears in exit-management sections
- **AND** it does not appear in exit-policy `role: exits` picker lists

#### Scenario: Param schema round-trips
- **WHEN** the author sets `trigger_r: 1.0` and `offset_r: 0.0` on a break-even rule and saves
- **THEN** validate accepts the draft
- **AND** the saved JSON preserves those fields on the rule object

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
