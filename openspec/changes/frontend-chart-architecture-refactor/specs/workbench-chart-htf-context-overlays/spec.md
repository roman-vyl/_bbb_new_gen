## MODIFIED Requirements

### Requirement: HTF aux overlays survive trace reload and window pan
While `signalTraceStatus` is `loading` or `error`, Workbench MUST NOT strip existing `htf_*` aux overlays when displayable HTF points remain available from trace display cache for the current committed render window.

HTF aux overlay points MUST be sourced from accumulated trace display cache (when available), then sliced to the current committed render window bounds (same bounds as chart candles).

When a render-window shift is pending during active pan, HTF overlay display MUST remain bound to the last committed window and MUST NOT issue viewport-related effects.

When a new committed window is applied and cache covers it, HTF overlay series MUST update from cache slice without waiting for network.

#### Scenario: Active pan with pending shift keeps committed HTF overlay view
- **GIVEN** HTF overlays are visible for committed window `[T0, T1]`
- **AND** user drag creates a pending shift intent not yet committed
- **WHEN** chart renders during active pan
- **THEN** HTF overlays remain sliced to `[T0, T1]`
- **AND** no viewport restore/focus command is triggered by HTF overlay logic

#### Scenario: Committed shift updates HTF overlays from cache
- **GIVEN** trace cache contains HTF context for both previous and next committed windows
- **WHEN** pan idle commits window shift to `[T1, T2]`
- **THEN** HTF overlays are re-sliced to `[T1, T2]` from cache immediately
- **AND** no signal-trace refetch is required solely for HTF display

### Requirement: OpenSpec changes touching chart or signal trace MUST regression-check HTF context overlays
Any change proposal that modifies chart orchestration, window lifecycle, or signal trace display/cache flow MUST include explicit regression checks for HTF context overlays on a variant with `strategy.contexts`.

Minimum regression verification MUST cover:
1. Initial chart load with resolved context overlay reference and visible dashed HTF lines.
2. Pan inside safe zone without overlay disappearance.
3. Edge-pan with deferred window commit (release/idle), then overlay continuity after commit.
4. Late trace arrival updates overlays without viewport movement.

#### Scenario: Refactor task list contains HTF regression checks
- **WHEN** a refactor changes `WorkbenchContext`, chart panel orchestration, or trace scheduling
- **THEN** `tasks.md` includes manual HTF overlay verification for load, pan, deferred commit, and late trace arrival
- **AND** change is not considered complete until these checks pass
