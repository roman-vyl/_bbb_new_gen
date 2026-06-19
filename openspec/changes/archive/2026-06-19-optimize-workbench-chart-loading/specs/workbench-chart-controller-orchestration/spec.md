## ADDED Requirements

### Requirement: Shell state and chart data runtime have separate subscription boundaries
Workbench orchestration SHALL separate shell/report state from chart data runtime state so non-chart consumers do not subscribe to chart display revisions.

Shell-level state includes active tab, runs, selected run, report, selected variant, and selected trade. Chart data runtime state includes market load/cache, render window, trace display cache, signal trace load, auxiliary overlays, and viewport commands.

#### Scenario: Reports panel avoids chart display revision subscription
- **GIVEN** `displayApplyRevision` changes because trace display data was applied
- **WHEN** Reports UI is subscribed to Workbench state
- **THEN** Reports UI does not rerender solely because of `displayApplyRevision`

#### Scenario: Context bar avoids component event subscription
- **GIVEN** `chartDisplayComponentEvents` changes after a trace merge
- **WHEN** ContextBar renders run/variant controls
- **THEN** ContextBar does not rerender solely because component events changed

### Requirement: Context split preserves chart behavior
The WorkbenchContext split SHALL NOT change chart cache semantics, API contracts, render-window behavior, trace scheduling behavior, trade focus behavior, or HTF overlay sourcing in the refactor slice.

#### Scenario: Refactor keeps chart behavior stable
- **GIVEN** the context split PR is applied
- **WHEN** the user opens Chart, pans across a safe-zone boundary, and selects a distant trade
- **THEN** the same market, render-window, trace, viewport, and marker behavior remains observable as before the split
- **AND** no new prefetch or backend chunking behavior is introduced by that PR

### Requirement: ChartPanel receives chart-facing data and commands only
ChartPanel SHALL receive chart view model data, marker/display state, and viewport commands required for rendering, but it MUST NOT receive unrelated Workbench shell/report universe state.

#### Scenario: Renderer stays an imperative adapter
- **WHEN** ChartPanel renders candles, overlays, markers, and viewport commands
- **THEN** it does not own run/report loading policy
- **AND** it does not own trace fetch scheduling policy
