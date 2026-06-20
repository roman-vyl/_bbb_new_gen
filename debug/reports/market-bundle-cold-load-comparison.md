# Market bundle cold load — Phase 7 comparison

**Change:** `market-bundle-cold-load-optimization`  
**Captured:** 2026-06-20  
**Reference run:** `2026-06-17T210326Z_ema_pullback_BTCUSDT_5m__phase3b_perf_current_base_sharp_1h_2p5_10_adx40_runner_rsi90_10_fee04`  
**Symbol / TF:** BTCUSDT / 5m  
**Anchor stack:** fast=100, anchor=200, slow=496  

---

## Executive summary

| | Monolithic baseline (Phase 1) | Split-resource path (Phase 6–7) |
|---|-------------------------------|----------------------------------|
| Cold network pattern | 1× `chart-bundle` (full report) | 1× `candles-window` + 3× `ema-window` |
| Candles transferred (cold) | **646 029** bars | **~50 000** bars (render window) |
| Anchor EMA points transferred | **~1.94M** (646k × 3) | **~150k** (50k × 3, window slice) |
| Dominant API step | `api.fetchChartMarketBundle` **75–113 s** | `api.fetchCandlesWindow` **~1.5–1.7 s** + `api.fetchEmaWindow` **~2.5 s × 3** |
| Time to OHLC visible | After full bundle (~75–113 s) | After candles-window (~**2 s** order of magnitude) |
| Time to all anchor EMA | Same as bundle (atomic) | Staggered; total EMA wall ~**7–8 s** (manual smoke) vs **75–113 s** |
| `api.fetchChartMarketBundle` on cold path | 1–2 | **0** |
| `wb.render_window.init` (pan prefetch) | N/A | **1** (no second init on prefetch) |

**Net:** Cold open is no longer blocked on full-report transfer. Candles-first paint is ~**50× faster** on network-bound steps; total anchor overlay wall time improves ~**10×** vs monolithic bundle on the reference run.

Visual polish during coverage expand (heavy `setData`, freezes) is tracked separately in [`docs/research/25_workbench_chart_orchestration_display_model_v2.md`](../../docs/research/25_workbench_chart_orchestration_display_model_v2.md).

---

## Baseline (monolithic `chart-bundle`)

Source: [`market-bundle-cold-load-baseline.md`](./market-bundle-cold-load-baseline.md), [`workbench-cold-chart-open.json`](./workbench-cold-chart-open.json).

| Metric | Value |
|--------|-------|
| `api.fetchChartMarketBundle` max | **112 533 ms** |
| `api.fetchChartMarketBundle` count | 2 (StrictMode abort + complete) |
| `wb.market_fetch.end` barCount | 646 029 |
| `chart.setData.candles` barCount | 50 000 (after full bundle in memory) |
| `wb.render_window.init` fullLength | 646 029 |
| `api.fetchSignalTrace` | ~1.4 s (unchanged parallel path) |
| Candles before `marketLoadStatus=ready` | **No** — blocked on full bundle |

Distant trade navigation ([`workbench-distant-trade-navigation.json`](./workbench-distant-trade-navigation.json)): `fetchChartMarketBundle` **~75 s** total.

---

## Split-resource path (Phase 6–7)

Sources: Phase 6 integration tests, manual pipeline debug smoke (2026-06-20), `VITE_EMA_PIPELINE_DEBUG=true`.

### Cold open + signal trace (manual smoke)

| Step | count | total_ms (approx) | Notes |
|------|-------|---------------------|-------|
| `api.fetchCandlesWindow` | 1 | **1 735** | Display window only |
| `api.fetchEmaWindow` | 3 | **7 517** | Per period; parallel |
| `api.fetchChartMarketBundle` | **0** | — | Legacy not used |
| `api.fetchRunReport` | 1 | ~210 | Unchanged |
| `api.fetchSignalTrace` | 1–2 | ~1 685 | Unchanged |
| `wb.render_window.init` | **1** | — | Foundation stable |
| `chart.setData.candles` barCount | 50 000 | — | Render window slice |
| `wb.market_compose_focus_fallback` | 0–1 | — | During in-flight prefetch only |

### Pan prefetch (manual smoke, after render-window shift)

| Step | count | Notes |
|------|-------|-------|
| `api.fetchCandlesWindow` | 2 | +1 adjacent chunk |
| `api.fetchEmaWindow` | 6 | +3 for expanded coverage window |
| `wb.render_window.init` | **1** | No re-init on prefetch |
| `wb.market_pan_prefetch_decision` | O(1–few) | Deduped (not per-pixel) |
| `chart.viewport.restore_after_shift` | 1 | Time anchor restore |

### Progressive readiness (observed)

1. `marketCandlesReady` → candle `setData` (~50k bars).
2. Each `ema-window` → per-role anchor `setData` (staggered).
3. `marketLoadStatus=ready` when **focus** candles ready (once per focus key); overlays continue via `marketOverlayRevision`.

---

## Payload comparison (order of magnitude)

| Resource | Monolithic | Split cold open |
|----------|------------|-----------------|
| Candles JSON | ~646k OHLC objects | ~50k OHLC objects |
| EMA JSON | ~646k × 3 points | ~50k × 3 points (response slices; backend may extend canonical cache internally) |
| HTTP requests | 1 large bundle | 4 smaller window requests |
| In-memory cache after cold | Full report range keyed | Interval chunks; tail window first |

Exact byte sizes were not instrumented in v1; bar/point counts above are the primary payload proxy.

---

## EMA consistency

Backend contract test `test_ema_window_matches_chart_bundle_at_same_bars` (`tests/test_market_window_services.py`) asserts canonical `ema-window` values match legacy `chart-bundle` EMA at the same bar times within floating-point tolerance.

---

## Regression verification (Phase 7)

| Area | Verification |
|------|----------------|
| Cold path endpoints | `workbenchLoad.test.tsx`: `fetchChartMarketBundle` not called; `fetchCandlesWindow` ×1, `fetchEmaWindow` ×3 |
| EMA parity | `tests/test_market_window_services.py` |
| HTTP contracts | `tests/test_research_api_market.py` (candles-window, ema-window, legacy chart-bundle) |
| chart-events / signal-trace | `chartEventsDisplayLoad.test.tsx`, `chartEventsRunSwitch.test.tsx`, `chartEventsDistantTradeDisplay.test.tsx` — **36/36** frontend tests pass |
| HTF context overlays | Phase 6.6 manual + existing HTF spec unchanged |
| Anchor EMA progressive render | `workbenchLoad.test.tsx` — candles before all EMA deferred |

---

## Legacy endpoint status

| Endpoint | Status |
|----------|--------|
| `GET /api/market/candles-window` | **Primary** — Workbench cold load |
| `GET /api/market/ema-window` | **Primary** — per-period overlays |
| `GET /api/market/chart-bundle` | **Legacy** — retained for debug/rollback; not used by Workbench cold path |

---

## Phase 7 — STOP FOR REVIEW checklist

- [x] Comparison doc published (this file)
- [x] Frontend cold path confirmed split-only (`fetchChartMarketBundle` count 0 in tests)
- [x] Legacy `/chart-bundle` marked in BFF OpenAPI + client JSDoc
- [x] Automated regression suite green (frontend + backend market tests)
- [ ] Optional: fresh `workbench-cold-chart-open-split.json` capture on reference run (operator)
- [ ] Optional: Chart tab screenshot after cold open (`debug/reports/workbench-cold-open-split.png`)

Follow-up visual architecture: [`25_workbench_chart_orchestration_display_model_v2.md`](../../docs/research/25_workbench_chart_orchestration_display_model_v2.md).
