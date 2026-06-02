# Pipeline debug instrumentation

Opt-in step counters and timings for the ema_pullback research path and Workbench network loads. Enable with `EMA_PIPELINE_DEBUG` (Python) and `VITE_EMA_PIPELINE_DEBUG=true` (frontend). CLI: `debug/run-pipeline-debug.bat`.

### Requirement: Pipeline debug is opt-in with zero overhead when disabled

The system MUST NOT record pipeline timings, increment step counters, or write debug output unless the layer-specific debug flag is enabled (`EMA_PIPELINE_DEBUG` for Python, `VITE_EMA_PIPELINE_DEBUG` for the Workbench frontend build).

#### Scenario: Python helpers no-op without env

- **WHEN** `EMA_PIPELINE_DEBUG` is unset or not truthy
- **THEN** `dbg_span`, `dbg_mark`, and `dbg_flush` return immediately without mutating global counters or printing to stderr

#### Scenario: Frontend helpers no-op without env

- **WHEN** `VITE_EMA_PIPELINE_DEBUG` is not `"true"`
- **THEN** `dbgMark`, `dbgTimed`, and `dbgFlush` do not log to the console and do not update internal counters

### Requirement: Python pipeline trace emits per-root stderr summary

When `EMA_PIPELINE_DEBUG` is enabled, the research diagnostics module SHALL accumulate per-step `count`, `total_ms`, and `max_ms` within a `dbg_root` scope and SHALL print a formatted table to stderr on root exit via `dbg_flush`.

#### Scenario: Repeated step is labeled REPEAT

- **WHEN** the same step id is recorded more than once before `dbg_flush` for the current root
- **THEN** the stderr table line for that step is prefixed with `REPEAT`

#### Scenario: CLI runner exercises backtest path

- **WHEN** `python research/diagnostics/run_pipeline_debug.py` is executed with `EMA_PIPELINE_DEBUG=1` and a valid temp or file config
- **THEN** stderr includes a `PIPELINE_DEBUG` table for root `bff.backtest` listing at least `bff.backtest.run` and config-load steps

### Requirement: Signal trace coordinator decisions are visible in pipeline debug

When `VITE_EMA_PIPELINE_DEBUG` is `"true"`, Workbench SHALL emit **`wb.signal_trace_decision`** and **`wb.signal_trace.fetch_start`** (or equivalent fetch-start mark) with metadata sufficient to prove coordinator ownership and multi-instance behavior.

Each decision mark MUST include at least:

- `traceRequestKey`
- `decisionReason` (`fetch`, `cache_hit`, `in_flight`, `already_merged`, `failed_same_key`, `superseded`, or policy gate reason when blocked before coordinator)
- `skipReason` when action is skip
- `cacheCoverage` (`hit` | `miss`) from synchronous `coversRange` read
- `requestedFrom` / `requestedTo` (committed ms or sec bounds used for fetch)
- `coverageFrom` / `coverageTo` when available from display cache
- `inFlightKey` or `inFlightKeysCount`
- `mergedKeysHit` (`true` | `false`)
- `failedKeysHit` (`true` | `false`)
- `effectTriggerReason` when known (primitive dep label)
- `selectedStrategyInstanceId` **only** as display meta, documented as not part of `traceRequestKey` unless BFF uses it as query param

#### Scenario: After merge next decision is already_merged

- **GIVEN** debug enabled and first fetch for `K1` merged successfully
- **WHEN** the operator flushes pipeline debug after the orchestration effect runs again with same fetch parameters
- **THEN** the latest `wb.signal_trace_decision` for `K1` shows `decisionReason` `already_merged` or `cache_hit`
- **AND** `api.fetchSignalTrace` count for `K1` is at most 1

#### Scenario: Second instance same key shows coordinator skip

- **GIVEN** debug enabled and fetch for `K1` already merged
- **WHEN** user switches strategy instance without changing fetch parameters
- **THEN** `wb.signal_trace_decision` shows skip with `already_merged` or `cache_hit`
- **AND** `selectedStrategyInstanceId` in meta differs from prior mark while `traceRequestKey` is unchanged
- **AND** no new `api.fetchSignalTrace` row appears for `K1`

