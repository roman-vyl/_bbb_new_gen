## 1. PR 1 — Instrumentation, Lazy Chart Activation, Abortable Client Foundation

- [ ] 1.1 Extend chart pipeline diagnostics for market fetch start/end/cache hit, trace fetch start/end/cache hit/cache miss, display cache `coversRange`/`missingRange`, candle/EMA `setData`, marker `setMarkers`, and duplicate/superseded trace decisions.
- [ ] 1.2 Add debug scenario coverage for cold chart open, tab switch to Chart, long pan across a render-window boundary, and distant trade navigation.
- [ ] 1.3 Add chart activation state so run list and report load eagerly, but `chart-bundle`, initial `signal-trace`, and chart-only auxiliary overlay IO wait for Chart activation unless explicit background prefetch is enabled.
- [ ] 1.4 Ensure Composer and Reports do not trigger chart-heavy IO before Chart activation.
- [ ] 1.5 Add `AbortSignal` plumbing to `requestJson`, `fetchChartMarketBundle`, and `fetchSignalTrace`.
- [ ] 1.6 Abort or supersede old frontend market/trace requests on run, variant, context, or committed window identity changes, and ignore stale responses.
- [ ] 1.7 Document in debug/review output that AbortController is frontend stale-response protection, not guaranteed backend CPU cancellation.
- [ ] 1.8 Add or update focused frontend tests for lazy chart activation and stale response suppression.
- [ ] 1.9 Verify HTF context EMA overlays (`workbench-chart-htf-context-overlays`) on a variant with `strategy.contexts`.
- [ ] 1.10 Run frontend verification (`cd frontend; npm run build` and relevant tests).
- [ ] 1.11 STOP FOR REVIEW: report PR 1 debug measurements and wait for user approval before starting PR 2.

## 2. PR 2 — WorkbenchContext Split Without Behavior Changes

- [ ] 2.1 Identify current shell/report state and chart data runtime state in `WorkbenchContext`.
- [ ] 2.2 Extract chart data runtime/hook for market load/cache, render window, trace display cache, signal trace load, auxiliary overlays, and viewport commands.
- [ ] 2.3 Keep `WorkbenchProvider` responsible for active tab, runs, selected run, report, selected variant, and selected trade.
- [ ] 2.4 Preserve existing cache keys, API contracts, render-window behavior, trace scheduling, trade focus behavior, and HTF overlay sourcing.
- [ ] 2.5 Ensure ReportsPanel is not subscribed to `displayApplyRevision`.
- [ ] 2.6 Ensure ContextBar is not subscribed to `chartDisplayComponentEvents`.
- [ ] 2.7 Ensure ChartPanel receives chart view model/display state/commands rather than unrelated Workbench shell state.
- [ ] 2.8 Add or update tests proving the refactor does not change pan, trade navigation, trace, and marker behavior.
- [ ] 2.9 Verify HTF context EMA overlays (`workbench-chart-htf-context-overlays`) on a variant with `strategy.contexts`.
- [ ] 2.10 Run frontend verification (`cd frontend; npm run build` and relevant tests).
- [ ] 2.11 STOP FOR REVIEW: summarize the refactor and wait for user approval before starting PR 3.

## 3. PR 3 — Anti-Flicker Events With Partial Display State

- [ ] 3.1 Introduce `TraceDisplayState` with `current`, `partial`, `stale`, `loading_missing`, and `empty` statuses plus covered ranges, missing range, events for covered ranges, and HTF data for covered ranges.
- [ ] 3.2 Change trace display apply logic so a partial or uncovered exact window does not unconditionally call `setChartDisplayComponentEvents([])`.
- [ ] 3.3 Keep cached component events visible for covered portions of the committed render window while missing data loads.
- [ ] 3.4 Keep cached HTF overlay points visible for covered portions of the committed render window while missing data loads.
- [ ] 3.5 Add marker fingerprinting so `markersPlugin.setMarkers(...)` runs only when the final marker fingerprint changes.
- [ ] 3.6 Represent stale/partial state in chart hints or debug output without forcing a visual marker reset.
- [ ] 3.7 Add or update tests for partial coverage, no full marker clear on cache miss, and marker fingerprint stability.
- [ ] 3.8 Verify HTF context EMA overlays (`workbench-chart-htf-context-overlays`) on a variant with `strategy.contexts`.
- [ ] 3.9 Run frontend verification (`cd frontend; npm run build` and relevant tests).
- [ ] 3.10 STOP FOR REVIEW: demonstrate pan-boundary event behavior and wait for user approval before starting PR 4.

