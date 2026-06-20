Review-gated implementation: **STOP after each phase** and wait for user approval before starting the next. Do not batch phases.

## 1. Phase 1 — Audit / baseline (no runtime changes)

- [x] 1.1 Document monolithic flow: `fetchChartMarketBundle (full range) → seed → slice 50k` in `debug/reports/market-bundle-cold-load-baseline.md`
- [x] 1.2 Capture baseline with `VITE_EMA_PIPELINE_DEBUG=true`: cold-open duration, chart-bundle bar/EMA counts, payload estimate, time until candles visible vs overlays visible
- [x] 1.3 Note entry points: `WorkbenchContext.tsx`, `runMarketView.ts`, `marketResourceCache.ts`, `research_api/routers/market.py`
- [x] 1.4 **STOP FOR REVIEW:** publish baseline doc and measurements; wait for user approval before Phase 2

## 2. Phase 2 — Backend contracts only (no service, no router)

- [x] 2.1 Add `CandlesWindowBundle` + coverage to `research_api/contracts/chart.py`
- [x] 2.2 Add `EmaWindowBundle` + coverage (`calculation_origin_ms`, `coverage_to_ms`, `cache_hit` always present) to `research_api/contracts/chart.py`
- [x] 2.3 Add matching TypeScript types in `frontend/src/api/types.ts`
- [x] 2.4 Add contract/schema tests only (Pydantic shape, TS parity) — no `market_reader` / EMA cache implementation
- [x] 2.5 **STOP FOR REVIEW:** confirm split contracts (candles-only, ema-only, no bundled window); wait for approval before Phase 3

## 3. Phase 3 — Backend services (no router)

**Prerequisite:** EMA canonical cache semantics in `design.md` §2–§2a and delta specs (extendable entry, `coverage_to_ms`, market data identity, **data-edge coverage**, **strict cache_hit**).

- [x] 3.1 Implement `fetch_candles_window` in `research_api/services/market_reader.py` — display window only; honest `actual_*` / `truncated`; empty `candles` when no overlap
- [x] 3.2 Implement canonical EMA cache: entry stores `calculation_origin_ms`, `coverage_to_ms`, sorted points; key includes market data identity
- [x] 3.3 Implement `fetch_ema_window`: compute/extend vs pure slice; `cache_hit=true` only on pure slice; empty `points` + edge coverage when no overlap
- [x] 3.4 Service tests: candles partial/full edge (empty array, `actual_from_ms == actual_to_ms`); ema extension (`cache_hit=false`); pure slice (`cache_hit=true`); parity vs chart-bundle; invalidation on market data identity change
- [x] 3.5 **STOP FOR REVIEW:** report EMA extension/parity, edge coverage, and cache_hit semantics; wait for approval before Phase 4

## 4. Phase 4 — Backend endpoints

- [x] 4.1 Add `GET /api/market/candles-window` to `research_api/routers/market.py`
- [x] 4.2 Add `GET /api/market/ema-window` with `period`, `origin_policy=canonical`
- [x] 4.3 HTTP integration tests for both endpoints (200 shape, 400 validation, 503 missing DB)
- [x] 4.4 Verify neither endpoint returns full run range when display window is a subset
- [x] 4.5 **STOP FOR REVIEW:** demonstrate both endpoints via pytest/curl; wait for approval before Phase 5

## 5. Phase 5 — Frontend cache / planner (no WorkbenchContext switch yet)

- [x] 5.1 Extend `marketResourceCache.ts`: interval/chunk storage, union `coversRange`/`missingRange`/`sliceForRange` per candles and per overlay
- [x] 5.2 Split readiness helpers: `marketCandlesReady`, `marketOverlaysReady`
- [x] 5.3 Add `fetchCandlesWindow` and `fetchEmaWindow` to `frontend/src/api/client.ts` with `dbgTimed`
- [x] 5.4 Create `marketWindowPlanner.ts`: `resolveTargetDisplayWindow`, `planCandlesWindowFetch`, `planEmaWindowFetches` (per period), `seedCandlesWindow`/`seedEmaWindow`, split in-flight dedupe
- [x] 5.5 Unit tests: dual-interval candles; independent overlay intervals; candles-ready before overlays-ready; distant-trade gap not loaded
- [x] 5.6 Add `wb.market_candles_decision` / `wb.market_ema_decision` debug marks
- [x] 5.7 **STOP FOR REVIEW:** report split planner tests and progressive readiness behavior; wait for approval before Phase 6

## 6. Phase 6 — Workbench integration

- [x] 6.1 Replace cold-path `fetchChartMarketBundle` with split planner: candles-window first, ema-window per period
- [x] 6.2 ChartPanel/runtime: candle `setData` on `marketCandlesReady`; per-overlay `setData` as each ema-window arrives — do not block candles on EMA
- [x] 6.3 Distant trade + pan-outside-coverage: resource-specific `missingRange` fetches
- [x] 6.4 Ensure chart-events and signal-trace scheduling unchanged
- [x] 6.5 Update tests: cold open must not call `fetchChartMarketBundle`; candles render before overlays in integration tests where applicable
- [x] 6.6 Verify HTF context EMA overlays (`workbench-chart-htf-context-overlays`) on variant with `strategy.contexts`
- [ ] 6.7 **STOP FOR REVIEW:** manual pass — cold open shows candles before EMA; distant trade; pan across interval; **window stability** (no feedback loop on EMA arrival)
- [x] 6.8 Fix intent-driven target window stability (split candles vs overlay revision; render window foundation key)

## 7. Phase 7 — Perf / migration / archive

- [ ] 7.1 Document comparison in `debug/reports/market-bundle-cold-load-comparison.md`: time-to-candles vs time-to-overlays, per-resource payload, chart-bundle baseline
- [ ] 7.2 Manual Workbench verification (screenshots per `.cursor/rules/workbench-chart-screenshots.mdc`)
- [ ] 7.3 Mark `/api/market/chart-bundle` legacy; confirm frontend cold path uses split endpoints only
- [ ] 7.4 Confirm no regression: anchor EMA values, trade markers/chart-events, signal-trace lanes
- [ ] 7.5 **STOP FOR REVIEW:** publish perf comparison; wait for approval before archive
- [ ] 7.6 Archive via `/opsx:archive`