### Requirement: Frontend pipeline debug traces Workbench network and load policy

When `VITE_EMA_PIPELINE_DEBUG` is `"true"`, the Workbench SHALL record timings for backtest and primary GET helpers, SHALL log signal-trace **coordinator and policy gate** decisions separately, and SHALL record in-browser Workbench and Chart pipeline timings as specified in the added requirements for load, trade select, pan, display cache, and chart updates.

#### Scenario: API backtest is timed

- **WHEN** the user runs backtest from Composer with debug enabled
- **THEN** the browser console includes a `[pipeline] api.runBacktest` entry with duration metadata

#### Scenario: Signal trace skip is visible

- **WHEN** signal trace load is skipped because coordinator reports `already_merged` for the current `traceRequestKey`
- **THEN** the console includes `wb.signal_trace_decision` with `decisionReason` equal to `already_merged` (or `cache_hit` / `in_flight`)
- **AND** no new timed `api.fetchSignalTrace` entry starts for that key

#### Scenario: Developer can flush browser summary

- **WHEN** debug is enabled and `window.__pipelineDebugFlush()` is called
- **THEN** the console prints a grouped table of accumulated frontend step counts and timings

#### Scenario: In-browser steps appear alongside API timings

- **WHEN** debug is enabled and the user completes a chart interaction that triggers render-window slicing
- **THEN** the flush table lists both `api.*` network steps (if any) and `wb.*` / `chart.*` in-browser steps in the same summary

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

### Requirement: Signal trace session cache hit is distinguishable in debug

When `VITE_EMA_PIPELINE_DEBUG` is `"true"`, Workbench SHALL emit **`wb.signal_trace.session_hit`** when lanes/diagnostics bundle is restored from `SignalTraceBundleSessionCache` without network fetch.

#### Scenario: Pan back session hit skips fetch

- **GIVEN** session cache holds bundle for current `chartWindowKey`
- **WHEN** render window changes to that key
- **THEN** debug output includes `wb.signal_trace.session_hit`
- **AND** no new `api.fetchSignalTrace` timed entry starts for that window

### Requirement: Signal trace display cache hit and miss are distinguishable

When `VITE_EMA_PIPELINE_DEBUG` is `"true"`, signal-trace display-cache usage SHALL emit debug marks or timed steps that distinguish display cache covers current render window (hit) versus display cache partial miss.

Network fetch authorization MUST be reflected in `wb.signal_trace_decision` coordinator fields, not inferred solely from `wb.trace_display.cache_miss`.

#### Scenario: Display cache miss without network refetch is visible

- **WHEN** display cache does not cover the full window but coordinator skips fetch with `already_merged`
- **THEN** debug may include `wb.trace_display.cache_miss`
- **AND** `wb.signal_trace_decision` shows `decisionReason` `already_merged`
- **AND** `api.fetchSignalTrace` count does not increase for that `traceRequestKey`

#### Scenario: Display cache miss triggers fetch and merge

- **WHEN** the render window is not covered and coordinator authorizes `fetch`
- **THEN** debug output includes cache-miss visibility, `wb.signal_trace.fetch_start` with `traceRequestKey`, `wb.trace_display.merge_chunk` timing, and slice timings for events and HTF context for the active window

### Requirement: ChartPanel chart library updates are timed separately from Workbench slicing

When `VITE_EMA_PIPELINE_DEBUG` is `"true"`, ChartPanel SHALL time lightweight-charts update work separately from WorkbenchContext slice/memo steps so operators can compare `wb.chart_window_slice` vs `chart.setData.*` vs `chart.markers.rebuild`.

#### Scenario: setData and markers appear in flush summary

- **WHEN** debug is enabled, chart candles are shown, and `window.__pipelineDebugFlush()` is called after the chart has painted at least once
- **THEN** the flush table includes `chart.setData.candles` and `chart.markers.rebuild` rows when those code paths ran

#### Scenario: Aux HTF setData is identifiable

