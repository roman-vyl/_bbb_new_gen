## MODIFIED Requirements

### Requirement: Render window slice reads from trace cache before fetch
When the committed chart render window changes to `[firstTime, lastTime]`, Workbench MUST:

1. Check whether the trace display cache covers `[firstTime, lastTime]`
2. If covered, slice `component_events` and `htf_context` from cache immediately without network request
3. If uncovered, schedule fetch for the missing/current committed window range and merge result into cache

Pan-driven transient states before window commit MUST NOT trigger fetch decisions for display cache.

Display updates from cache MUST remain independent from viewport commands; cache hits or merges MUST NOT issue viewport focus/restore.

#### Scenario: Covered committed window updates display without fetch
- **GIVEN** display cache covers committed window `[T0, T1]`
- **WHEN** committed window changes to `[T0', T1']` fully inside coverage
- **THEN** markers and HTF overlays are sliced from cache immediately
- **AND** no `fetchSignalTrace` request starts for that transition

#### Scenario: Uncovered committed window schedules fetch
- **GIVEN** display cache does not fully cover committed window `[T0', T1']`
- **WHEN** the new window is committed
- **THEN** Workbench schedules trace fetch for missing/current range
- **AND** display keeps cache-derived partial/stale state until merge completes

### Requirement: Pan-active trace fetches SHALL be coalesced by latest committed intent
While pan is active and render-window shift intents are still pending, Workbench MUST coalesce trace fetch planning to prevent request storms from transient boundary oscillations.

At most one uncovered committed window intent MAY be queued for post-idle evaluation per active pan cycle; superseded intents MUST be replaced by the latest one.

For v1 controller runtime, uncovered pending windows during active pan MUST use strict idle-only fetch policy:
- no network prefetch starts during active pan for uncovered pending windows;
- only cache-hit display updates for current committed window are allowed during active pan.

#### Scenario: Rapid boundary oscillation does not spawn many requests
- **GIVEN** user rapidly drags near both safe-zone boundaries during one active pan cycle
- **WHEN** multiple pending shift intents are produced before idle commit
- **THEN** Workbench retains only the latest committed-window fetch intent
- **AND** does not enqueue one network fetch per transient intent

#### Scenario: Active pan uncovered range does not prefetch
- **GIVEN** pending shift points to an uncovered range while pan is still active
- **WHEN** controller evaluates trace scheduling
- **THEN** no network fetch starts for that pending uncovered range
- **AND** fetch starts only after committed shift (pointerup or idle fallback commit)

#### Scenario: Trace merge updates display only
- **GIVEN** a coalesced fetch response is merged into display cache
- **WHEN** current window display data is recomputed
- **THEN** marker and HTF overlays update for current committed window
- **AND** viewport command remains unchanged (`noViewportChange`)
