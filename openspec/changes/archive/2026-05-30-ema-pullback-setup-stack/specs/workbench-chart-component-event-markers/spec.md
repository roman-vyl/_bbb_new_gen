# workbench-chart-component-event-markers Delta Specification

## ADDED Requirements

### Requirement: Multiple setup instances disambiguate component events by instance_id

When a report's `component_events[]` includes events with `role: setup` from more than one setup instance, each event MUST carry the emitting setup's `instance_id` in addition to `component_id`. The Chart marker layer MUST render setup events using existing generic rules (`event_type`, `role`, `side`) and MUST use `instance_id` only for labels/tooltips/metadata, not for component-specific rendering branches.

#### Scenario: Two setup sources on one chart

- **GIVEN** `component_events` contains setup events for `instance_id` `untouched_anchor` and `bounce_counter`
- **WHEN** the Chart displays markers
- **THEN** both event groups appear
- **AND** tooltips distinguish `instance_id` values
- **AND** no chart code branches on `component_id === "ema_bounce_counter_setup"`

#### Scenario: Setup event tooltip shows instance

- **GIVEN** a setup `span_start` event with `component_id`, `instance_id`, and `role: setup`
- **WHEN** the user inspects the marker tooltip
- **THEN** the tooltip includes `instance_id`
