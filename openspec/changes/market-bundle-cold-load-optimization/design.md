## Context

**Current flow (post hygiene cleanup):**

```text
report load
  → resolveRunMarketView (full report data_range)
  → isRunMarketViewReady? (checks marketResourceCache by full-range keys)
  → fetchChartMarketBundle(from=report.from, to=report.to)  // entire run
  → seedChartBundleIntoResourceCaches
  → composeRunMarketBundle from cache
  → chartDataWindowManager slices ~50k render window locally
```

`marketResourceCache.ts` stores candles and overlays keyed by **full report range** (`fromOpenTimeMs`, `toOpenTimeMs`). `runMarketView.ts` resolves identity against those keys. `fetchChartMarketBundle` in `WorkbenchContext.tsx` always requests the full `data_range` when candles are missing.

The sliding render window (`workbench-chart-sliding-window`) assumes the full bundle is already in memory; pan shifts slice from cache with **zero network**. This is correct once data is loaded, but cold open pays the cost of the entire run.

**Constraints:**

- Layer boundaries: EMA computed in BFF (`research_api/services/indicators.py`), not frontend.
- `compute_chart_overlay_ema` today seeds from first bar in window — narrowing `from` without warmup biases EMA (documented in `indicators.py` and `test_chart_overlay_ema_window_narrowing_changes_values`).
- Chart-events and signal-trace are separate products; this change must not couple market window fetches to trace/chart-events scheduling.
- HTF context overlays come from signal-trace, not BFF chart-window — verify no regression per `workbench-chart-htf-context-overlays`.

**Reference docs:** `docs/frontend/implementation_plan.md`, `docs/research/24_workbench_chart_loading_roadmap.md`, `openspec/specs/workbench-chart-market-resource-cache/spec.md`.

## Goals / Non-Goals

**Goals:**

- Cold open fetches only the **initial display window** (~50k bars or trade-centered window), not full report range.
- Distant trade navigation fetches a window around the target trade when outside cache coverage.
- Pan inside cached coverage remains zero-network; pan outside coverage fetches the missing window chunk.
- Backend EMA values match full-range calculation within accepted tolerance (warmup bars before display `from`).
- Seed window responses into existing `marketResourceCache` without a second cache layer.
- Instrument old vs new fetch paths for perf comparison.

**Non-Goals:**

- Changing `/chart-events`, `/signal-trace`, strategy semantics, or data_engine storage.
- Overlay-only endpoint in v1.
- Materialized chart-events chunks.
- Reviving `marketDataCache.ts` or rewriting all of `WorkbenchContext.tsx`.
- Frontend EMA computation.

## Decisions

### 1. New endpoint: `GET /api/market/chart-window`

**Choice:** Single windowed bundle endpoint returning display candles + display EMA overlays + coverage metadata.

**Rationale:** Mirrors existing `chart-bundle` shape so `seedChartBundleIntoResourceCaches` can be reused with minimal change. One DB read per window fetch (warmup + display in one `range_get`).

**Query params (proposed):**

| Param | Role |
|-------|------|
| `symbol`, `timeframe` | Market identity |
| `display_from` | Display window start (ms, inclusive) |
| `display_to` or `display_to_open_time_ms` | Display window end (half-open, parity with existing market APIs) |
| `ema_fast`, `ema_anchor`, `ema_slow` | Anchor-stack periods |
| `warmup_bars` (optional) | Override; default `max(ema_slow) + margin` |

**Response model `ChartMarketWindowBundle`:**

```text
candles: ChartBar[]           // display window only
ema_overlays: ChartEmaOverlay[] // display window only
coverage:
  requested_display_from_ms
  requested_display_to_ms
  actual_display_from_ms
  actual_display_to_ms
  warmup_from_ms
  warmup_bars_used
  truncated: bool              // true if DB lacked bars at range edge
```

**Alternative considered:** Split `/candles` + `/indicators/ema` per window — rejected for v1 because it doubles round-trips and loses single-read guarantee.

### 2. EMA warmup policy

**Choice:** Backend reads `[warmup_from_ms, display_to_ms)` where `warmup_from_ms = display_from_ms - warmup_bars * timeframe_ms`, clamped to 0. Compute EMA on warmup+display bars; **return only points with `time >= display_from_sec`**.

**Default warmup:** `max(ema_slow) + 5` bars (aligned with `signal_trace_service._warmup_bars_ms` margin pattern).

**Rationale:** Matches full-range EMA at display window start (verified by contract test comparing windowed vs full-range tail). Documented in `indicators.py` as the intended future BFF enhancement.

**Alternative considered:** Return warmup EMA points to frontend — rejected; frontend must not receive or slice warmup data for display.

### 3. Frontend cache: extend `marketResourceCache` with span coverage

