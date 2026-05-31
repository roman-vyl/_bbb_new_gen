## Context

**Current instrumentation (v1)** — `pipelineDebug.ts` provides `dbgMark`, `dbgTimed` (async), `dbgFlush`. Hooks exist on `api.*` calls and selective `wb.*` marks (market cache, signal-trace policy, merge). Auto `dbgFlush` runs after signal trace loads.

**New hot path (post sliding-window + display cache)**:

```text
Full market bundle (memory) → ChartDataWindowManager slice (~50k)
  → WorkbenchContext memos (candles, EMA, aux from display cache)
  → ChartPanel effects: setData (candles/EMA/aux), markers, viewport

Pan in safe zone: visible range changes only — no window shift, no network.
Pan at boundary: maybeShiftWindowForVisibleRange → bumpRenderWindow →
  re-slice candles + display cache slice (events/HTF) → ChartPanel setData + restoreVisibleRangeAfterWindowShift

Signal trace: fetch OR display-cache hit → mergeDisplayChunk → sliceEventsForWindow / sliceHtfContextForWindow
```

Manual smoke confirms correctness; perceived latency concentrates on events + HTF aux EMA after load and on pan-shift.

## Goals / Non-Goals

**Goals:**

- Measure duration of each listed user-visible phase with stable, grep-friendly step ids.
- Distinguish cache hit vs miss vs network fetch for signal-trace display data.
- Distinguish pan-without-shift vs pan-with-shift (render window rebalance).
- Keep zero overhead when `VITE_EMA_PIPELINE_DEBUG` is not `"true"`.
- Preserve v1 API/network marks; extend, do not replace.

**Non-Goals:**

- Fixing identified bottlenecks in this change.
- Instrumenting every React render or `useMemo` globally.
- Backend signal-trace rebuild profiling (already covered by Python CLI when needed).

## Decisions

### D1 — Extend `pipelineDebug.ts`, not a second module

**Choice:** Add `dbgTimedSync<T>(step, fn, meta?)` for synchronous CPU work (slice, `setData` prep, marker build). Keep `dbgTimed` for async/fetch.

**Rationale:** One stats map and one `dbgFlush` table; operators already filter `[pipeline]`.

**Alternative rejected:** `performance.mark/measure` only — harder to aggregate into the existing table.

### D1b — `dbgTimedSync` / `dbgTimed` are true no-ops when debug is off

**Choice:** Check `pipelineDebugEnabled()` **before** `performance.now()`, `console.debug`, stats mutation, and **before** evaluating meta. Prefer lazy meta API:

```ts
dbgTimedSync(step, fn, meta?: () => Record<string, unknown>)
```

Call sites MUST NOT pass eagerly computed heavy meta when debug is off. Anti-pattern:

```ts
dbgTimedSync("x", () => heavyWork(), { count: expensiveCount() }); // BAD: expensiveCount runs always
```

**Rationale:** Matches v1 zero-overhead goal; debug must not become its own bottleneck.

### D2 — Marks vs timed spans

| Kind | Helper | Examples |
|------|--------|----------|
| Instant policy / branch | `dbgMark` | `wb.pan.no_shift`, `wb.trace_display.cache_hit` |
| Measured work | `dbgTimed` / `dbgTimedSync` | `wb.chart_window_slice`, `chart.setData.candles` |

**Rationale:** Marks stay cheap counters; timed steps capture `max_ms` for jank spikes.

### D3 — Step id vocabulary (frontend v2)

Prefixes unchanged from v1. New ids:

| Step id | Trigger |
|---------|---------|
| `wb.load.report_ready` | Report fetch settled + variant selected |
| `wb.load.market_bundle_ready` | Market cache populated for chart key |
| `wb.render_window.init` | Manager reset + initial tail/around-trade window |
| `wb.render_window.trade_select` | `applyRenderWindowForTrade` (meta: `rebuilt`, `skipped`) |
| `wb.render_window.shift` | `onRenderWindowShiftRequest` when bounds change |
| `wb.pan.no_shift` | Debounced pan decision: visible range changed, render window unchanged |
| `wb.pan.shift_requested` | Debounced pan led to `onRenderWindowShiftRequest` (bounds may change in Context) |
| `wb.pan.suppressed_programmatic` | Pan handler skipped (viewport apply/restore in progress) |
| `wb.chart_window_slice` | `chartWindowSlice` memo recompute |
| `wb.trace_display.cache_hit` / `cache_miss` | `decideSignalTraceLoad` + coverage check |
| `wb.trace_display.merge_chunk` | `mergeDisplayChunk` after fetch |
| `wb.trace_display.slice_events` | `sliceEventsForWindow` in memo |
| `wb.trace_display.slice_htf` | `sliceHtfContextForWindow` in memo |
| `chart.setData.candles` | Main series `setData` effect |
| `chart.setData.anchor_ema` | Anchor stack EMA lines |
| `chart.setData.aux_htf` | Aux HTF dashed lines (per effect run, meta: `overlayCount`) |
| `chart.markers.rebuild` | Trade + component markers |
| `chart.viewport.apply` | `applyChartViewport` / schedule apply |
| `chart.viewport.restore_after_shift` | Post-shift restore (meta: `method`) |

### D4 — Call-site instrumentation only (pure modules stay pure)

