## Why

Workbench Chart display (component markers and HTF context EMA overlays) still loads through dense `GET /api/research/runs/{run_id}/signal-trace`, which builds and serializes a full per-bar diagnostic trace (50k bool lanes, internals, context consumption) even though the chart only needs sparse events and HTF overlay points. Frontend PR1–PR5 (`optimize-workbench-chart-loading`) improved orchestration, display cache, and chunk scheduling, but the backend product for chart display remains the wrong shape — slow and oversized.

This change introduces a separate lightweight **chart-events** API so display and diagnostics become two distinct data products, as deferred PR6 in [`docs/research/24_workbench_chart_loading_roadmap.md`](../../../docs/research/24_workbench_chart_loading_roadmap.md).

## What Changes

- Add `GET /api/research/runs/{run_id}/chart-events` — sparse response for chart display: `component_events`, HTF EMA overlay series, bar grid (`times`), `meta`, and `coverage` metadata.
- Add backend **cache-on-demand** for chart-events (v1): first request computes via existing signal-trace pipeline and projects to sparse bundle; subsequent identical window requests serve cached artifact. No run-generation materialization in v1.
- Cache key includes **schema version** token; bump invalidates stale sparse entries.
- Reuse `resolve_exclusive_to_ms` window semantics; **`to` and `to_open_time_ms` are mutually exclusive** (422 if both).
- `ChartEventsHtfContext` excludes `state` — regime remains dense trace only.
- Keep `/signal-trace` **unchanged** for lanes, bar inspector, and diagnostics.
- Frontend Phase 5 (separate review gate): swap display fetch to chart-events behind `VITE_CHART_EVENTS_API`; observable fallback to signal-trace on failure (not silent).
- Six review-gated implementation phases with STOP after each slice.

**Non-goals:**

- No breaking changes to `/signal-trace` contract or existing consumers
- No trading/strategy semantics changes
- No frontend orchestration refactor beyond fetch-source swap and types
- No materialized chart-event chunks at backtest run generation in v1
- No mixing dense and sparse fields in one response

## Capabilities

### New Capabilities

- `research-api-chart-events`: BFF endpoint, contracts, cache-on-demand service, and acceptance tests for sparse chart display data.

### Modified Capabilities

- `workbench-trace-window-chunk-cache`: Display chunk network source becomes chart-events (when enabled); dense trace reserved for lanes/diagnostics.
- `workbench-chart-htf-context-overlays`: HTF EMA overlay points MAY be sourced from chart-events; regime `state` remains signal-trace only.
- `pipeline-debug-instrumentation`: Add chart-events fetch/merge/fallback debug events.

## Impact

**Affected layers:**

| Layer | Scope |
|-------|--------|
| `research_api/` | New `chart_events_service.py`, `contracts/chart_events.py`, router endpoint, tests |
| `research/` | Optional projection helper only; no strategy semantic changes |
| `frontend/` | Phase 5: `fetchChartEvents`, display cache adapter, coordinator keys, feature flag, observable fallback |

**Preserved contracts:** `/signal-trace`, `/api/market/*`, run report artifacts.

**Key modules:** `research_api/routers/research_runs.py`, `research_api/services/signal_trace_service.py` (unchanged behavior), `frontend/src/shared/context/WorkbenchContext.tsx`, `frontend/src/features/chart/signalTraceDisplayCache.ts`.

**Docs:** [`docs/research/24_workbench_chart_loading_roadmap.md`](../../../docs/research/24_workbench_chart_loading_roadmap.md) §PR6; perf baseline [`debug/signal-trace-window-perf.md`](../../../debug/signal-trace-window-perf.md).
