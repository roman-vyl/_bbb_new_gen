## 1. BFF — signal trace `to_open_time_ms` exclusive end

- [ ] 1.1 Update `fetch_signal_trace_bundle` (or router) to resolve `to_open_time_ms` via `resolve_exclusive_to_ms` / `exclusive_end_for_report_to` using `report.timeframe`; keep explicit `to` param unchanged
- [ ] 1.2 **BFF exclusive-end acceptance test** (`pytest`): request exactly 50 000 `5m` bars via `from` + `to_open_time_ms`
  - `len(response.times) == 50_000`
  - `response.times[0] == T_first` (seconds)
  - `response.times[-1] == T_last` (seconds)
- [ ] 1.3 **Frontend display-cache merge acceptance** (unit/integration): after merging BFF response for that window, `coversRange(T_first, T_last)` is true
- [ ] 1.4 Run `pytest tests/test_research_api_signal_trace.py tests/test_ema_pullback_signal_trace.py -q`

## 2. Frontend — session bundle cache

- [ ] 2.1 Add `signalTraceBundleSessionCache.ts` with fixed constant **`MAX_SESSION_TRACE_BUNDLES_PER_KEY = 10`**, get/set by `chartWindowKey`, LRU eviction at cap
- [ ] 2.2 **Session cache cap acceptance test**: store 11 distinct `chartWindowKey` entries → oldest evicted; current key remains retrievable; pan-back to evicted key misses and refetches
- [ ] 2.3 **Session cache invalidation**: reset on `selectedRunId`, `selectedVariantKey`, `effectiveContextOverlayRef`, `reloadToken` / report reload identity, and `marketCacheKey` / `intendedMarketCacheKey`
- [ ] 2.4 **Stale-cache acceptance test**: after `reloadToken` changes (same `selectedRunId`), prior session bundle MUST NOT be restored — network fetch or empty state, not stale lanes data
- [ ] 2.5 Wire cache in `WorkbenchContext`: store on fetch success; restore before fetch decision; wire resets in same effects as display cache / market reload
- [ ] 2.6 Evolve `decideSignalTraceLoad` (or pre-check in effect) for session hit → skip network; add `skip_session_cache_hit` or equivalent action
- [ ] 2.7 Update `signalTraceLoadPolicy.test.ts` for pan-back session hit, session miss, LRU eviction, and reset-on-`reloadToken` paths

## 3. Frontend — display cache coverage verification

- [ ] 3.1 After fetch for full 50k window: `displayCacheCoversWindow` is true, `len(times)==50_000`, `isTraceResponseTruncated` is false
- [ ] 3.2 Confirm `wb.trace_display.cache_hit` appears on pan-back when display cache covers (pipeline debug scenario)

## 4. Pipeline debug — shift marks split

- [ ] 4.1 Add `wb.render_window.shift_applied` and `wb.render_window.shift_noop` to `PIPELINE_DEBUG_STEPS`; **remove** legacy `wb.render_window.shift` from `PIPELINE_DEBUG_STEPS` and stop emitting it
- [ ] 4.2 Mark `shift_applied` only when `maybeShiftWindowForVisibleRange` returns new bounds; mark `shift_noop` on null
- [ ] 4.3 Add `wb.signal_trace.session_hit` mark on session cache restore
- [ ] 4.4 Update `debug/README.md` step id table (shift_applied / shift_noop / session_hit; drop legacy shift)
- [ ] 4.5 **Debug acceptance** (manual pipeline debug smoke or unit test on export):
  - legacy `wb.render_window.shift` is **not** present in flush export
  - `wb.render_window.shift_applied` count ≈ actual bounds changes (≈ `wb.pan.shift_requested`, ≈ `chart.setData.candles` window updates minus initial)
  - `wb.render_window.shift_noop` increments separately from `shift_applied`

## 5. Regression verification

- [ ] 5.1 Verify HTF context EMA overlays on variant with `strategy.contexts` (workbench-chart-htf-context-overlays): lines render, no stale cross-window after pan-back
- [ ] 5.2 Run frontend tests: `npm test -- --run signalTraceLoadPolicy signalTraceDisplayCache signalTraceBundleSessionCache` (from `frontend/`)
- [ ] 5.3 Pipeline debug smoke on large run: pan 7+ shifts; expect `cache_hit` on revisit, no perpetual `truncated` for full window
- [ ] 5.4 After run reload (`reloadToken` bump): confirm session cache empty and trace refetches (no stale bundle for same run id)
