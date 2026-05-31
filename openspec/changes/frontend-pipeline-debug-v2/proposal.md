## Why

After `workbench-chart-sliding-window` and `workbench-trace-window-chunk-cache`, the Workbench is functionally correct but UX feels slow—especially loading component events and HTF context EMA. Existing `pipeline-debug-instrumentation` (v1) times network calls and high-level policy marks only; it does not measure in-browser work: render-window slicing, display-cache hits/misses, pan-without-shift vs pan-with-shift, or ChartPanel `setData`/markers/viewport restore. Without those timings, we cannot tell whether slowness is fetch, React recompute, or lightweight-charts updates.

## What Changes

- **Extend** `frontend/src/shared/diagnostics/pipelineDebug.ts` with synchronous `dbgTimedSync` (true no-op when flag off; lazy `meta` factory), and richer `dbgFlush` (avg_ms).
- **Instrument WorkbenchContext** for: initial load chain (report → market → render window init), trade selection / render-window rebuild, pan shift request (with `shifted: true|false`), signal-trace display-cache merge/slice/coverage, and derived memo boundaries (`chartWindowSlice`, display overlays).
- **Instrument ChartPanel** for: candle/EMA `setData`, aux HTF `setData`, markers rebuild, viewport apply vs post-shift restore (with method from `restoreVisibleRangeAfterWindowShift`).
- **Stable step ids** under `wb.*` and `chart.*` prefixes; document a manual profiling script in `research/diagnostics/README.md` (or `debug/README.md`) mapping user actions → expected console lines.
- **Instrumentation at call sites only** — WorkbenchContext / ChartPanel wrappers; pure modules (`signalTraceDisplayCache`, `chartDataWindowManager`) stay debug-free unless call-site timing is insufficient.
- **Manual profiling only** — (1) Vite + debug flag, (2) browser Workbench, (3) UI scenario, (4) console flush/export, (5) save JSON to `debug/reports/`; optional auto-flush after signal trace / render-window shift when debug on.

**Non-goals**

- No Python/BFF changes; no production always-on logging.
- No performance fixes (caching, debounce tuning, virtualization)—only measurement.
- No React Profiler, `PerformanceObserver` long-task hook, or third-party APM (follow-up if sync times look fine but UX lags).
- No change to chart data, API payloads, or user-visible behavior when debug is off.

## Capabilities

### New Capabilities

_(none — extends existing capability)_

### Modified Capabilities

- `pipeline-debug-instrumentation`: Add requirements for frontend in-browser pipeline timings across load, trade select, pan, signal-trace display cache, and ChartPanel chart updates.

## Impact

| Layer | Scope |
|-------|--------|
| **frontend** | `shared/diagnostics/pipelineDebug.ts`, `shared/context/WorkbenchContext.tsx`, `features/chart/ChartPanel.tsx` (no changes inside pure cache/window utils unless exception documented) |
| **debug** | `README.md` manual workflow; operator-saved `reports/workbench-*.json` |
| **research** | README runbook section only |
| **research_api** | _none_ |
| **data_engine** | _none_ |

**References**: [`openspec/specs/pipeline-debug-instrumentation/spec.md`](../../specs/pipeline-debug-instrumentation/spec.md), [`openspec/specs/workbench-chart-sliding-window/`](../../specs/workbench-chart-sliding-window/) (archived behavior), trace display cache change `archive/2026-05-31-trace-window-chunk-cache`, [`docs/frontend/implementation_plan.md`](../../../docs/frontend/implementation_plan.md).
