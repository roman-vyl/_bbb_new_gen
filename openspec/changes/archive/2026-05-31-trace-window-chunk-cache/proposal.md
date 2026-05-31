## Why

Sliding render window (`workbench-chart-sliding-window`) made candle pan seamless from `cachedBundle.candles`, but **component events** and **HTF context EMA** still follow a single-window signal-trace model: each render-window shift triggers a new trace fetch keyed to `[first, last]`, with stale/frozen display in between. Pan back to a previously visited range re-fetches instead of re-slicing from memory — unlike candles.

Trace is heavier than OHLCV and depends on `run + variant + context_overlay_ref`; loading an entire 646k-bar run upfront is unacceptable. A **chunk cache** model — analogous to candles' full cache + render-window slice — gives seamless pan within loaded history without a monolithic full-trace fetch.

## What Changes

- Introduce **`SignalTraceDisplayCache`** (frontend, v1): keyed by `run_id + variant + context_overlay_ref`; accumulates **display-only** trace chunks — `component_events`, `htf_context` (for HTF EMA overlays), and coverage intervals derived from **actual returned trace bounds** (not requested fetch window). **Not** a full trace cache.
- On render-window shift:
  1. Check whether display cache **covers** new `[firstTime, lastTime]`
  2. If yes → slice events/HTF from cache **immediately** (no fetch)
  3. If no → fetch trace for the **missing/current window** only; extract display fields into cache; then slice for display
- Replace `signalTrace` single-window + `loadedTraceWindowKey` exact-match model with cache-aware load policy (`decideSignalTraceLoad` evolution).
- Display pipeline: **display cache source → render-window slice → ChartPanel** (same pattern as `chartRenderWindowDisplay` for candles).
- **v1 out of cache scope:** `long`/`short` side trace internals, `SignalTimelineLanes`, trade diagnostics trace reads — these keep the existing per-window `signalTrace` fetch model until a later change.
- Retain stale/loading UX when chunk not yet available; remove incorrect reliance on frozen refs from a **previous** window as primary data source.
- BFF v1: raise `MAX_SIGNAL_TRACE_BARS` to ~50k (window endpoint only), measure fetch perf in acceptance; sub-chunk fallback only if perf fails — **no silent truncation**.

## Capabilities

### New Capabilities

- `workbench-trace-window-chunk-cache`: Display-only chunk cache for component events + HTF context EMA; coverage check, fetch-on-miss, render-window slice; pan-in-cache instant behavior.

### Modified Capabilities

- `workbench-chart-sliding-window`: Trace loading decoupled from exact `chartWindowKey` match; render-window slice reads from trace chunk cache when covered.
- `workbench-chart-component-event-markers`: Component events sourced from accumulated trace cache, sliced to current render window; pan back within cached range shows events without refetch.
- `workbench-chart-htf-context-overlays`: HTF context EMA sourced from accumulated trace cache chunks; pan back within cached range restores lines from cache slice.

## Impact

**Layers:** `frontend/` (primary), `research_api/` (chunk size / cache contract review only — no full-run trace API).

**Frontend modules likely touched:**

- New: `frontend/src/features/chart/signalTraceDisplayCache.ts` (+ tests)
- Evolve: `frontend/src/shared/context/signalTraceLoadPolicy.ts`, `WorkbenchContext.tsx`
- Integrate: `frontend/src/features/chart/chartRenderWindowDisplay.ts`, `strategySpecAuxEma.ts` (HTF from display cache)
- **Unchanged in v1:** `SignalTimelineLanes.tsx`, trade diagnostics — continue reading latest per-window `signalTrace` response

**Reference:** `openspec/specs/workbench-chart-sliding-window/spec.md`, `docs/frontend/implementation_plan.md` (Phase 5 signal trace).

**Non-goals:**

- Fetch signal trace for entire report range (e.g. 646k bars) in one request
- Browser-side HTF EMA or component-event computation
- Changing signal trace payload schema (`component_events`, `htf_context` contract)
- Merging full `long`/`short` side trace into display cache (v2)
- Caching signal timeline lanes or trade diagnostics trace reads in v1
- Parquet/disk persistence of trace cache (in-memory session cache only for v1)
