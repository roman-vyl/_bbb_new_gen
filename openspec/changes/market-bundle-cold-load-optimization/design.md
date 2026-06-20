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

**Choice:** New service (e.g. `chart_ema_cache.py`) with **extendable** canonical series entries.

**Cache entry shape (per key):**

```text
key: (symbol, timeframe, period, origin_policy, market_data_identity)
entry:
  calculation_origin_ms    # canonical EMA seed start (earliest candle open used)
  coverage_to_ms           # last bar open time (or exclusive end) through which EMA is computed
  points[]                 # sorted IndicatorPoint[] for [origin .. coverage_to_ms)
```

`market_data_identity` MUST tie the cache to the current market DB/source (e.g. SQLite file path or mtime hash). Documented invalidation: entry discarded when market data identity changes (DB refresh/reload).

**First request** for a cache key when `requested_to_ms > coverage_to_ms` (or cache miss):

1. Resolve `calculation_origin_ms` — earliest available candle open for symbol/tf.
2. Read candles from `calculation_origin_ms` through at least `requested_to_ms` (exclusive end per market API parity).
3. Compute canonical EMA from origin through that range.
4. Store `calculation_origin_ms`, `coverage_to_ms`, sorted `points`.
5. Return **only** the requested window slice `[from_ms, to_ms)`.

**Later request** with `requested_to_ms` beyond current `coverage_to_ms`:

1. **Extend** — read candles from existing `coverage_to_ms` through new `requested_to_ms`; continue EMA recurrence from last cached EMA state and append points.
2. Update `coverage_to_ms`.
3. Return only requested window slice.

**Later request** within existing `coverage_to_ms`:

1. Slice cached `points` — `cache_hit=true`.
2. No recompute from display-window start.

**Response contract (v1):** `coverage.calculation_origin_ms` and `coverage.cache_hit` are **always present** in API responses (not debug-only).

**`cache_hit` semantics (strict):**

| Value | When |
|-------|------|
| `true` | Entire requested window `[from_ms, to_ms)` was satisfied by **slicing only** from existing canonical cache — no fresh compute, no extension |
| `false` | Fresh canonical compute (cache miss) **or** extension (`requested_to_ms > coverage_to_ms`) was required |

Extension and first compute are both `cache_hit=false`. Do not set `cache_hit=true` when any compute/extend work ran for this request.

**Read pattern (no hidden prefix double-read):**

| Path | DB reads |
|------|----------|
| Pure slice (`cache_hit=true`) | **None** |
| First miss | **One** `fetch_chart_bars(0, requested_to_ms)`; `origin_ms = bars[0]` |
| Extension | **One** `fetch_chart_bars(entry.coverage_to_ms, requested_to_ms)` only |

Extension and first-miss paths MUST NOT call `range_get(0, requested_to)` for origin discovery when cache entry already exists or when a single bars read suffices.

**Rejected:** Recompute from display-window start on each request. Recompute full series from origin on every window change when extension suffices. `cache_hit=true` after extension. Prefix `range_get(0, through_ms)` before extension branch.

**Trade-off:** First ema-window per period may compute a long series; extension amortizes distant-trade and pan-right navigation. Does not block candles.

### 2a. Data-edge behavior (candles-window and ema-window services)

When the requested window is **partially** or **fully** outside available market data, services MUST populate coverage honestly and return empty payload arrays when there is no overlap.

**Rules (both resources):**

- `coverage.requested_from_ms` / `coverage.requested_to_ms` — always echo resolved client request bounds.
- `coverage.actual_from_ms` / `coverage.actual_to_ms` — half-open bounds of data **actually returned** in `candles` / `points`.
- `coverage.truncated` — `true` when `actual` range ≠ `requested` range (partial clip) **or** when requested window has **no** overlapping bars (fully beyond edge).
- **No overlap / fully beyond:** `candles=[]` or `points=[]`, `actual_from_ms == actual_to_ms` (empty half-open interval), `truncated=true`.
- **Partial overlap:** return only overlapping bars/points; `actual_*` reflects returned subset; `truncated=true`.

Services MUST NOT fabricate bars/points outside DB range. HTTP 200 with empty payload is valid for out-of-range windows (same as clipped edge semantics).

**EMA-specific:** when window has no overlapping bars, return `points=[]` with `cache_hit=false` (no slice served) unless a prior in-range cache entry exists and the empty result is because requested window is wholly past `coverage_to_ms` with no data — still `cache_hit=false` if extend would be needed but no candles exist.

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

- **EMA cache eviction:** LRU per cache key when many symbols/periods visited — policy in Phase 3.
- **Parallel vs sequential overlay fetches:** Default parallel for fast/anchor/slow in v1?
- **Max intervals per frontend cache key:** `MAX_CHUNKS_PER_KEY` like trace cache.
- **market_data_identity:** Exact field (db path + mtime vs content hash) — finalize in Phase 2 contracts.