**Hard rule:** Timing and marks live in **WorkbenchContext** and **ChartPanel** around calls into utilities. Do **not** add debug imports inside `signalTraceDisplayCache.ts`, `chartDataWindowManager.ts`, or other pure helpers unless call-site wrapping cannot attribute the cost (document why in design/tasks before breaking the rule).

- **WorkbenchContext**: wrap `mergeDisplayChunk`, `sliceEventsForWindow`, `sliceHtfContextForWindow`, `manager.sliceCandles`, `applyRenderWindowForTrade`, `onRenderWindowShiftRequest`, `chartWindowSlice` memo body; extend `wb.signal_trace_decision` meta with `displayCacheCoversWindow`.
- **ChartPanel**: wrap heavy `useEffect` bodies (setData, markers, viewport apply/restore). Pan: **debounced decision marks only** (see D7).

**Rationale:** Prevents debug logic spreading across utility layers; keeps modules testable without env flags.

### D5 — Flush strategy

**Choice:**

- **Primary:** manual `window.__pipelineDebugFlush()` — required for scenario captures and comparisons.
- **Optional auto-flush** (debug mode only):
  - after signal trace ready (existing v1 behavior);
  - after render-window shift — **debounced 1000–1500ms** coalesce so active pan does not spam the console.

**Rationale:** Operators need explicit flush for per-scenario tables; auto-flush after shift is a convenience, not a substitute for manual flush during profiling.

### D7 — Pan logging: debounced decisions only

**Choice:** Do **not** time or mark each raw `subscribeVisibleLogicalRangeChange` event. Log only on the **existing debounced** pan path:

| Mark | When |
|------|------|
| `wb.pan.suppressed_programmatic` | Handler returns early (`isApplyingViewportRef` / suppress window) |
| `wb.pan.no_shift` | Debounced handler ran; Context/`maybeShiftWindow` did not change bounds |
| `wb.pan.shift_requested` | Debounced handler invoked `onRenderWindowShiftRequest` |
| `wb.render_window.shift` | Context confirmed bounds changed (paired with slice/restore timings) |

**Rationale:** Raw range events fire at high frequency; instrumenting them would slow debug and obscure the chart.

### D6 — Meta fields for diagnosis

Common meta keys: `count` (bars, events, overlays), `fromSec`, `toSec`, `action`, `shifted`, `rebuilt`, `method`, `cacheKey`, `chunkCount`.

### D8 — Bat runner writes Workbench reports under `debug/reports/`

**Choice:** Add `debug/run-workbench-pipeline-debug.bat` (sibling to existing `run-pipeline-debug.bat` for Python). It runs a Playwright script (`frontend/e2e/workbench-pipeline-debug.spec.ts`) that exercises the four profiling scenarios, calls `window.__pipelineDebugExport()` (or flush + captured console), and **writes files to disk** — no manual DevTools copy/paste.

**Output layout** (same directory as Python logs):

| File | Content |
|------|---------|
| `debug/reports/workbench_YYYYMMDD_HHmmss.log` | Full run: console `[pipeline]` lines + per-scenario flush tables |
| `debug/reports/workbench-latest.log` | Copy of last run |
| `debug/reports/workbench_<scenario>_YYYYMMDD_HHmmss.txt` | Optional per-scenario excerpt (trade-select, pan-safe, pan-shift, cache-hit) |

**Bat responsibilities:**

1. `mkdir debug\reports` if missing.
2. Ensure Vite is reachable with `VITE_EMA_PIPELINE_DEBUG=true` (start dev in background with env set, or fail fast with message if server up without flag).
3. Run `npx playwright test e2e/workbench-pipeline-debug.spec.ts` from `frontend/`.
4. Playwright collects stats via page export API and Node `fs.writeFileSync` into `debug/reports/`.
5. Print paths and exit code like Python bat.

**Not the same as:** `research/results/runs/*.json` (backtest reports) or Workbench Reports UI — only debug profiling artifacts.

**Alternative rejected:** Browser download blob — user wants bat-driven, repo-local `debug/reports/` like Python path.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| `dbgTimedSync` inside hot pan path adds cost when debug on | True no-op when flag off (D1b); when on, only debounced pan marks (D7), not raw subscribe |
| Eager meta at call sites | Lazy `meta?: () => Record<...>`; code review task 1.4 |
| Auto-flush spam during pan | 1000–1500ms debounce; manual flush for scenario tables |
| Double-counting slice work (memo + effect) | Document that `wb.chart_window_slice` is memo recompute; `chart.setData.*` is chart library cost |
| Console noise | Group related marks; rely on `dbgFlush` table for summary |
| Touching WorkbenchContext risks HTF regression | Manual HTF overlay check on variant with `strategy.contexts` (task in tasks.md) |

## Migration Plan

1. Extend `pipelineDebug.ts` helpers (backward compatible).
2. Add hooks in WorkbenchContext + ChartPanel.
3. Update diagnostics README with action → step checklist.
4. Operators run `debug\run-workbench-pipeline-debug.bat` → logs land in `debug/reports/`. Ad-hoc: DevTools + `__pipelineDebugFlush()` still works.

Rollback: unset env var; hooks are no-ops.

## Open Questions

- Should `dbgFlush` include `avg_ms` column by default? (Proposed: yes in table output.)
- Coalesce multiple `chart.setData.aux_htf` into one timed step per effect run vs per overlay?

**Out of scope (follow-up only):** `PerformanceObserver` long-task hook — add only if sync timings are small but UX remains janky.
