# trend-strength-episode-blocker Specification

## Purpose

Opt-in `ema_pullback` entry blocker with ADX/DMI episode memory: allow pullback entries only while a recent side-aware strength confirmation remains fresh, without requiring high ADX on the entry bar. MVP uses base-timeframe ADX/DMI from the feature plan, Signal Trace blocker internals, and `component_counters` with `blocked_reason_breakdown`. EMA-stack direction is owned by the direction component; legacy `require_ema_stack_direction` in configs is ignored. See `docs/research/19_trend_strength_episode_blocker.md`.

## Requirements

### Requirement: Blocker component registration

The `ema_pullback` strategy family SHALL expose `trend_strength_episode_blocker` as a blocker component with `role: blockers` and `component_id: trend_strength_episode_blocker`. The component MUST NOT be registered or treated as a setup, trigger, exit, direction, or risk component.

#### Scenario: Component catalog exposes blocker role

- **GIVEN** the component catalog is built for `ema_pullback`
- **WHEN** the catalog lists blocker components
- **THEN** `trend_strength_episode_blocker` appears under `role: blockers`
- **AND** it does not appear under setup, trigger, exit, direction, or risk roles

#### Scenario: Entry composition ANDs blocker mask

- **GIVEN** a strategy config includes `trend_strength_episode_blocker` in `components.blockers`
- **WHEN** long or short entry signals are composed
- **THEN** entries require the blocker `allowed` mask in addition to direction, setup, trigger, and risk
- **AND** the blocker does not replace setup or trigger semantics

### Requirement: Blocker configuration and validation

The component SHALL accept params: `timeframe`, `adx_period`, `min_adx_peak`, `peak_lookback_bars`, `max_bars_since_peak`, `min_current_adx`, `require_di_alignment_on_peak`, `block_on_opposite_di_flip`, and `opposite_di_margin`. For MVP, `timeframe` MUST be `base`. Legacy configs MAY include `require_ema_stack_direction`; the loader SHALL accept the key and MUST ignore it at runtime (EMA stack direction is enforced by the direction component only — see `docs/research/19_trend_strength_episode_blocker.md`). Type constraints:

- `adx_period`, `peak_lookback_bars`, `max_bars_since_peak`: positive integers
- `min_adx_peak`: positive float (ADX threshold; MUST be `> 0`, not `>= 0`)
- `min_current_adx`, `opposite_di_margin`: non-negative floats

`opposite_di_margin` MUST be validated when `block_on_opposite_di_flip` is true.

#### Scenario: Valid MVP config is accepted

- **GIVEN** a blocker rule with `component_id: trend_strength_episode_blocker`
- **AND** params matching the MVP defaults in `docs/research/19_trend_strength_episode_blocker.md`
- **WHEN** the strategy spec is loaded and validated
- **THEN** the blocker config is accepted
- **AND** params participate in strategy identity / config id generation

#### Scenario: Non-base timeframe is rejected in MVP

- **GIVEN** a blocker rule with `component_id: trend_strength_episode_blocker`
- **AND** `timeframe` is not `base`
- **WHEN** the strategy spec is validated
- **THEN** validation fails with a clear error
- **AND** the user must use `timeframe: base` for MVP
- **AND** HTF ADX/DMI alignment is explicitly out of scope until a follow-up change (param is reserved for v2)

#### Scenario: Zero min_adx_peak is rejected

- **GIVEN** a blocker rule with `component_id: trend_strength_episode_blocker`
- **AND** `min_adx_peak` is `0`
- **WHEN** the strategy spec is validated
- **THEN** validation fails with a clear error
- **AND** `min_adx_peak` must be a positive float

### Requirement: Feature plan provides ADX and DMI columns

The feature plan SHALL register ADX, +DI, and -DI for the configured `adx_period` on the blocker `timeframe`. The blocker SHALL consume prepared columns from the feature plan and MUST NOT compute ADX or DMI inside the blocker component.

#### Scenario: Feature plan includes ADX DMI for configured period

- **GIVEN** a strategy uses `trend_strength_episode_blocker` with `adx_period: 14` and `timeframe: base`
- **WHEN** the feature plan is built
- **THEN** the plan includes base-timeframe ADX and DMI columns for period 14
- **AND** calculations materialize those columns before blocker execution

#### Scenario: Blocker does not compute indicators internally

