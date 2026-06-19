## 1. Phase 1 — Audit / current contract

- [x] 1.1 Confirm audit table in `design.md` §Current State matches live code (`signal_trace_service.py`, `WorkbenchContext.tsx`, `signalTraceDisplayCache.ts`)
- [x] 1.2 Add chart-events column placeholder to `debug/signal-trace-window-perf.md`
- [x] 1.3 **STOP FOR REVIEW:** report audit complete; wait for approval before Phase 2

## 2. Phase 2 — Sparse response model (contracts + types)

- [x] 2.1 Add `research_api/contracts/chart_events.py` — `ChartEventsBundle`, `ChartEventsCoverage`, `ChartEventsHtfContext` (no `state`)
- [x] 2.2 Add `ChartEventsBundle` TypeScript type in `frontend/src/api/types.ts`
- [x] 2.3 Unit test cache key helper shape includes `schema_version`, `exclusive_end_ms`, `context_overlay_ref`
- [x] 2.4 **STOP FOR REVIEW:** contracts reviewed; wait for approval before Phase 3

## 3. Phase 3 — Backend cache-on-demand service

- [x] 3.1 Add `research_api/services/chart_events_service.py` (import `CHART_EVENTS_BUNDLE_SCHEMA_VERSION`, `MAX_CHART_EVENTS_BARS` from contract)
- [x] 3.2 Implement `_CHART_EVENTS_CACHE` + `cached_chart_events_key` from contract (FIFO max 32, separate from `_TRACE_CACHE`)
- [x] 3.3 Implement `_project_display_bundle()` — strip lanes, consumption trace, internals; map HTF to `ChartEventsHtfContext`
- [x] 3.4 Implement `fetch_chart_events_bundle()` — reuse `fetch_signal_trace_bundle` on miss; `resolve_exclusive_to_ms` for cache key
- [x] 3.5 Unit tests: projection field exclusion; cache key composition; duplicate fetch spy (compute once, not timing)
- [x] 3.6 **STOP FOR REVIEW:** service + unit tests; wait for approval before Phase 4

## 4. Phase 4 — API endpoint + pytest

- [x] 4.1 Add `GET /api/research/runs/{run_id}/chart-events` to `research_api/routers/research_runs.py`
- [x] 4.2 Map errors: 400 (missing end), 422 (both `to` and `to_open_time_ms`, unsupported family), 404, 500
- [x] 4.3 Add `tests/test_research_api_chart_events.py` — sparse shape, 50k parity vs signal-trace display fields, cache hit spy, conflict 422, overlay ref in key, `to_open_time_ms` exclusive end
- [x] 4.4 Verify existing `tests/test_research_api_signal_trace.py` passes unchanged
- [x] 4.5 **STOP FOR REVIEW:** endpoint + pytest green; deploy backend-only smoke; wait for approval before Phase 5

## 5A. Phase 5A — Frontend display swap (lanes lifecycle unchanged)

Scope: change **display fetch source only**. Do not refactor lanes, bar inspector, or dense trace lifecycle.

- [x] 5A.1 Add `fetchChartEvents()` in `frontend/src/api/client.ts`
- [x] 5A.2 Add `buildChartEventsRequestKey` / `buildChartEventsUrlPath` in `signalTraceRequestCoordinator.ts`
- [x] 5A.3 Add `mergeDisplayChunkFromChartEvents()` in `signalTraceDisplayCache.ts`
- [x] 5A.4 Wire **display** fetch in `WorkbenchContext.tsx` behind `VITE_CHART_EVENTS_API=1` (chart-events → display cache merge)
- [x] 5A.5 Observable fallback/debug: `wb.chart_events_fetch_fail`, `wb.chart_events_fallback`, `wb.chart_events_merge` with `source`
- [x] 5A.6 Add client tests for chart-events query params and request key parity
- [x] 5A.7 **Keep lanes path unchanged:** existing `fetchSignalTrace` + `setSignalTrace` + session cache behavior stays as today (interim double-fetch when flag on is OK)
- [x] 5A.7b **Display commit decoupled:** after chart-events merge → `markMerged` + `displayApplyRevision` + `finalizeTraceDisplayUpdate` before dense trace; lanes failure must not rollback display
- [x] 5A.7c **Minimal seam extract:** `workbenchTraceNetworkLoad.ts` (`loadDisplayTraceChunk`, `loadDenseLanesTrace`, `mergeDisplayFromDenseFallback`); single orchestration flow in `WorkbenchContext`
- [ ] 5A.8 **Verify HTF context EMA overlays** on variant with `strategy.contexts` (manual + distant trade navigation)
- [ ] 5A.9 **STOP FOR REVIEW:** markers + HTF from chart-events; lanes/inspector still work via unchanged dense path; fallback debug visible; seam extract reviewed; wait for approval before 5B

## 5B. Phase 5B — Lazy dense trace for lanes (only after 5A approved)

Scope: separate dense `/signal-trace` lifecycle from display fetch. **Do not start until 5A review passes.**

- [ ] 5B.1 Lazy `fetchSignalTrace` for lanes/diagnostics when window key requires dense bundle (not on every display chunk fetch)
- [ ] 5B.2 Remove redundant signal-trace fetch when chart-events already satisfied display and lanes restored from session cache
- [ ] 5B.3 Verify lanes, bar inspector, `ChartTradeDiagnostics` unchanged; bar inspector regime from dense `htf_context.state`
- [ ] 5B.4 **STOP FOR REVIEW:** no double-fetch on common display-only path; wait for approval before Phase 6

## 6. Phase 6 — Migration, acceptance, archive prep

- [ ] 6.1 Record chart-events vs signal-trace payload ratio in `debug/signal-trace-window-perf.md`
- [ ] 6.2 Acceptance: pan within cached range — zero chart-events network
- [ ] 6.3 Acceptance: pan to missing range — chart-events chunk fetch (not dense trace for display)
- [ ] 6.4 Acceptance: lanes / bar inspector / ChartTradeDiagnostics via signal-trace (after 5B); bar inspector regime from dense `htf_context.state`
- [ ] 6.5 Acceptance: backend cache tests use call-count/key assertions only (no timing)
- [ ] 6.6 Acceptance: fallback scenario emits debug marks (not silent)
- [ ] 6.7 **STOP FOR REVIEW:** acceptance checklist complete; user approval to archive change

## Future work (out of scope — do not implement in this change)

- Disk materialization beside run artifacts
- Eager chart-events generation at backtest run time
- `build_chart_display_from_spec` skipping lane bool assembly (Phase 3b)
- Backend cooperative cancellation on client abort
- Post-commit idle prefetch for chart-events chunks
