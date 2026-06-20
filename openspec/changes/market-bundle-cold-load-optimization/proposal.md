## Why

Workbench Chart cold open still fetches the **full report/run market range** via `fetchChartMarketBundle` (`/api/market/chart-bundle`), then slices locally to the ~50k-bar render window. After `chart-events-backend-layer`, this monolithic fetch is the dominant bottleneck — tens of seconds of latency and oversized payloads for data the chart never displays on first paint.

The frontend already has split `marketResourceCache` (candles vs overlays) and `runMarketView` identity. v1 replaces the monolithic network source with **independent windowed resources** — same maturity model as chart-events and signal-trace:

```text
candles-window  →  show chart immediately
ema-window      →  overlays arrive per period, progressively
chart-events    →  markers (unchanged)
signal-trace    →  lanes (unchanged)
```

## What Changes

**Interaction model shift:**

```text
Was:
  frontend → chart-bundle (full run) → backend holds 600k bars + all EMA → frontend slices 50k

Want:
  frontend → candles-window (50k around view) → chart renders
  frontend → ema-window per period (50, 200, 500) → overlays paint progressively
  backend → canonical full-series EMA cache (in-memory); returns window slice only
```

Implementation is **review-gated** (STOP after each phase; see `tasks.md`):

- **Phase 1 — Audit / baseline**: Document current monolithic flow; capture cold-open metrics. No runtime changes.
- **Phase 2 — Contracts only**: `CandlesWindowBundle`, `EmaWindowBundle` Pydantic + TS types; schema tests. No service, no router.
- **Phase 3 — Backend services**: `fetch_candles_window` + canonical EMA series cache + `fetch_ema_window`. No router.
- **Phase 4 — Endpoints**: `GET /api/market/candles-window` + `GET /api/market/ema-window` + HTTP tests.
- **Phase 5 — Frontend cache/planner**: Interval/chunk `marketResourceCache`, split planner (candles vs overlays), `marketCandlesReady` / `marketOverlaysReady`. No WorkbenchContext switch.
- **Phase 6 — Workbench integration**: Progressive candles-then-EMA load; distant trade; pan-outside-coverage. Chart-events/signal-trace unchanged.
- **Phase 7 — Perf / archive**: Compare baseline vs split-resource path; mark `/chart-bundle` legacy; archive.

**Non-goals (explicit OUT):**

- No changes to `chart-events-backend-layer` (archived) or `/chart-events` contract.
- No changes to `/signal-trace` or dense lanes policy.
- No strategy/trading semantics changes.
- No materialized chart-events chunks or persistent indicator DB in v1.
- No revival of legacy `marketDataCache.ts`.
- No wholesale `WorkbenchContext` rewrite.
- **No** returning warmup candles to frontend.
- **No** frontend EMA computation or `period + 5` warmup policy on frontend.
- **No** monolithic `chart-window` / `chart-bundle v2` that bundles candles + all EMA in one response.
- **No** blocking candle render until EMA overlays arrive.
- **No** mixing market loading with chart-events/signal-trace scheduling.

**Architectural rule:** Each data product loads, caches, and tracks coverage independently: candles, EMA overlays (BFF), chart-events, signal-trace.

## Capabilities

### New Capabilities

- `research-api-market-candles-window`: BFF windowed candles endpoint — display bounds, coverage metadata, contract tests.
- `research-api-market-ema-window`: BFF per-period EMA window endpoint — canonical full-series in-memory cache, window slice response, coverage metadata.
- `workbench-market-window-planner`: Frontend target-window resolution, split candles/overlay scheduling, progressive readiness, seeding into `marketResourceCache`.

### Modified Capabilities

- `workbench-chart-market-resource-cache`: Multi-interval chunk storage; seeding from `candles-window` and `ema-window` independently; split readiness semantics.
- `workbench-chart-sliding-window`: Pan/trade outside coverage triggers resource-specific window fetches; candles can render before overlays.
- `pipeline-debug-instrumentation`: Timings for `api.fetchCandlesWindow`, `api.fetchEmaWindow`, split readiness decisions, per-resource coverage hits/misses.

## Impact

- **Layers**: `research_api` (two endpoints, canonical EMA cache service, `market_reader`), `frontend` (split planner, split readiness, `api/client.ts`), `tests/`. `data_engine/` and `research/` unchanged.
- **Likely modules**:
  - `research_api/routers/market.py`, `research_api/contracts/chart.py`, `research_api/services/market_reader.py`, new `research_api/services/chart_ema_cache.py` (or equivalent)
  - `frontend/src/api/client.ts`, `frontend/src/features/chart/marketResourceCache.ts`, `frontend/src/features/chart/runMarketView.ts`, `marketWindowPlanner.ts`, `frontend/src/shared/context/WorkbenchContext.tsx`, `ChartPanel.tsx`
- **Preserved contracts**: `/chart-events`, `/signal-trace`, HTF context overlays from signal-trace (`workbench-chart-htf-context-overlays`).
- **Legacy**: `/api/market/chart-bundle` retained as fallback; frontend cold path stops using it after Phase 6.
- **Docs**: Baseline/comparison in `debug/reports/`; link `docs/frontend/implementation_plan.md`, `docs/research/24_workbench_chart_loading_roadmap.md`.
