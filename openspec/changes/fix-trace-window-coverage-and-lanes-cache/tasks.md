## 1. BFF — signal trace `to_open_time_ms` exclusive end

- [ ] 1.1 Update `fetch_signal_trace_bundle` (or router) to resolve `to_open_time_ms` via `resolve_exclusive_to_ms` / `exclusive_end_for_report_to` using `report.timeframe`; keep explicit `to` param unchanged
- [ ] 1.2 Add pytest: request with `to_open_time_ms` equal to last candle open time returns `times` including that bar (50k or smaller fixture)
- [ ] 1.3 Run `pytest tests/test_research_api_signal_trace.py tests/test_ema_pullback_signal_trace.py -q`

## 2. Frontend — session bundle cache

- [ ] 2.1 Add `signalTraceBundleSessionCache.ts` with reset-by-identity, get/set by `chartWindowKey`, optional LRU cap (~16)
- [ ] 2.2 Unit tests: store/restore, invalidation on identity change, eviction
- [ ] 2.3 Wire cache in `WorkbenchContext`: store on fetch success; restore before fetch decision; reset with `traceDisplayCacheKey`
- [ ] 2.4 Evolve `decideSignalTraceLoad` (or pre-check in effect) for session hit → skip network; add `skip_session_cache_hit` or equivalent action
- [ ] 2.5 Update `signalTraceLoadPolicy.test.ts` for pan-back session hit and session miss + display cache hit paths

## 3. Frontend — display cache coverage verification

- [ ] 3.1 Manual or unit integration: after fetch for full 50k window, `displayCacheCoversWindow` is true and `isTraceResponseTruncated` is false when BFF returns last bar
- [ ] 3.2 Confirm `wb.trace_display.cache_hit` appears on pan-back when display cache covers (pipeline debug scenario)

## 4. Pipeline debug — shift marks split

- [ ] 4.1 Add `wb.render_window.shift_applied` and `wb.render_window.shift_noop` to `PIPELINE_DEBUG_STEPS`; remove or stop using legacy `wb.render_window.shift` timed wrapper on entire handler
- [ ] 4.2 Mark `shift_applied` only when `maybeShiftWindowForVisibleRange` returns new bounds; mark `shift_noop` on null
- [ ] 4.3 Add `wb.signal_trace.session_hit` mark on session cache restore
- [ ] 4.4 Update `debug/README.md` step id table (shift_applied / shift_noop / session_hit)

## 5. Regression verification

- [ ] 5.1 Verify HTF context EMA overlays on variant with `strategy.contexts` (workbench-chart-htf-context-overlays): lines render, no stale cross-window after pan-back
- [ ] 5.2 Run frontend tests: `npm test -- --run signalTraceLoadPolicy signalTraceDisplayCache signalTraceBundleSessionCache` (from `frontend/`)
- [ ] 5.3 Pipeline debug smoke: pan 7+ shifts on large run; expect `shift_applied` ≈ `pan.shift_requested`, `cache_hit` on revisit, no perpetual `truncated` for full window