- **GIVEN** required ADX/DMI columns are missing from prepared market data
- **WHEN** the blocker is executed
- **THEN** execution fails through normal missing-feature validation or column access
- **AND** the blocker does not derive ADX from OHLC inside the component

### Requirement: Side-aware strength confirmation in lookback

For each bar and trade side, the blocker SHALL search the inclusive window of the last `peak_lookback_bars` bars for **qualifying strength confirmation** bars where `ADX >= min_adx_peak`. When `require_di_alignment_on_peak` is true, bar *i* qualifies for long only if `+DI[i] > -DI[i]` and for short only if `-DI[i] > +DI[i]`. The blocker SHALL use the **most recent** qualifying index in that window as `adx_peak_idx` (diagnostic naming may keep “peak”; semantics are **not** a local ADX maximum or argmax over the window). If no qualifying bar exists, the blocker MUST block with `blocked_reason=no_recent_adx_peak`.

#### Scenario: Qualifying bar is not required to be a local ADX maximum

- **GIVEN** bar `t-2` has `ADX = 30` and qualifies with aligned DI
- **AND** bar `t-1` has `ADX = 28` and also qualifies with aligned DI
- **WHEN** the blocker evaluates bar `t`
- **THEN** `adx_peak_idx` is `t-1` (most recent qualifying bar)
- **AND** the implementation does not require `ADX[t-1]` to exceed `ADX[t-2]` and `ADX[t]`

#### Scenario: Long uses most recent aligned peak

- **GIVEN** long side evaluation on bar `t`
- **AND** bar `t-10` has `ADX >= min_adx_peak` with `+DI > -DI`
- **AND** bar `t-3` has `ADX >= min_adx_peak` with `+DI > -DI`
- **WHEN** the blocker evaluates bar `t`
- **THEN** `adx_peak_idx` is `t-3`
- **AND** `bars_since_adx_peak` is `3`

#### Scenario: Long peak without DI alignment is ignored when required

- **GIVEN** `require_di_alignment_on_peak` is true
- **AND** the only bars with `ADX >= min_adx_peak` in lookback have `-DI >= +DI`
- **WHEN** long side is evaluated
- **THEN** `blocked_reason` is `no_recent_adx_peak`
- **AND** `allowed` is false for that bar

#### Scenario: Short mirror uses negative DI dominance on peak

- **GIVEN** short side evaluation on bar `t`
- **AND** bar `t-5` has `ADX >= min_adx_peak` with `-DI > +DI`
- **WHEN** the blocker evaluates bar `t`
- **THEN** `adx_peak_idx` is `t-5`
- **AND** short peak DI fields are recorded in diagnostics

### Requirement: Episode freshness and minimum current ADX

Let `bars_since_adx_peak = t - adx_peak_idx` for the selected peak. The blocker SHALL allow entry only when `bars_since_adx_peak <= max_bars_since_peak`. The blocker SHALL allow entry only when current `ADX[t] >= min_current_adx`. Violations MUST set `blocked_reason` to `peak_too_old` or `current_adx_too_low` respectively.

#### Scenario: Stale peak blocks entry

- **GIVEN** a qualifying peak exists at `t-50`
- **AND** `max_bars_since_peak` is `40`
- **WHEN** the blocker evaluates bar `t`
- **THEN** `blocked_reason` is `peak_too_old`
- **AND** `allowed` is false

#### Scenario: Pullback with faded but sufficient ADX is allowed

- **GIVEN** a qualifying peak at `t-15` with `ADX` peak `30`
- **AND** current `ADX[t]` is `14`
- **AND** `min_current_adx` is `12`
- **AND** `max_bars_since_peak` is `40`
- **WHEN** other allow conditions pass
- **THEN** `allowed` is true
- **AND** `blocked_reason` is empty or not set for this component

#### Scenario: Current ADX below floor blocks entry

- **GIVEN** a recent qualifying peak
- **AND** current `ADX[t]` is below `min_current_adx`
- **WHEN** the blocker evaluates bar `t`
- **THEN** `blocked_reason` is `current_adx_too_low`
- **AND** `allowed` is false

### Requirement: Opposite DI flip block

When `block_on_opposite_di_flip` is true, the blocker SHALL block long entries when `-DI[t] > +DI[t] + opposite_di_margin` and SHALL block short entries when `+DI[t] > -DI[t] + opposite_di_margin`. This condition MUST set `blocked_reason=opposite_di_flip` and `opposite_di_flip` diagnostic true.

