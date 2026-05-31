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

### Requirement: Aux overlay render-window stabilize cache MUST invalidate when overlay content changes at unchanged bounds
Workbench slices `auxEmaOverlays` to the committed render window via `chartDataWindowManager` and MAY stabilize the sliced result by render-window bounds for performance (same pattern as candles/anchor EMA).

When render-window bounds (`firstTimeSec:lastTimeSec:count`) are unchanged but aux overlay point sets change — for example HTF overlays merge into state after signal trace display apply while the user has not panned — the stabilize cache key for aux overlays MUST incorporate an overlay content fingerprint (e.g. per-overlay `id` and `points.length`).

Workbench MUST NOT return a prior empty aux slice from stabilize when HTF `htf_*` overlays now have displayable points for the same bounds.

#### Scenario: Late trace arrival at same render window shows HTF lines
- **GIVEN** chart render window bounds are already committed and `chartWindowSlice` initially sliced zero HTF aux points
- **AND** signal trace display apply merges `htf_fast` / `htf_anchor` / `htf_slow` into `auxEmaOverlays` for that window
- **WHEN** Workbench recomputes `chartWindowSlice` without a bounds change
- **THEN** sliced aux overlays include the new HTF point series
- **AND** chart hint includes `+N aux EMA (exit/HTF)` with `N >= 1`
- **AND** ChartPanel renders dashed HTF LineSeries

#### Scenario: Pan-back stabilize does not resurrect stale empty aux
- **GIVEN** user panned to window `[Ta, Tb]` with HTF visible from cache
- **WHEN** user pans back to the same `[Ta, Tb]` bounds without refetch
- **THEN** HTF aux overlays remain visible (not replaced by an earlier empty stabilized slice)

### Requirement: OpenSpec changes touching chart or signal trace MUST regression-check HTF context overlays
Any change proposal that modifies chart orchestration, window lifecycle, or signal trace display/cache flow MUST include explicit regression checks for HTF context overlays on a variant with `strategy.contexts`.

Minimum regression verification MUST cover:
1. Initial chart load with resolved context overlay reference and visible dashed HTF lines.
2. Chart hint includes `+N aux EMA (exit/HTF)` after trace loads (not only Bar Inspector HTF values).
3. Pan inside safe zone without overlay disappearance.
4. Edge-pan with deferred window commit (release/idle), then overlay continuity after commit.
5. Late trace arrival at unchanged render bounds updates HTF chart lines without viewport movement.

#### Scenario: Refactor task list contains HTF regression checks
- **WHEN** a refactor changes `WorkbenchContext`, chart panel orchestration, or trace scheduling
- **THEN** `tasks.md` includes manual HTF overlay verification for load, pan, deferred commit, and late trace arrival
- **AND** change is not considered complete until these checks pass
