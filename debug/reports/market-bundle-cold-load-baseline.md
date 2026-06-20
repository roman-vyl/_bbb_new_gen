# Market bundle cold load — Phase 1 baseline

**Change:** `market-bundle-cold-load-optimization`  
**Captured:** 2026-06-20  
**Scope:** Audit only — no runtime changes in this phase.

## Executive summary

Cold Chart open is blocked on a **full-report** `GET /api/market/chart-bundle` fetch. The BFF returns **~646k candles + 3 anchor EMA overlays** for the entire run; the frontend stores the full range in `marketResourceCache`, then slices **50k bars** locally for display. `api.fetchChartMarketBundle` dominates cold-open latency (**~75–113s** in captured runs).

Target v1 replaces this with split resources: `candles-window` (show chart first) + per-period `ema-window` (progressive overlays, backend canonical EMA cache).

---

## Current flow (monolithic)

```text
1. Report load
   WorkbenchContext → api.fetchRunReport

2. Chart activation / variant resolve
   resolveRunMarketView(report.data_range full range)
   getMissingMarketResources → candlesKey + overlay keys (full report bounds)

3. Market load effect (WorkbenchContext ~L760–880)
   if !isRunMarketViewReady(view):
     fromMs  = report.data_range.from_open_time_ms
     toMs    = report.data_range.to_open_time_ms
     fetchChartMarketBundle(symbol, tf, fromMs, toOpenTimeMs, emaFast/Anchor/Slow)
     seedChartBundleIntoResourceCaches(view, bundle)
     marketLoadStatus → "ready" (when candles cached; overlays may be partial)

4. Compose for chart
   cachedBundle = composePartialRunMarketBundle(intendedRunMarketView)
   chartDataWindowManager.reset(cachedBundle.candles.length)  // full cached length
   render window slice → chart.setData.candles (50k)
   anchor EMA slice → chart.setData.anchor_ema

5. Parallel (not gated on market bundle size)
   signal-trace / chart-events for render-window bounds
```

**Bottleneck:** Step 3 always requests **full** `data_range`, not the 50k render window.

---

## Entry points (Phase 2+ handoff)

| Layer | File | Symbol / area |
|-------|------|----------------|
| Network | `frontend/src/api/client.ts` | `fetchChartMarketBundle` → `/api/market/chart-bundle` |
| Market load | `frontend/src/shared/context/WorkbenchContext.tsx` | `loadMarket` effect ~L760; `marketLoadStatus`; `cachedBundle` |
| View identity | `frontend/src/features/chart/runMarketView.ts` | `resolveRunMarketView`, `getMissingMarketResources`, `seedChartBundleIntoResourceCaches`, `composePartialRunMarketBundle` |
| Split cache | `frontend/src/features/chart/marketResourceCache.ts` | `buildCandlesCacheKey` / `buildOverlayCacheKey` (full-range keys today) |
| Render window | `frontend/src/features/chart/chartDataWindowManager.ts` (via WorkbenchContext) | `reset(fullLength)`, `sliceCandles` → 50k |
| BFF router | `research_api/routers/market.py` | `GET /chart-bundle` |
| BFF reader | `research_api/services/market_reader.py` | `fetch_chart_market_bundle` — one `range_get` + 3× `compute_chart_overlay_ema` on full window |
| EMA algo | `research_api/services/indicators.py` | `compute_chart_overlay_ema` — window-local seed (no warmup before `from`) |

---

## Baseline measurements

Source: existing pipeline debug captures (`VITE_EMA_PIPELINE_DEBUG=true`), scenario JSON in `debug/reports/`.

### Reference run

- **Run ID:** `2026-06-17T210326Z_ema_pullback_BTCUSDT_5m__phase3b_perf_current_base_sharp_1h_2p5_10_adx40_runner_rsi90_10_fee04`
- **Symbol / TF:** BTCUSDT / 5m
- **Report range:** `from_open_time_ms=1585132500000` → `to_open_time_ms=1778940900000`
- **Anchor stack periods:** fast=100, anchor=200, slow=496 (from market fetch key in debug meta)

### Cold chart open (`workbench-cold-chart-open.json`, 2026-06-19)

| Metric | Value |
|--------|-------|
| `api.fetchChartMarketBundle` count | 2 (1 aborted frontend, 1 completed) |
| `api.fetchChartMarketBundle` max duration | **112 533 ms** (~1m 53s) |
| `wb.market_fetch.end` barCount | **646 029** (full report candles) |
| `wb.market_fetch.end` overlayCount | 3 |
| `wb.load.market_bundle_ready` barCount | 646 029 |
| `wb.render_window.init` fullLength | 646 029 |
| `chart.setData.candles` barCount | **50 000** (render window only) |
| `chart.setData.anchor_ema` overlayCount | 3 |
| `api.fetchSignalTrace` duration | 1 413 ms |
| Candles vs overlays gate | **Single `marketLoadStatus=ready` after full bundle** — candles not shown before bundle completes |

### Distant trade navigation (`workbench-distant-trade-navigation.json`)

| Metric | Value |
|--------|-------|
| `api.fetchChartMarketBundle` count | 2 |
| `api.fetchChartMarketBundle` total duration | **74 976 ms** (~75s) |
| `chart.setData.candles` barCount | 50 000 |
| `chart.viewport.apply` command | `focusTrade` |

### Payload / point counts (derived)

| Resource | Full fetch (current) | Displayed (current) |
|----------|----------------------|---------------------|
| Candles | 646 029 bars | 50 000 bars |
| Anchor EMA points | ~646 029 × 3 periods ≈ **1.94M** points | sliced to 50 000 window |
| JSON payload (order of magnitude) | Tens of MB (single bundle response) | N/A — client holds full bundle in memory |

Exact byte size not recorded in debug meta; dominant cost is network + JSON parse of full-range bundle.

---

## Readiness model (current vs target)

| | Current | Target v1 |
|---|---------|-----------|
| Candles ready | After full `chart-bundle` | After `candles-window` only |
| Overlays ready | Same bundle (atomic) | Per-period `ema-window`, progressive |
| `marketLoadStatus` | One flag | Split: `marketCandlesReady` / `marketOverlaysReady` |
| Backend EMA | Computed on full fetched window | Canonical cache + extend; window slice in response |

---

## Bottleneck confirmation

1. **Network:** `fetchChartMarketBundle` uses full `data_range` (`WorkbenchContext.tsx` L824–825).
2. **Cache keys:** `runMarketView` keys embed full report range (`fromOpenTimeMs`, `toOpenTimeMs`).
3. **Backend:** `fetch_chart_market_bundle` one SQLite read for entire range + EMA on all bars.
4. **Display:** `chartDataWindowManager` correctly slices 50k — savings are **post-fetch** only.

---

## Phase 7 comparison targets

Record when split-resource path ships:

- Time to first candle render (`marketCandlesReady`)
- Time to all anchor overlays (`marketOverlaysReady`)
- `api.fetchCandlesWindow` duration + bar count
- Sum of `api.fetchEmaWindow` durations + point counts per period
- vs baseline `api.fetchChartMarketBundle` **112s / 646k bars** (cold open)

---

## Phase 1 — STOP FOR REVIEW

- [x] Flow documented
- [x] Baseline metrics captured from `debug/reports/workbench-cold-chart-open.json` and `workbench-distant-trade-navigation.json`
- [x] Entry points listed
- [ ] **User approval required before Phase 2 (contracts)**

**OpenSpec note:** EMA canonical cache extend/invalidation semantics clarified in `design.md` §2 and `specs/research-api-market-ema-window/spec.md` before Phase 3 service work.
