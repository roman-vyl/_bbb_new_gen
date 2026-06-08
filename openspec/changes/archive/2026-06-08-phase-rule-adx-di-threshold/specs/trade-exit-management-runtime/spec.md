## MODIFIED Requirements

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

## ADDED Requirements

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
