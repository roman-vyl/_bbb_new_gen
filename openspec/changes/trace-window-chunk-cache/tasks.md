## 1. Signal trace display cache module (v1)

- [x] 1.1 Add `frontend/src/features/chart/signalTraceDisplayCache.ts` — cache key (`run_id:variant:context_overlay_ref`), coverage intervals, `coversRange`, `missingRange`, `mergeDisplayChunk`, slice helpers; **`computeChunkBoundsFromResponse`** from actual returned data (times, component_events, htf arrays) or verified response meta — **not** requested fetch bounds
- [x] 1.2 v1 merge/dedupe **display fields only**: `component_events`, `htf_context` (HTF EMA overlay build); extract from fetch response — do **not** merge `long`/`short`/lanes/diagnostics fields; component_events dedupe key: `(time, role, event_type, component_id, instance_id, side, span_id)` (+ `label` when needed)
- [x] 1.3 Add optional LRU cap (e.g. 10 chunks per cache key) to bound memory
- [x] 1.4 Add `signalTraceDisplayCache.test.ts` — display-field merge, coverage from **actual response bounds** (not requested), truncated-response partial coverage, missing range, pan-back slice hit, side-trace exclusion, component_events dedupe with `component_id` + `side`

## 2. Load policy and WorkbenchContext

- [x] 2.1 Evolve `decideSignalTraceLoad` — display-cache hit skips fetch **for chart events/HTF** when coverage sufficient; fetch on miss
- [x] 2.2 Add `signalTraceDisplayCacheRef` in WorkbenchContext; keep `signalTrace` for lanes/diagnostics (v1 dual model)
- [x] 2.3 On render window change: display-cache coverage check → slice-only or fetch+extract+merge; reset cache on run/variant/context ref change
- [x] 2.4 Remove primary reliance on `lastSlicedHtfOverlaysRef` / `lastSlicedComponentEventsRef` (display cache is source for chart layers)
- [x] 2.6 Implement truncation detection + chunk bounds helper: compare render-window `[fromSec,toSec]` to **actual** returned trace bounds (min/max of `times`, `component_events`, htf series) before `mergeDisplayChunk` / `coversRange`; coverage intervals MUST reflect returned range only

## 3. Chart display integration (events + HTF only)

- [x] 3.1 Wire `chartDisplayComponentEvents` to display-cache slice → render-window filter
- [x] 3.2 Wire HTF aux overlays (`auxOverlayFromHtfTrace`) to display-cache HTF slice for current render window
- [x] 3.3 Update stale flags: `htfAuxEmaOverlayStale` / `componentEventsStale` when render window not fully covered and fetch pending
- [x] 3.4 Extend tests for pan-back display from merged display cache
- [x] 3.5 **Do not** wire `SignalTimelineLanes` or trade diagnostics to display cache in v1 — verify no regression (still use per-window `signalTrace`)

## 4. BFF: raise limit to 50k + perf gate

- [x] 4.1 Raise `MAX_SIGNAL_TRACE_BARS` to ~50k on signal-trace window endpoint only (`research_api/services/signal_trace_service.py`); one fetch per render window
- [x] 4.2 **No silent truncation (frontend):** after fetch, detect requested vs returned time span; display cache `coversRange` uses **actual** returned interval only; stale/partial UI if truncated
- [x] 4.3 **Perf acceptance (required):** measure signal-trace fetch time + payload for ~50k render window on representative run; record in task notes or `debug/` — if not acceptable, rollback BFF limit and implement sub-chunk orchestration (do not ship truncated 5k as “full window”)
- [x] 4.4 BFF test: slice returns >5000 bars when window requests ~50k (after limit raise)

## 5. Manual verification

- [ ] 5.1 Pan render window within previously loaded trace range — events + HTF update instantly, no loading flicker
- [ ] 5.2 Pan into new uncached range — fetch starts, stale banner, then data appears; display cache merges
- [ ] 5.3 Pan back to earlier range — events + HTF from display cache without refetch (network tab)
- [ ] 5.4 Switch variant or context overlay ref — display cache resets, fresh fetch
- [ ] 5.5 **Verify HTF context EMA overlays** (`workbench-chart-htf-context-overlays`): variant with `strategy.contexts.htf_1` — pan across cached and uncached ranges; no permanent line loss
- [ ] 5.6 Signal timeline lanes + trade diagnostics still work after window pan (may refetch; acceptable v1)
- [ ] 5.7 **Truncation + perf gate:** 50k render window — response span matches request OR partial coverage UI (never false full cache); log fetch duration for perf acceptance decision

## 6. Unit tests (CI)

- [x] 6.1 Run `npm test` in `frontend/` for display cache, load policy, and chart display tests
