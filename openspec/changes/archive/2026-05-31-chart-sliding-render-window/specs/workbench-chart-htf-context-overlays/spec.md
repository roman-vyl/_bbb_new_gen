## MODIFIED Requirements

### Requirement: HTF aux overlays survive trace reload and window pan

While `signalTraceStatus` is `loading` or `error`, Workbench MUST NOT strip existing `htf_*` aux overlays (avoid flicker). When the trace window key changes before the new trace arrives, Workbench MAY show a stale banner (`htfAuxEmaOverlayStale`) and freeze last sliced HTF overlay points until `traceMatchesWindow`.

Clearing all aux overlays (`setAuxEmaOverlays([])`) MUST NOT run when HTF specs exist but BFF exit-EMA specs are empty — HTF-only variants still render context lines.

HTF aux overlay points MUST be sliced to the **current render window** (same bounds as `chartCandles`). When the sliding render window shifts on pan, HTF overlay series MUST receive points filtered to the new window until fresh trace data arrives.

#### Scenario: Pan chart retains HTF lines during trace reload

- **GIVEN** HTF context EMA lines visible for the current render window
- **WHEN** user pans the chart and the render window shifts, starting signal trace reload
- **THEN** previous HTF lines remain visible until replaced or stale banner explains lag
- **AND** lines update when the new trace reaches `ready` with matching `chartWindowKey` for the **new render window bounds**

#### Scenario: HTF overlay slice follows render window shift

- **GIVEN** HTF context EMA lines sliced to render window `[T0, T1]`
- **WHEN** pan shifts the render window to `[T0', T1']` before trace reload completes
- **THEN** displayed HTF overlay points are sliced to `[T0', T1']` (or frozen stale slice aligned to new bounds per existing stale rules)
- **AND** HTF lines do not retain points from the pre-shift window outside the new bounds
