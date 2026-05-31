# Follow-up: WorkbenchContext decomposition

**Status:** Proposed (not started)  
**Parent:** Archived change `frontend-chart-architecture-refactor` (2026-05-31)  
**Reference map:** `openspec/changes/archive/2026-05-31-frontend-chart-architecture-refactor/implementation/ownership-map.md`

## Why

v1 chart cutover moved **orchestration decisions** into `frontend/src/features/chart/runtime/` (`RenderWindowController`, `ViewportController`, `traceDisplayOrchestrator`, `chartViewModel`). `WorkbenchContext.tsx` remains the shell for:

- run/report/variant/trade selection
- market bundle fetch + `marketDataCache` identity
- signal trace fetch/merge effects
- React state wiring for Chart, lanes, inspector, diagnostics

That keeps a large, high-churn module and makes chart-adjacent changes risky despite controller boundaries.

## Goal

Extract **data and IO** into focused modules/hooks while keeping `chartRuntime` the single orchestration entry for pan/viewport/trace policy. No behavior change in the first extraction slices.

## Non-goals

- Replacing Lightweight Charts or changing BFF contracts
- Moving research/signal semantics out of backend
- Big-bang rewrite in one PR

## Proposed slices (order)

### 1. `MarketDataStore` module

- Move `buildMarketCacheKey`, fetch effect, `marketCacheKey` / `intendedMarketCacheKey` sync, load status from `WorkbenchContext` into `features/chart/marketDataStore.ts` (or `hooks/useMarketDataStore.ts`).
- Expose: `{ cachedBundle, marketLoadStatus, marketError, intendedMarketCacheKey, reloadMarket }`.
- **Acceptance:** variant switch + cache hit/miss unchanged; per-variant cold fetch still one `fetchChartMarketBundle` (see known UX note below).

### 2. `RunDataController` / report selection

- Move run list, report load, variant key, trade selection, reload token into `features/workbench/runDataController.ts`.
- WorkbenchContext composes run + market + chart runtime.

### 3. Signal trace IO hook

- Move trace fetch effect, display cache merge, session bundle cache, `lanesSignalTrace` wiring into `features/chart/useSignalTraceWorkbench.ts`.
- Keep `traceDisplayOrchestrator` as policy; hook owns side effects.

### 4. Thin `WorkbenchProvider`

- Context value built from composed hooks; target **&lt; 400 lines** in provider file (types + composition only).

## Known UX (optional later, not blocking decomposition)

- **Per-variant market cache:** switching `instance_2` on a 600k+ bar run triggers a full `chart-bundle` fetch if that variant key is cold (15–60s). Optional follow-ups: prefetch all variants after report load, or split candle cache (symbol/range) from per-variant anchor EMA.

## Verification (each slice)

- `cd frontend && npm run build && npm test`
- Manual: heavy BTCUSDT 5m — pan deferred commit, HTF aux, variant switch anchor stack + HTF (see `workbench-chart-htf-context-overlays`, `workbench-chart-sliding-window`)
- `python -m pytest -q -m workbench_api` if BFF touched (usually unchanged)

## OpenSpec

When starting implementation, run `/opsx:propose "workbench-context-decomposition"` with delta specs only if contracts change (e.g. new public hook API for other features).
