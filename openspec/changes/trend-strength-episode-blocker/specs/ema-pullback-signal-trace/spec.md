## ADDED Requirements

### Requirement: Signal Trace exposes trend strength episode blocker diagnostics

When a traced `ema_pullback` run includes `trend_strength_episode_blocker`, Signal Trace SHALL expose per-bar blocker diagnostics for that blocker instance. The trace record MUST include an `allowed` boolean series aligned with the runtime blocker mask used in entry composition. The trace MUST expose the diagnostic keys defined in `trend-strength-episode-blocker` (ADX peak/current, DI values, `trend_strength_active`, `blocked_reason`, `ema_stack_direction_ok`, `opposite_di_flip`) under the blocker consumer path for the configured `instance_id`.

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
