# ema-pullback-report-diagnostics Delta Specification

## ADDED Requirements

### Requirement: Entry diagnostics namespace setup state by instance_id

When a strategy configures multiple setup instances, closed-trade (and bar-level, where applicable) entry diagnostics that capture setup-internal fields (e.g. `setup_allowed`, `completed_bounce_count`, `effective_bounce_number`, `trend_episode_id`) MUST be stored per setup `instance_id`. Diagnostic consumers MUST NOT rely on a single flat setup object that can be overwritten when two setups expose the same field names.

#### Scenario: Dual setup entry diagnostics

- **GIVEN** a backtest with `untouched_anchor_setup` and `ema_bounce_counter_setup` in `setups`
- **WHEN** a closed trade record includes entry setup diagnostics
- **THEN** diagnostics for each setup are addressable by that setup's `instance_id`
- **AND** bounce-counter fields remain available without clobbering untouched-anchor fields

#### Scenario: Single setup retains instance_id keying

- **GIVEN** a strategy with one setup instance `instance_id: setup`
- **WHEN** entry diagnostics are emitted
- **THEN** setup diagnostics are nested under `setup` (or equivalent map) keyed by `instance_id`