## 4. PR 4 — MissingRange Scheduling Without Active-Pan Prefetch

- [ ] 4.1 Add normalized trace display chunk identity using run id, variant, context overlay ref, timeframe or candle grid, and normalized range bounds.
- [ ] 4.2 Choose and document the temporary normalized chunk size while `/signal-trace` remains dense, preferring coarse chunks such as 25k or 50k bars.
- [ ] 4.3 Use `displayCache.missingRange(from, to)` to plan missing trace display chunks for committed render windows.
- [ ] 4.4 Route normalized chunk requests through the trace request coordinator with in-flight, merged, failed, superseded, and aborted ledgers.
- [ ] 4.5 Preserve the rule that active-pan pending shifts do not start trace prefetch.
- [ ] 4.6 Add post-commit idle prefetch for at most one neighboring normalized trace chunk after foreground scheduling settles.
- [ ] 4.7 Ensure trace merges update display state only and do not issue viewport commands or render-window shifts.
- [ ] 4.8 Add or update tests for normalized range identity, missing-range scheduling, duplicate dedupe, no active-pan prefetch, and post-commit idle prefetch.
- [ ] 4.9 Verify HTF context EMA overlays (`workbench-chart-htf-context-overlays`) on a variant with `strategy.contexts`.
- [ ] 4.10 Run frontend verification (`cd frontend; npm run build` and relevant tests).
- [ ] 4.11 STOP FOR REVIEW: report missing-range behavior and wait for user approval before starting PR 5.

## 5. PR 5 — Split Market Resource Cache

- [ ] 5.1 Define `CandlesCache` identity as symbol, timeframe, from, to, and reload identity, excluding variant and EMA periods.
- [ ] 5.2 Define `OverlayCache` identity as symbol, timeframe, source, period or role, range, and reload identity.
- [ ] 5.3 Add `RunMarketView` or equivalent resolver that maps selected run/variant to the required candle and overlay resources.
- [ ] 5.4 Seed split candle and overlay caches from the existing `/api/market/chart-bundle` response without changing backend contracts.
- [ ] 5.5 Ensure variant switches with identical symbol/timeframe/range reuse candles and load only missing or changed overlays.
- [ ] 5.6 Preserve current render-window slicing, anchor EMA rendering, auxiliary EMA rendering, and bar inspector values after cache split.
- [ ] 5.7 Add or update tests for variant switch candle reuse and overlay cache refresh.
- [ ] 5.8 Verify HTF context EMA overlays (`workbench-chart-htf-context-overlays`) on a variant with `strategy.contexts`.
- [ ] 5.9 Run frontend verification (`cd frontend; npm run build` and relevant tests).
- [ ] 5.10 STOP FOR REVIEW: report variant-switch behavior and wait for user approval before starting PR 6.

## 6. PR 6 — Sparse / Materialized Chart Events

- [ ] 6.1 Create a separate OpenSpec or extend this change before implementing backend sparse/materialized chart events.
- [ ] 6.2 Design `GET /api/research/runs/{run_id}/chart-events` request and response contracts for run, variant, range, context overlay ref, sparse component events, HTF display/context data, and coverage metadata.
- [ ] 6.3 Ensure chart-events responses exclude dense `long`/`short` arrays, per-bar internals, and full context consumption traces.
- [ ] 6.4 Implement or prototype a backend chart-events service that derives sparse display data from the same research signal/event generation path as dense trace.
- [ ] 6.5 Add optional materialized chart event chunks beside run artifacts or document why an in-memory/server cache is used first.
- [ ] 6.6 Migrate chart marker and HTF display loading to sparse chart events while keeping `/signal-trace` available for lanes, bar inspector, and diagnostics.
- [ ] 6.7 Add backend and frontend tests for chart-events range coverage, context ref identity, sparse payload shape, and dense `/signal-trace` compatibility.
- [ ] 6.8 Verify HTF context EMA overlays (`workbench-chart-htf-context-overlays`) on a variant with `strategy.contexts`.
- [ ] 6.9 Run backend and frontend verification (`python -m pytest` for affected API tests; `cd frontend; npm run build` and relevant tests).
- [ ] 6.10 STOP FOR REVIEW: report sparse chart-events behavior and wait for user approval before any archive step.