#### Scenario: Long opposite flip blocks

- **GIVEN** `block_on_opposite_di_flip` is true and `opposite_di_margin` is `5`
- **AND** on bar `t` we have `-DI - +DI > 5`
- **WHEN** long side is evaluated and peak conditions would otherwise pass
- **THEN** `allowed` is false
- **AND** `blocked_reason` is `opposite_di_flip`

#### Scenario: Opposite flip disabled does not apply margin block

- **GIVEN** `block_on_opposite_di_flip` is false
- **AND** DI is opposed to trade side beyond `opposite_di_margin`
- **WHEN** peak and ADX floor conditions pass
- **THEN** opposite flip does not by itself set `blocked_reason=opposite_di_flip`

### Requirement: Episode active flag and allow mask

The blocker SHALL expose `trend_strength_active` true on bars where `allowed` is true due to this component (all episode conditions satisfied). The runtime function SHALL return `allowed` as a boolean `pd.Series` aligned to the market index. A companion trace function SHALL return diagnostics including at minimum: `trend_strength_active`, `blocked_reason`, `adx_current`, `adx_peak`, `adx_peak_idx`, `bars_since_adx_peak`, `di_plus_current`, `di_minus_current`, `di_plus_at_peak`, `di_minus_at_peak`, `di_alignment_at_peak`, `opposite_di_flip`.

#### Scenario: Allowed bar has empty blocked reason

- **GIVEN** all episode conditions pass on bar `t`
- **WHEN** trace is built for that bar
- **THEN** `allowed[t]` is true
- **AND** `trend_strength_active[t]` is true
- **AND** `blocked_reason[t]` is empty or a neutral allow sentinel defined by implementation

#### Scenario: Blocked bar has specific reason

- **GIVEN** no qualifying peak in lookback on bar `t`
- **WHEN** trace is built
- **THEN** `allowed[t]` is false
- **AND** `blocked_reason[t]` is `no_recent_adx_peak`

### Requirement: Component counters and blocked_reason breakdown

For each enabled trade side, when `trend_strength_episode_blocker` is configured, the research run SHALL emit a `component_counters` entry with `role: blockers`, matching `component_id` and `instance_id`, and `output_type: allow_mask`. Its `counters` object MUST include `allowed_count`, `blocked_count`, and `blocked_reason_breakdown`.

`blocked_reason_breakdown` SHALL count bars where this blocker’s `allowed` is false, grouped by `blocked_reason` from the same trace evaluation used at runtime. Supported reason keys:

- `no_recent_adx_peak`
- `peak_too_old`
- `current_adx_too_low`
- `opposite_di_flip`
- `indicator_not_ready` (ADX/DMI not finite or within indicator warmup)

The sum of breakdown counts MUST equal `blocked_count` when each blocked bar has exactly one reason. Other blocker components MUST NOT be required to emit `blocked_reason_breakdown`.

#### Scenario: Breakdown appears in variant JSON

- **GIVEN** a backtest variant uses `trend_strength_episode_blocker`
- **WHEN** the run artifact is written
- **THEN** `variants[].component_counters` contains an entry for that blocker `instance_id` and side
- **AND** `counters.blocked_reason_breakdown` is a non-empty map when `blocked_count > 0`

#### Scenario: Breakdown sums to blocked_count

- **GIVEN** a completed run with `blocked_count` 2100 for long `trend_strength_episode_blocker`
- **WHEN** `blocked_reason_breakdown` is read
- **THEN** the sum of all reason counts is `2100`

#### Scenario: Warmup bars use indicator_not_ready

- **GIVEN** ADX/DMI is NaN on early bars due to warmup
- **WHEN** the blocker evaluates those bars
- **THEN** `allowed` is false
- **AND** `blocked_reason` is `indicator_not_ready`
- **AND** those bars increment `blocked_reason_breakdown.indicator_not_ready`

### Requirement: Opt-in backward compatibility

Strategies that do not list `trend_strength_episode_blocker` in `components.blockers` SHALL behave identically to their pre-change behavior. Default factory specs and baseline experiment configs MUST NOT enable this blocker unless explicitly configured.

#### Scenario: Default spec unchanged

- **GIVEN** `default_ema_pullback_strategy_spec` or equivalent baseline factory
- **WHEN** loaded without custom blockers
- **THEN** `trend_strength_episode_blocker` is not invoked
- **AND** entry masks match the prior `no_blockers` / existing blocker tuple only