- **WHEN** debug is enabled and HTF context aux overlays are rendered on the chart
- **THEN** the flush table includes `chart.setData.aux_htf` with overlay count metadata from the last run

### Requirement: Debug helpers impose no work when the frontend debug flag is off

When `VITE_EMA_PIPELINE_DEBUG` is not `"true"`, `dbgTimedSync` and extended call sites MUST NOT invoke `performance.now()`, console logging, stats updates, or eager construction of expensive metadata objects.

#### Scenario: Sync helper short-circuits before timing

- **WHEN** debug is disabled and application code calls `dbgTimedSync` with a lazy meta factory
- **THEN** only the wrapped function runs and the meta factory is not invoked

### Requirement: Pipeline debug instrumentation stays at call sites in Workbench and Chart layers

When `VITE_EMA_PIPELINE_DEBUG` is `"true"`, synchronous pipeline timings for display-cache and render-window utilities SHALL be recorded by wrapping calls from `WorkbenchContext` or `ChartPanel`. Pure utility modules such as `signalTraceDisplayCache` and `chartDataWindowManager` MUST NOT import pipeline debug helpers unless a documented exception proves call-site wrapping is insufficient.

#### Scenario: Display cache merge is timed from Context

- **WHEN** debug is enabled and `mergeDisplayChunk` runs after a signal-trace fetch
- **THEN** `wb.trace_display.merge_chunk` appears in debug stats without adding debug imports inside `signalTraceDisplayCache.ts`

### Requirement: Pan debug uses debounced decisions only

When `VITE_EMA_PIPELINE_DEBUG` is `"true"`, pan-related debug output MUST be limited to debounced handler outcomes: programmatic suppress, no shift, shift requested, and confirmed render-window shift in Context. The system MUST NOT emit a timed span or mark on every raw `subscribeVisibleLogicalRangeChange` callback.

#### Scenario: Programmatic viewport suppress is visible

- **WHEN** debug is enabled and pan is suppressed because viewport apply or restore is in progress
- **THEN** debug output includes `wb.pan.suppressed_programmatic` and does not increment pan timing for that callback generation

### Requirement: Workbench debug export supports manual profiling artifacts

The frontend debug module SHALL expose `window.__pipelineDebugExport()` returning serializable rows with `step`, `count`, `total_ms`, `avg_ms`, `max_ms`, and optional `last_meta` per step.

Documentation in `debug/README.md` SHALL describe saving export JSON under `debug/reports/` after `__pipelineDebugFlush(label)` for named scenarios (load-chart, trade-select, pan-shift, trace-loaded).

#### Scenario: Export includes last_meta for diagnosis

- **WHEN** debug is enabled and the operator calls `window.__pipelineDebugExport()` after a timed step with metadata
- **THEN** the row for that step includes `last_meta` with the most recent metadata fields (e.g. barCount, action, shifted)

#### Scenario: Manual artifacts live beside Python logs

- **WHEN** the operator saves Workbench export JSON under `debug/reports/`
- **THEN** those files coexist with `pipeline_*.log` from `run-pipeline-debug.bat` without requiring automation

### Requirement: Manual flush remains available for ad-hoc profiling

When `VITE_EMA_PIPELINE_DEBUG` is `"true"`, `window.__pipelineDebugFlush()` SHALL still print a grouped summary table in DevTools. Optional auto-flush after render-window shift MAY run only in debug mode with debounce between 1000ms and 1500ms.

#### Scenario: Pan-shift session in DevTools

- **WHEN** debug is enabled and the operator calls `window.__pipelineDebugFlush()` after a render-window shift
- **THEN** the console shows a grouped table of render-window and chart steps

### Requirement: Diagnostics do not change research outputs

Pipeline debug instrumentation MUST NOT alter backtest metrics, trade records, report JSON shape, or API response bodies compared to the same run with debug disabled.

#### Scenario: Backtest metrics unchanged

- **WHEN** a strategy spec is run with debug off versus debug on (only env differs)
- **THEN** variant trade counts and total PnL in the result payload are identical
