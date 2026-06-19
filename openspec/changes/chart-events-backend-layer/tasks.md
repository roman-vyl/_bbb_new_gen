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

- [ ] 3.1 Add `research_api/services/chart_events_service.py` with `CHART_EVENTS_BUNDLE_SCHEMA_VERSION = 1`
- [ ] 3.2 Implement `_cached_chart_events_key()` and `_CHART_EVENTS_CACHE` (FIFO max 32, separate from `_TRACE_CACHE`)
- [ ] 3.3 Implement `_project_display_bundle()` — strip lanes, consumption trace, internals; map HTF to `ChartEventsHtfContext`
- [ ] 3.4 Implement `fetch_chart_events_bundle()` — reuse trace compute on miss; `resolve_exclusive_to_ms` for window
- [ ] 3.5 Unit tests: projection field exclusion; cache key composition; duplicate fetch spy (compute once, not timing)
- [ ] 3.6 **STOP FOR REVIEW:** service + unit tests; wait for approval before Phase 4

## 4. Phase 4 — API endpoint + pytest

- [ ] 4.1 Add `GET /api/research/runs/{run_id}/chart-events` to `research_api/routers/research_runs.py`
- [ ] 4.2 Map errors: 400 (missing end), 422 (both `to` and `to_open_time_ms`, unsupported family), 404, 500
- [ ] 4.3 Add `tests/test_research_api_chart_events.py` — sparse shape, 50k parity vs signal-trace display fields, cache hit spy, conflict 422, overlay ref in key, `to_open_time_ms` exclusive end
- [ ] 4.4 Verify existing `tests/test_research_api_signal_trace.py` passes unchanged
- [ ] 4.5 **STOP FOR REVIEW:** endpoint + pytest green; deploy backend-only smoke; wait for approval before Phase 5

## 5. Phase 5 — Frontend integration (minimal swap)

- [ ] 5.1 Add `fetchChartEvents()` in `frontend/src/api/client.ts`
- [ ] 5.2 Add `buildChartEventsRequestKey` / `buildChartEventsUrlPath` in `signalTraceRequestCoordinator.ts`
- [ ] 5.3 Add `mergeDisplayChunkFromChartEvents()` (or adapter) in `signalTraceDisplayCache.ts`
- [ ] 5.4 Wire display fetch in `WorkbenchContext.tsx` behind `VITE_CHART_EVENTS_API=1`
- [ ] 5.5 Implement observable fallback: `wb.chart_events_fetch_fail`, `wb.chart_events_fallback`, `wb.chart_events_merge` with `source`
- [ ] 5.6 Lazy dense `/signal-trace` fetch for lanes/diagnostics (separate from display path)
- [ ] 5.7 Add client tests for chart-events query params and request key parity
- [ ] 5.8 **Verify HTF context EMA overlays** on variant with `strategy.contexts` (manual + distant trade navigation)
- [ ] 5.9 **STOP FOR REVIEW:** chart markers + HTF from chart-events; fallback debug visible; wait for approval before Phase 6

## 6. Phase 6 — Migration, acceptance, archive prep

- [ ] 6.1 Record chart-events vs signal-trace payload ratio in `debug/signal-trace-window-perf.md`
- [ ] 6.2 Acceptance: pan within cached range — zero chart-events network
- [ ] 6.3 Acceptance: pan to missing range — chart-events chunk fetch (not dense trace for display)
- [ ] 6.4 Acceptance: lanes / bar inspector / ChartTradeDiagnostics via signal-trace unchanged; bar inspector regime from dense `htf_context.state`
- [ ] 6.5 Acceptance: backend cache tests use call-count/key assertions only (no timing)
- [ ] 6.6 Acceptance: fallback scenario emits debug marks (not silent)
- [ ] 6.7 **STOP FOR REVIEW:** acceptance checklist complete; user approval to archive change

## Future work (out of scope — do not implement in this change)

- Disk materialization beside run artifacts
- Eager chart-events generation at backtest run time
- `build_chart_display_from_spec` skipping lane bool assembly (Phase 3b)
- Backend cooperative cancellation on client abort
- Post-commit idle prefetch for chart-events chunks
