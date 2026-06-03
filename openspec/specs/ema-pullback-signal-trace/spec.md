# ema-pullback-signal-trace Specification

## Purpose

Signal Trace contract for `ema_pullback`: per-bar pipeline gates, blocker/setup internals, exit-management diagnostics, and component-agnostic `component_events`. Extended by trend-strength-episode-blocker (2026-06-02).
## Requirements
### Requirement: Signal Trace exposes exit-management diagnostics
When a traced `ema_pullback` run uses stateful exit-management rules, Signal Trace SHALL expose optional per-bar exit-management diagnostic fields sourced from the Exit Management Combiner.

Wire format (v1): parallel per-bar arrays under `long.internals.exit_management` and `short.internals.exit_management` (one value per trace bar). The BFF passes `internals` through unchanged.

Optional field keys (each a per-bar array, or null/absent when no active management on that bar):

- `effective_stop_price`
- `pending_stop_price`
- `break_even_active`
- `break_even_triggered_on_bar`
- `break_even_trigger_price`
- `break_even_stop_moved_to`
- `break_even_initial_risk`
- `break_even_instance_id`
- `active_stop_management_source`

#### Scenario: Trigger bar shows pending break-even stop
- **GIVEN** Signal Trace is built for a trade that triggers `break_even_stop` on bar `t`
- **WHEN** the trace row for bar `t` is returned
- **THEN** `break_even_triggered_on_bar` is true
- **AND** `effective_stop_price` still equals the old effective stop
- **AND** `pending_stop_price` equals the break-even moved stop

#### Scenario: Next bar shows promoted effective stop
- **GIVEN** `break_even_stop` triggered on bar `t`
- **WHEN** the trace row for bar `t+1` is returned
- **THEN** `effective_stop_price` equals the moved break-even stop
- **AND** `pending_stop_price` is null or absent for the already-promoted stop

#### Scenario: Trace source identifies profile override
- **GIVEN** the active break-even rule came from the locked profile
- **WHEN** Signal Trace rows for the active trade are returned
- **THEN** `active_stop_management_source` is `profile`
- **AND** `break_even_instance_id` equals the profile rule instance id

### Requirement: Signal Trace compatibility without management
Signal Trace SHALL remain backward compatible for runs and historical trace payloads that do not include exit-management diagnostics.

#### Scenario: No management omits optional fields
- **GIVEN** a strategy config has no `trade_management.exit_management` rules
- **WHEN** Signal Trace is returned
- **THEN** exit-management diagnostic fields are absent or null
- **AND** existing trace fields remain valid

#### Scenario: BFF preserves exit-management fields
- **GIVEN** research Signal Trace contains exit-management diagnostic fields
- **WHEN** `research_api` converts it to the API contract
- **THEN** the API response preserves those fields
- **AND** it does not drop `effective_stop_price`, `pending_stop_price`, or break-even fields

### Requirement: Signal Trace exposes trend strength episode blocker diagnostics

When a traced `ema_pullback` run includes `trend_strength_episode_blocker`, Signal Trace SHALL expose per-bar blocker diagnostics for that blocker instance. The trace record MUST include an `allowed` boolean series aligned with the runtime blocker mask used in entry composition. The trace MUST expose the diagnostic keys defined in `trend-strength-episode-blocker` (ADX peak/current, DI values, `trend_strength_active`, `blocked_reason`, `opposite_di_flip`) under the blocker consumer path for the configured `instance_id`.

#### Scenario: Blocker trace allowed matches runtime mask

- **GIVEN** Signal Trace is built for a run with `trend_strength_episode_blocker`
- **WHEN** trace blocker records are serialized
- **THEN** the `allowed` series on that record matches the mask used in `execution/signals.py` for the same side and index range

#### Scenario: Blocked bar shows blocked_reason in trace

- **GIVEN** bar `t` is blocked because `bars_since_adx_peak` exceeds `max_bars_since_peak`
- **WHEN** Signal Trace returns internals for that blocker instance
- **THEN** `blocked_reason[t]` is `peak_too_old`
- **AND** `allowed[t]` is false

#### Scenario: Trace without blocker omits fields

- **GIVEN** a strategy config does not include `trend_strength_episode_blocker`
- **WHEN** Signal Trace is returned
- **THEN** trend-strength episode diagnostic fields are absent
- **AND** existing trace fields remain valid