**Choice:** Add **contiguous span storage** per `(symbol, timeframe, reloadToken)` with `coversRange(fromMs, toMs)` and `missingRange(fromMs, toMs)` — pattern from `signalTraceDisplayCache.ts`. Window responses **merge** into the span (dedupe by bar `time`). Overlay spans tracked per overlay key (role/period).

**Rationale:** User requirement: no second cache layer. Existing `setCandlesIfAbsent` / full-range keys are insufficient for incremental windows; migrate to merge-based API while keeping `runMarketView` as the identity/readiness facade.

**Cache key change:** Candles/overlays keyed by `(symbol, timeframe, reloadToken[, role, period])` without embedding full report range in the key. Report `data_range` becomes an upper bound for validity, not the fetch unit.

**Alternative considered:** Keep full-range keys and store each window as separate key — rejected because `composeRunMarketBundle` would need multi-key merge on every read.

### 4. `marketWindowPlanner` module

**Choice:** New module `frontend/src/features/chart/marketWindowPlanner.ts` owning:

- `resolveTargetDisplayWindow(...)` — initial tail window, trade-centered window (~50k default, ~400 bars trade focus per sliding-window spec).
- `planMarketWindowFetch(view, targetBounds)` — returns `{ needed: bool, missingBounds, fetchKey }` from cache `missingRange`.
- `seedChartWindowBundle(view, bundle)` — merge into `marketResourceCache`.

**Integration point:** `WorkbenchContext.tsx` market load effect calls planner instead of unconditional full-range `fetchChartMarketBundle`. Render-window controller calls planner on committed shift when new bounds are outside cache coverage.

**Rationale:** Keeps WorkbenchContext changes minimal; mirrors trace display scheduling separation.

### 5. Pan behavior update

**Choice:** Modify sliding-window semantics: pan **inside** cached span → slice only (unchanged). Pan **outside** cached span → enqueue market window fetch for missing bounds; defer `setData` until fetch completes (or show loading state on candle layer only).

**Rationale:** Spec `workbench-chart-sliding-window` currently forbids pan-driven network; this is an intentional MODIFIED requirement to match windowed cold-load architecture.

### 6. Legacy `/chart-bundle` retention

**Choice:** Keep endpoint; mark as legacy in router description after Phase 5. Remove frontend cold-path usage first; retain for manual/debug fallback until Phase 6 perf sign-off.

**Rationale:** Safe rollback; existing tests continue to validate full-range path.

### 7. Instrumentation

**Choice:** Add `api.fetchChartWindow` to `dbgTimed`; add `wb.market_window_decision` marks (cache_hit, cache_miss, fetch_start, fetch_end, barCount, payloadBytes estimate). Extend `pipeline-debug-instrumentation` spec.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| EMA mismatch at window edge vs full-range | Contract test: windowed EMA vs full-range for same display bounds within `pytest.approx` tolerance |
| Cache merge bugs (gaps, duplicates) | Unit tests on `coversRange`/`missingRange`/merge; mirror signalTraceDisplayCache test patterns |
| Pan fetch latency visible to user | Fetch only missing chunk; show existing window until merge completes; abort stale fetches via existing AbortSignal pattern |
| WorkbenchContext complexity | Isolate logic in `marketWindowPlanner`; touch market load effect and render-window commit hook only |
| HTF overlay regression | Explicit verification task on variant with `strategy.contexts` |
| Multiple overlapping window fetches | In-flight key dedupe (reuse `marketFetchInFlightKeyRef` pattern) |

## Migration Plan

1. **Phase 1** — Baseline doc only; capture metrics with `VITE_EMA_PIPELINE_DEBUG=true`.
2. **Phase 2** — Pydantic contract + tests (no router).
3. **Phase 3** — Backend endpoint behind existing market router; no frontend switch yet.
4. **Phase 4** — Frontend planner + cache span APIs; unit tests; feature flag or env gate optional for incremental merge.
5. **Phase 5** — Switch Workbench cold open and distant-trade path to chart-window; update pan-outside-coverage behavior.
6. **Phase 6** — Compare baselines; deprecate cold-path `fetchChartMarketBundle`; archive change.

**Rollback:** Revert WorkbenchContext to full-range `fetchChartMarketBundle` call; backend endpoint is additive and harmless if unused.

## Open Questions

- **Exact initial cold window:** Tail-aligned 50k bars vs right-edge of report — confirm matches current `chartDataWindowManager` init policy (likely yes).
- **Max single window fetch size:** Cap at 50k display bars or allow larger chunks for distant-trade prefetch?
- **Variant switch:** When periods change, overlay cache miss is expected; candles span may reuse if symbol/tf/range overlap — confirm overlay re-fetch uses chart-window for display bounds only.
