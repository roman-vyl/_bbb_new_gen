# Signal trace window perf (trace-window-chunk-cache)

Acceptance gate for `MAX_SIGNAL_TRACE_BARS = 50_000` on the windowed signal-trace endpoint.

Change: [`openspec/changes/chart-events-backend-layer`](../openspec/changes/chart-events-backend-layer/).

## How to measure (live Workbench)

1. Start Workbench (`research_api` + `frontend` dev server).
2. For chart-events smoke: create **local** `frontend/.env.local` with `VITE_CHART_EVENTS_API=1` (do not commit); restart Vite.
3. Open a representative run (e.g. `ema_pullback` BTCUSDT 5m) with HTF context overlay.
4. Pan until render window is ~50k bars (market bundle cached).
5. In DevTools → Network, note `signal-trace` vs `chart-events` for the render window:
   - **Duration** (ms)
   - **Response size** (KB)
6. Record live duration in the table below if it differs from the synthetic benchmark.

## Payload benchmark (Phase 6.1)

Synthetic 50k-bar window (`tests/test_chart_events_service.py::test_chart_events_payload_ratio_at_representative_window`):

| Metric | signal-trace (dense) | chart-events (sparse) | Budget | Pass |
|--------|----------------------|------------------------|--------|------|
| Payload size (KB, JSON) | 8250 | 1886 | sparse < dense | ✓ |
| Payload ratio (dense / sparse) | — | — | ≥ 3× | **4.37×** ✓ |
| Response span vs request | full window | full window | full window | ✓ |
| Fetch duration (ms, live) | TBD | TBD | TBD after live measure | — |

Sparse projection drops `long`/`short` lanes, `context_consumption_trace`, and `htf_context.state` while preserving display fields (`component_events`, HTF EMA series, `times`, `meta`).

Re-run benchmark:

```bash
python -m pytest tests/test_chart_events_service.py::test_chart_events_payload_ratio_at_representative_window -v
```

If live duration or payload is unacceptable, rollback BFF limit and implement frontend sub-chunk orchestration (see `openspec/changes/trace-window-chunk-cache/tasks.md` §4.3).

## Phase 6 acceptance checklist

| ID | Criterion | Evidence | Status |
|----|-----------|----------|--------|
| 6.2 | Pan within cached display range → **zero** `/chart-events` network | `planMissingTraceDisplayChunkFetch` returns `null` on full cache hit (`traceDisplayChunkScheduling.test.ts`); coordinator `cache_hit` skip (`signalTraceRequestCoordinator.test.ts`); pan with coverage allowed (`traceDisplayOrchestrator.test.ts`) | ✓ |
| 6.3 | Pan to missing range → **chart-events** chunk fetch for display (not dense trace for display) | Partial coverage plans missing chunk (`traceDisplayChunkScheduling.test.ts`); display path uses `fetchChartEvents` + `mergeDisplayChunkFromChartEvents` (`workbenchTraceNetworkLoad.test.ts`, `chartEventsDisplayLoad.test.tsx`); dense fetch is lanes-only after 5B (`decideDenseLanesNetworkLoad` → `skip` when `lanes_ready`) | ✓ |
| 6.4 | Lanes / bar inspector / trade diagnostics via **dense** `/signal-trace`; bar inspector regime from `htf_context.state` | `loadDenseLanesTrace` → `setSignalTrace` (full bundle); chart-events HTF omits `state` (`test_research_api_chart_events.py`); bar inspector reads `signalTrace.htf_context.state` (`ChartBarInspector.tsx`); lanes skip when ready after chart-events commit (`chartEventsDisplayLoad.test.tsx` lazy dense) | ✓ |
| 6.5 | Backend cache tests use **call-count / key** assertions only (no timing) | `test_chart_events_endpoint_cache_hit_calls_trace_once`, `test_fetch_chart_events_bundle_cache_hit_calls_trace_once`, `test_chart_events_cache_key_includes_context_overlay_ref` | ✓ |
| 6.6 | Chart-events failure → **observable** fallback debug (not silent) | `wb.chart_events_fetch_fail` + `wb.chart_events_fallback` in `loadDisplayTraceChunk` (`workbenchTraceNetworkLoad.test.ts` Phase 6.6); dense fallback merge emits `wb.chart_events_merge` with `source: signal-trace-fallback` | ✓ |

Manual smoke (5B.2 / 5B.3): distant trade entry marker after deferred chart-events; lanes error preserved on policy skip.

## Notes

- Frontend records `wb.signal_trace_merge` with `truncated: true/false` when pipeline debug is enabled.
- Display cache coverage uses **actual returned bounds** only — truncated responses must not mark the full 50k window as covered.
- **Stale error on pan (§5.8):** after trace fails on window B, pan to cached window A — banner/lanes must show loading (not B's error) until fetch for A completes.
