## Context

Workbench Chart uses a 50k sliding render window (`chartDataWindowManager`) and a display-only `SignalTraceDisplayCache` for component events and HTF EMA overlays. Full `SignalTraceBundle` (including `long`/`short` for lanes and diagnostics) is fetched per `chartWindowKey`.

**Observed failure (May 2026 debug session):**

| Symptom | Cause |
|---------|--------|
| `truncated: true`, actual `toSec` 300s before requested | Signal trace passes `to_open_time_ms` directly to half-open `TimeWindow`; market API adds `+ timeframe_ms` |
| 13× `cache_miss`, 0× `cache_hit` | `coversRange(last)` false when chunk ends one bar early |
| 10× `fetchSignalTrace` ~44s | Every new window + pan-back lanes refetch (no bundle session cache) |
| `wb.render_window.shift: 120` vs `pan.shift_requested: 7` | `dbgTimedSync` wraps entire handler, counts noops |

Market bundle and signal trace share the frontend param `to_open_time_ms = lastCandle.time * 1000`. Market resolves exclusive end in `resolve_exclusive_to_ms`; signal trace does not.

## Goals / Non-Goals

**Goals:**

- Signal trace response includes the last render-window candle when frontend sends `to_open_time_ms`.
- After first fetch of a 50k window, `displayCacheCoversWindow` is true for that window's time bounds.
- Pan-back to a previously fetched `chartWindowKey` restores lanes/diagnostics from session memory without `api.fetchSignalTrace`.
- Pipeline debug distinguishes applied render-window shifts from noops.

**Non-goals:**

- Reduce BFF compute time for first-time window loads
- Replace display cache with full-run trace preload
- Change `MAX_SIGNAL_TRACE_BARS` or sub-window chunking strategy
- Optimize `chart.setData` cost (~1s/shift)

## Decisions

### D1 — BFF: reuse `resolve_exclusive_to_ms` for signal trace

**Choice:** In `fetch_signal_trace_bundle` (after `load_run_report`), when the router passes `to_open_time_ms`, resolve `end_ms = exclusive_end_for_report_to(to_open_time_ms, report.timeframe)` before `parse_time_range_ms` and OHLCV load.

**Alternatives considered:**

| Option | Rejected because |
|--------|------------------|
| Frontend sends `toOpenTimeMs + barMs` | Duplicates timeframe logic in browser; market API already standardizes on `to_open_time_ms` |
| Frontend `coversRange` tolerance of 1 bar | Masks real truncation; doesn't fix lanes missing last bar |
| Change slice to half-open `[from, to)` | Breaks inclusive bar grid contract in `SignalTraceBundle.times` |

**Rationale:** Aligns with `market_reader.resolve_exclusive_to_ms` and existing market endpoint tests.

### D2 — Lanes bundle session cache (frontend)

**Choice:** New module `signalTraceBundleSessionCache.ts` — `Map<chartWindowKey, SignalTraceBundle>` scoped by cache identity. On successful fetch, store bundle. Before starting fetch, if session cache has `chartWindowKey`, restore `signalTrace`, `loadedSignalTraceWindowKey`, status `ready`.

**Cap:** `MAX_SESSION_TRACE_BUNDLES_PER_KEY = 10` (fixed constant, matches display cache `MAX_CHUNKS_PER_KEY`). LRU evict oldest on insert when full.

**Invalidation (required, not optional):** Reset all bundles when any of:

- `traceDisplayCacheKey` inputs change (`selectedRunId`, `selectedVariantKey`, `effectiveContextOverlayRef`)
- `reloadToken` changes (report reload / Workbench refresh)
- `marketCacheKey` or `intendedMarketCacheKey` changes (chart candle bundle identity)

Wire invalidation in the same `WorkbenchContext` effects that reset display cache or reload market data — do not rely on run/variant/context alone.

**Alternatives considered:**

| Option | Rejected because |
|--------|------------------|
| Extend display cache to store long/short | Violates v1 display-only scope; large memory per chunk |
| Rely on BFF `_TRACE_CACHE` only | Pan-back still pays network + JSON parse; BFF key is ms bounds not chartWindowKey |
| Always refetch lanes (status quo) | 44s pan-back UX; spec intent was "instant chart layers", lanes should match when data exists |

**Rationale:** Session cache satisfies dual model: lanes show correct window data without stale cross-window state, without network when revisiting.

### D3 — Load policy evolution

**Choice:** Add `skip_session_cache_hit` (or treat as extension of skip path) in `decideSignalTraceLoad` when session cache holds bundle for `chartWindowKey`. Display cache hit + session hit → no fetch. Display cache hit + session miss → fetch once, then both caches populated.

Update MODIFIED spec scenario "Pan back refetches lanes trace" → restore from session cache when bundle exists; network refetch only on session miss.

### D4 — Debug marks split

**Choice:**

| Step id | When |
|---------|------|
| `wb.render_window.shift_applied` | `maybeShiftWindowForVisibleRange` returned new bounds; `bumpRenderWindow` runs |
| `wb.render_window.shift_noop` | Handler invoked but bounds unchanged |
| `wb.pan.shift_requested` | Unchanged — debounced pan called Context shift handler |

Remove `dbgTimedSync` wrapper on entire handler (was inflating count). Optionally time only `shift_applied` path.

Deprecate `wb.render_window.shift` — replace references in `debug/README.md` and pipeline-debug spec.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Session cache memory for many pan shifts | Fixed cap `MAX_SESSION_TRACE_BUNDLES_PER_KEY = 10`; LRU eviction |
| BFF cache key uses ms bounds; exclusive end change invalidates old cache entries | Acceptable — dev/staging only; production cache is in-process |
| HTF overlay regression | Manual verify on variant with `strategy.contexts` (required task) |

## Migration Plan

1. Ship BFF fix + test first (coverage fix unblocks display cache).
2. Ship session cache + policy (pan-back UX).
3. Ship debug mark split (no product behavior change).
4. Verify with `VITE_EMA_PIPELINE_DEBUG=true`: expect `cache_hit`, `shift_applied` count ≈ `pan.shift_requested`, no `truncated` for full 50k window.

Rollback: revert BFF exclusive-end change independently; frontend caches are additive.

## Resolved decisions (formerly open questions)

- Session cache LRU cap: **`MAX_SESSION_TRACE_BUNDLES_PER_KEY = 10`** (matches display cache chunk cap).
- Emit `wb.signal_trace.session_hit` debug mark: **yes**, alongside existing cache_hit/miss.
