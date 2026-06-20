## 1. Phase 1 — Audit / baseline (no runtime changes)

- [ ] 1.1 Trace and document current flow: `report → runMarketView → fetchChartMarketBundle (full range) → seed marketResourceCache → local slice` in `debug/reports/market-bundle-cold-load-baseline.md`
- [ ] 1.2 Capture baseline with `VITE_EMA_PIPELINE_DEBUG=true`: cold-open duration, `api.fetchChartMarketBundle` bar count, payload estimate, EMA points count, initial render-window size
- [ ] 1.3 Note entry points in `WorkbenchContext.tsx`, `runMarketView.ts`, `marketResourceCache.ts`, `research_api/routers/market.py` for Phase 2+ handoff

## 2. Phase 2 — Backend chart-window contract

- [ ] 2.1 Add `ChartMarketWindowCoverage` and `ChartMarketWindowBundle` to `research_api/contracts/chart.py` (mirror `ChartMarketBundle` + coverage fields per design)
- [ ] 2.2 Add matching TypeScript types in `frontend/src/api/types.ts`
- [ ] 2.3 Implement `fetch_chart_market_window` in `research_api/services/market_reader.py` with warmup read + display-only filter (no router yet)
- [ ] 2.4 Add contract tests in `tests/test_research_api_market.py`: display-only candles, warmup metadata, EMA parity vs full-range, truncation at data edge, invalid stack order

## 3. Phase 3 — Backend endpoint

- [ ] 3.1 Add `GET /api/market/chart-window` to `research_api/routers/market.py` with query params: `display_from`, `display_to` / `display_to_open_time_ms`, EMA periods, optional `warmup_bars`
- [ ] 3.2 Wire router to `fetch_chart_market_window`; ensure `resolve_exclusive_to_ms` parity with existing market endpoints
- [ ] 3.3 Add HTTP integration tests for chart-window endpoint (200 shape, 400 validation, 503 missing DB)
- [ ] 3.4 Verify endpoint does not read/return full run range when display window is a subset

## 4. Phase 4 — Frontend scheduler / cache integration

- [ ] 4.1 Extend `marketResourceCache.ts` with span storage, `mergeCandlesSpan`, `mergeOverlaySpan`, `coversRange`, `missingRange` (pattern from `signalTraceDisplayCache.ts`)
- [ ] 4.2 Update `runMarketView.ts` readiness checks to use span coverage for current display bounds instead of full-range key presence
- [ ] 4.3 Add `fetchChartWindow` to `frontend/src/api/client.ts` with `dbgTimed("api.fetchChartWindow", ...)`
- [ ] 4.4 Create `frontend/src/features/chart/marketWindowPlanner.ts`: `resolveTargetDisplayWindow`, `planMarketWindowFetch`, `seedChartWindowBundle`, in-flight dedupe
- [ ] 4.5 Add unit tests: `marketResourceCache` merge/coverage, `marketWindowPlanner` cache hit/miss/in-flight
- [ ] 4.6 Add `wb.market_window_decision` debug marks per `pipeline-debug-instrumentation` delta spec

## 5. Phase 5 — Workbench integration

- [ ] 5.1 Replace cold-path full-range `fetchChartMarketBundle` in `WorkbenchContext.tsx` market load effect with `marketWindowPlanner` + `fetchChartWindow`
- [ ] 5.2 Wire distant trade navigation to fetch trade-centered chart-window when outside cache coverage
- [ ] 5.3 Update render-window commit hook: pan inside cache → zero network slice; pan outside cache → chart-window fetch then `setData`
- [ ] 5.4 Ensure chart-events and signal-trace scheduling are unchanged (no coupling to market window planner)
- [ ] 5.5 Update affected tests: `workbenchLoad.test.tsx`, `runMarketView.test.ts`, chart-events display tests — cold open must not call `fetchChartMarketBundle`
- [ ] 5.6 Verify HTF context EMA overlays (`workbench-chart-htf-context-overlays`) on variant with `strategy.contexts` — dashed HTF lines and Bar Inspector values after windowed cold load

## 6. Phase 6 — Perf / migration / archive

- [ ] 6.1 Re-run baseline scenarios with windowed path; document comparison in `debug/reports/market-bundle-cold-load-comparison.md` (duration, payload, bar counts)
- [ ] 6.2 Manual Workbench verification: cold open, tab switch to Chart, long pan across cache boundary, distant trade navigation (follow `.cursor/rules/workbench-chart-screenshots.mdc`)
- [ ] 6.3 Mark `/api/market/chart-bundle` as legacy in router description; confirm frontend cold path no longer uses it
- [ ] 6.4 Confirm no regression: anchor EMA overlays, trade markers/chart-events, signal-trace lanes
- [ ] 6.5 Archive change via `/opsx:archive` after review
