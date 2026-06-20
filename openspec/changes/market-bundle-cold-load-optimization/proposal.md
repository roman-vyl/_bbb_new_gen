## Why

Workbench Chart cold open still fetches the **full report/run market range** via `fetchChartMarketBundle` (`/api/market/chart-bundle`), then slices locally to the ~50k-bar render window. After `chart-events-backend-layer`, this monolithic fetch is the dominant bottleneck — tens of seconds of latency and oversized payloads for data the chart never displays on first paint.

The frontend already has split `marketResourceCache` and `runMarketView` identity; the remaining gap is **network/source-of-data and window scheduling**. This change replaces full-range cold load with windowed backend reads (warmup + display) and frontend missing-range fetches, without touching chart-events or signal-trace contracts.

## What Changes

- **Audit / baseline (Phase 1)**: Document current flow `report → runMarketView → fetchChartMarketBundle (full range) → seed marketResourceCache → local slice`; capture cold-open duration, payload size, bar counts, and render-window size. No runtime changes.
- **Backend contract (Phase 2–3)**: Add `ChartMarketWindowBundle` model and `GET /api/market/chart-window` — accepts display bounds + EMA periods; reads `warmup_from_ms → display_to_ms` from DB; returns **only** display candles and display EMA points with warmup-calculated values; includes coverage metadata (requested/actual bounds, warmup bars used, truncation/missing).
- **Frontend window planner (Phase 4)**: New scheduler that resolves target render window (initial right-edge or trade-centered), checks `marketResourceCache` coverage, fetches missing windows via `/chart-window`, seeds split caches. Pan inside covered range: zero network. Pan or distant trade outside coverage: fetch next window/chunk.
- **Workbench integration (Phase 5)**: Cold open and distant-trade navigation use `/chart-window` instead of full `/chart-bundle`. Markers/chart-events and signal-trace lanes remain on their separate layers.
- **Perf / migration (Phase 6)**: Instrument `api.fetchChartMarketBundle` vs `api.fetchChartWindow` (duration, payload, bar count). Mark `/chart-bundle` legacy or keep as fallback. Verify no regression in EMA overlays, trade navigation, or HTF context overlays.

**Non-goals (explicit OUT):**

- No changes to `chart-events-backend-layer` (archived) or `/chart-events` contract.
- No changes to `/signal-trace` or dense lanes policy.
- No strategy/trading semantics changes.
- No materialized chart-events chunks.
- No overlay-only endpoint in v1 if window endpoint suffices.
- No revival of legacy `marketDataCache.ts`.
- No wholesale `WorkbenchContext` rewrite.

**Architectural rule:** Market layer (candles + anchor EMA overlays) stays separate from chart-events (markers/annotations) and signal-trace (dense diagnostic lanes).

## Capabilities

### New Capabilities

- `research-api-market-chart-window`: BFF windowed market endpoint — display bounds, EMA warmup semantics, coverage metadata, contract tests.
- `workbench-market-window-planner`: Frontend missing-range detection, chart-window fetch scheduling, and seeding into `marketResourceCache`.

### Modified Capabilities

- `workbench-chart-market-resource-cache`: Window-chunk cache identity and seeding from `/chart-window` responses; cold open no longer requires full-range bundle.
- `workbench-chart-sliding-window`: Pan and trade navigation outside cached coverage trigger window fetch; in-coverage pan remains zero-network slice from cache.
- `pipeline-debug-instrumentation`: Timings and counters for `api.fetchChartWindow`, window coverage hits/misses, payload size and bar counts alongside existing `api.fetchChartMarketBundle` marks.

## Impact

- **Layers**: `research_api` (new endpoint, contract, EMA warmup in `market_reader`), `frontend` (window planner, WorkbenchContext integration, `api/client.ts`), `tests/` (contract and integration tests). `data_engine/` and `research/` unchanged.
- **Likely modules**:
  - `research_api/routers/market.py`, `research_api/contracts/chart.py`, `research_api/services/market_reader.py`
  - `frontend/src/api/client.ts`, `frontend/src/features/chart/marketResourceCache.ts`, `frontend/src/features/chart/runMarketView.ts`, new `marketWindowPlanner.ts` (or equivalent), `frontend/src/shared/context/WorkbenchContext.tsx`
- **Preserved contracts**: `/api/research/runs/{run_id}/signal-trace`, `/api/research/runs/{run_id}/chart-events`, HTF context overlay sourcing (`workbench-chart-htf-context-overlays`).
- **Legacy**: `/api/market/chart-bundle` retained as fallback or marked deprecated after migration verification.
- **Docs**: Baseline in `debug/reports/` or change-local notes; link `docs/frontend/implementation_plan.md` Phase 5 market slice and `docs/research/24_workbench_chart_loading_roadmap.md` follow-on.
