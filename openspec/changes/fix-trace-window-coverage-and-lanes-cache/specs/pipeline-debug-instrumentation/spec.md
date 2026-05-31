## MODIFIED Requirements

### Requirement: Frontend in-browser Workbench phases are timed when debug is enabled

When `VITE_EMA_PIPELINE_DEBUG` is `"true"`, the Workbench SHALL record durations (via `dbgTimed`, `dbgTimedSync`, or equivalent) for synchronous pipeline steps and SHALL accumulate `count`, `total_ms`, and `max_ms` per stable step id in the shared frontend debug stats map.

The following phases MUST be measurable (each maps to a documented step id in `research/diagnostics/README.md` or `debug/README.md`):

1. Initial load: run report, market bundle ready, render-window initialization.
2. Trade selection: render-window rebuild or skip around selected trade entry.
3. Pan inside safe zone: pan handler runs without render-window shift.
4. Pan with render-window shift: **`wb.render_window.shift_applied`** when bounds change; **`wb.render_window.shift_noop`** when handler runs but bounds unchanged; slice recomputed and viewport restore scheduled on applied only.
5. Signal trace: fetch (existing `api.fetchSignalTrace`), display-cache hit vs miss, session-cache hit, chunk merge, slice events and slice HTF for current render window.
6. ChartPanel: candle `setData`, anchor EMA `setData`, aux HTF `setData`, markers rebuild, viewport apply, viewport restore after shift.

Render-window shift handler invocations MUST NOT increment a single ambiguous counter that includes noops (legacy `wb.render_window.shift`).

#### Scenario: Report and market load produce timed steps

- **WHEN** debug is enabled and the user opens a run with Chart tab until market candles are available
- **THEN** the debug stats map includes entries for report/market readiness and render-window initialization with non-zero `count` after the flow completes

#### Scenario: Trade select records rebuild or skip

- **WHEN** debug is enabled and the user selects a trade from Reports
- **THEN** the console or flush table includes `wb.render_window.trade_select` with metadata indicating whether the render window was rebuilt or skipped

#### Scenario: Pan without shift is visible

- **WHEN** debug is enabled and the user pans the chart while the visible logical range stays inside the render-window safe zone
- **THEN** a debounced pan mark such as `wb.pan.no_shift` records that no render-window shift occurred, and raw visible-range subscription events are not logged as timed spans

#### Scenario: Pan with shift is visible

- **WHEN** debug is enabled and the user pans past the safe zone so `maybeShiftWindowForVisibleRange` changes window bounds
- **THEN** the debug output includes **`wb.render_window.shift_applied`** (count matches actual bounds changes, paired with `wb.pan.shift_requested`)
- **AND** chart viewport restore timing includes restore `method` metadata when applicable

#### Scenario: Render-window shift noop is visible

- **WHEN** debug is enabled and the debounced pan handler invokes `onRenderWindowShiftRequest` but `maybeShiftWindowForVisibleRange` returns null
- **THEN** the debug output includes **`wb.render_window.shift_noop`**
- **AND** **`wb.render_window.shift_applied`** is not incremented for that invocation

## ADDED Requirements

### Requirement: Signal trace session cache hit is distinguishable in debug

When `VITE_EMA_PIPELINE_DEBUG` is `"true"`, Workbench SHALL emit **`wb.signal_trace.session_hit`** when lanes/diagnostics bundle is restored from `SignalTraceBundleSessionCache` without network fetch.

#### Scenario: Pan back session hit skips fetch

- **GIVEN** session cache holds bundle for current `chartWindowKey`
- **WHEN** render window changes to that key
- **THEN** debug output includes `wb.signal_trace.session_hit`
- **AND** no new `api.fetchSignalTrace` timed entry starts for that window
