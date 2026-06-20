## Context

**Current flow (monolithic):**

```text
frontend:  fetchChartMarketBundle(full report range)
backend:   candles + fast/anchor/slow EMA for ~600k bars
frontend:  seed caches → slice 50k render window locally
```

**Target flow (split resources):**

```text
frontend:  plan target window (~50k around view / trade)
           candles missing? → GET /api/market/candles-window
           candles ready → ChartPanel renders OHLC (marketCandlesReady)
           overlay missing per period? → GET /api/market/ema-window (one period each)
           overlays arrive → EMA lines paint progressively (marketOverlaysReady)

backend candles-window:
  range_get for requested window only → return candles + coverage

backend ema-window (origin_policy=canonical):
  first request for (symbol, tf, period):
    read candles from calculation_origin_ms
    compute full canonical EMA series once → in-memory cache
    return requested window slice only
  subsequent requests:
    slice cached series → return window only
```

`marketResourceCache.ts` already separates candles and overlays. This change aligns **network scheduling and readiness** with that split — no second cache layer, no monolithic bundle v2.

**Constraints:**

- EMA computed only in BFF; frontend never sees warmup bars or computes EMA.
- Chart-events and signal-trace remain separate coordinators.
- HTF context overlays from signal-trace, not BFF ema-window — verify per `workbench-chart-htf-context-overlays`.
- Multi-interval chunk coverage (tail 2026 + distant trade 2017) — gaps not loaded.

**Reference docs:** `docs/frontend/implementation_plan.md`, `docs/research/24_workbench_chart_loading_roadmap.md`, `openspec/specs/workbench-chart-market-resource-cache/spec.md`.

## Goals / Non-Goals

**Goals:**

- Cold open fetches **candles-window** for initial display bounds only — chart visible before EMA.
- EMA overlays load via **per-period ema-window** requests; paint progressively as each arrives.
- Backend canonical EMA cache ensures values consistent across windows without frontend warmup knowledge.
- Distant trade and pan-outside-coverage fetch only missing resource windows.
- Split readiness: `marketCandlesReady` vs `marketOverlaysReady`.
- Instrument old monolithic path vs new split-resource path.

**Non-Goals:**

- Persistent indicator DB or materialized EMA storage.
- Frontend EMA computation or warmup candle delivery.
- Monolithic `chart-window` / `chart-bundle v2`.
- Blocking candles on EMA arrival.
- Coupling market fetches to chart-events/signal-trace.
- Changing `/chart-events`, `/signal-trace`, strategy semantics, `data_engine/`.

## Decisions

### 1. Split endpoints (not monolithic chart-window)

**Choice:**

| Endpoint | Returns |
|----------|---------|
| `GET /api/market/candles-window` | Candles + coverage only |
| `GET /api/market/ema-window` | EMA points for one `period` + coverage + `calculation_origin_ms` |

**Rationale:** Matches split `marketResourceCache`, enables progressive render, avoids shipping 3 EMA series when only candles are needed for first paint. Same architectural pattern as chart-events vs signal-trace separation.

**Rejected:** Single `chart-window` returning candles + all EMA — monolithic bundle under new name; blocks candles on slowest EMA.

### 2. Canonical on-demand EMA cache (backend in-memory)

**Choice:** New service (e.g. `chart_ema_cache.py`) keyed by `(symbol, timeframe, period, origin_policy)`. On cache miss:

1. Resolve `calculation_origin_ms` — earliest available candle open for symbol/tf (canonical origin).
2. `range_get` from origin through window end.
3. `compute_chart_overlay_ema` on full series.
4. Store full `IndicatorPoint[]` in process memory.
5. Return slice `[from_ms, to_ms)`.

On cache hit: slice only. Response includes `coverage.cache_hit`.

**Rationale:** Frontend unaware of warmup; EMA exact and consistent between windows; first EMA500 request may compute full series but does not block candles and does not JSON-serialize 600k points.

**Trade-off:** First ema-window per period pays full-series compute cost once. Acceptable — non-blocking, backend-only, amortized across window navigations.

**Rejected:** Per-request `period + 5` warmup read — frontend-adjacent contract complexity; still recomputes on every new distant window without canonical consistency guarantee.

### 3. Frontend interval/chunk cache (unchanged model)

Multi-interval chunk storage per resource identity with union `coversRange` / `missingRange` / `sliceForRange` — see prior design revision. Candles and overlays tracked independently.

### 4. Split readiness and progressive render

**Choice:**

```text
marketCandlesReady(bounds): union candle intervals cover bounds
marketOverlaysReady(bounds, periods[]): each required overlay interval covers bounds

ChartPanel:
  candles setData when marketCandlesReady
  each EMA setData when that overlay interval ready (may be staggered)
```

WorkbenchContext (or chart runtime) MUST NOT gate candle `setData` on overlay readiness.

**Rationale:** User sees OHLC immediately; EMA lines appear as overlays complete — matches desired UX.

### 5. `marketWindowPlanner` — split scheduling

**Choice:** Planner owns:

- `resolveTargetDisplayWindow(...)`
- `planCandlesWindowFetch(view, bounds)` → `candles-window` if `missingRange` for candles
- `planEmaWindowFetches(view, bounds, overlayRefs)` → list of per-period `ema-window` fetches for missing overlay intervals
- `seedCandlesWindow` / `seedEmaWindow` — merge into respective cache chunk lists
- Separate in-flight dedupe keys per resource type and period

**Integration:** WorkbenchContext market load effect schedules candles first, then overlay fetches in parallel (or staggered). Render-window commit re-plans per resource.

### 6. Pan behavior

Pan inside covering interval → zero network slice. Pan outside union coverage → `candles-window` and/or `ema-window` for `missingRange` per resource. Returning to cached interval → zero network.

### 7. Legacy `/chart-bundle`

Keep for fallback/debug; mark legacy after Phase 6. Frontend cold path stops using it.

### 8. Instrumentation

- `api.fetchCandlesWindow`, `api.fetchEmaWindow` (per period)
- `wb.market_candles_decision`, `wb.market_ema_decision` (or unified with `resourceKind` field)
- Split readiness transitions: `marketCandlesReady`, `marketOverlaysReady`

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| First EMA period request slow (full-series compute) | Non-blocking — candles already visible; parallel fetches for fast/anchor/slow; cache_hit on subsequent windows |
| Backend memory for full EMA series | One series per (symbol, tf, period) in BFF process; bounded by active symbols; eviction policy TBD |
| Staggered overlay paint flicker | Acceptable v1; optional batch UI hint "loading overlays" |
| EMA mismatch vs legacy chart-bundle | Contract test: ema-window slice vs chart-bundle at same bar times |
| Split fetch coordination complexity | Isolate in `marketWindowPlanner`; separate in-flight keys |
| HTF overlay regression | Phase 6 verification task |

## Migration Plan

Review-gated (see `tasks.md`):

1. Baseline (monolithic chart-bundle metrics)
2. Contracts (`CandlesWindowBundle`, `EmaWindowBundle`)
3. Services (`fetch_candles_window`, canonical EMA cache + `fetch_ema_window`)
4. Endpoints (two routes)
5. Frontend cache/planner + split readiness (no Workbench switch)
6. Workbench integration
7. Perf / archive

**Rollback:** Revert WorkbenchContext to `fetchChartMarketBundle`; new endpoints additive.

## Open Questions

- **EMA cache eviction:** LRU per `(symbol, tf, period)` when many variants/symbols visited — policy in Phase 3.
- **Parallel vs sequential overlay fetches:** Default parallel for fast/anchor/slow in v1?
- **Max intervals per frontend cache key:** `MAX_CHUNKS_PER_KEY` like trace cache.
