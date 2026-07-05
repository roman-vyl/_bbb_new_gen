# Phase 6.2 — Runtime Output Stabilization Under Isolated Harness

Baseline: `f6a7c7075cb259b5d374e6e3107640bb4897f205` (Phase 6.1 contract tests/static guards).

Scope: runtime v2 stabilization in isolated harness/modules only. **No production cutover. No `WorkbenchContext.tsx` / `ChartPanel` wiring changes.**

## Churn / root causes found

| Symptom (failed prior Phase 6 attempt) | Root cause in runtime v2 | Fix |
|---|---|---|
| Repeated `trace_display.apply_current_window` / `displayApplyRevision` churn | `traceEventsOverlaysHarness.resolveSnapshot()` called `applyTraceDisplayForWindow()` on every resolve, always bumping revision | Idempotent apply via `lastApplyInputKey`; apply moved before snapshot read |
| Repeated `chart.setData.anchor_ema` / new chart model objects | `resolveChartModelRuntime()` always called `buildChartViewModel()` | `ChartModelStabilizeCache` + stability key memoization |
| Render-window re-init on unchanged foundation | `initializeRenderWindowRuntime()` reset manager on every shadow resolve | Skip init when `foundationKey` unchanged (mirrors WorkbenchContext effect deps) |
| Duplicate viewport focus seq | `recordViewportCommandCandidate()` incremented seq for identical pending command | Dedupe equal `lastCommand` before seq bump |
| Trade focus silently rendered as tail | Display harness derived `viewMode` from viewport controller default (`tail`) instead of selected trade entry | Derive `around-trade` / center from `selectedTradeEntryTimeMs` (mirrors `WorkbenchContext` `chartView` memo) |
| Stateless `createInitialChartRuntimeOutput()` recreated heavy objects each call | No persistent harness/controller across resolve cycles | New `runtimeOutputStabilizationHarness.ts` with controller + output cache key |

## References stabilized

- Chart window candles / EMA / aux arrays — existing `createChartWindowStabilizeCaches()` (Phase 6.1) + harness persistence
- `chartViewModel` object — stability key cache in `chartModelRuntime.ts` + output-level reuse when `seriesKey` unchanged
- `componentEvents` — retained on no-op trace apply; revision no longer bumps
- Market window focus/coverage objects — unchanged reset key preserves refs via `marketWindowState` in stabilization controller
- Full `ChartRuntimeOutput` — memoized by composite cache key in `resolveStableChartRuntimeOutput()`

## No-op cycles now idempotent

- Repeated `cache_hit` market load — no extra `candlesRevision` promotion (existing + Phase 6.2 test)
- Repeated trace apply with same window/status/cache version — `applyTraceDisplayForWindow()` returns `{ changed: false }`
- Repeated render-window init with same foundation key — `initializeRenderWindowRuntime()` returns `false`
- Duplicate identical viewport focus candidate — no new `commandSeq`
- Suppressed programmatic pan — no coverage expansion candidate
- Unchanged stabilization input — `resolveStableChartRuntimeOutput()` returns cached output reference

## Tests added

File: `phase6OutputStabilization.test.ts` (10 tests)

- Stable `chartViewModel` + candle/EMA refs across duplicate resolve cycles
- Trace apply revision no-op
- Chart model object memoization
- Render-window foundation no re-init
- Viewport seq dedupe
- Programmatic pan suppression
- Cache-hit idempotency
- Trade focus `around-trade` semantics (no tail fallback)
- Market window ref preservation
- Controlled reference change on trade entry change

Phase 6.1 test updated (not weakened): `phase6MarketTraceReadinessContract.test.ts` now expects revision stability on repeated loading re-apply — aligns with no-op contract.

## Old live-contract semantics transferred from WorkbenchContext

- Render-window init keyed by foundation key only (`renderWindowFoundationKey` effect)
- Trade selection changes handled by dedicated apply path, not full re-init
- Chart view mode from `selectedTradeEntryTimeMs`, not viewport controller default
- Trace display apply retention via `shouldRetainPreviousTraceDisplay`
- Viewport focus gated by `canEmitTradeFocus` / duplicate command filtering

## Production behavior

- **`WorkbenchContext.tsx`**: unchanged
- **`ChartPanel.tsx`**: unchanged
- **Runtime v2 production mount**: still shadow/inert; stabilization harness is isolated
- **No dual owner, no old-pipeline fallback, no Phase 6.3 cutover**

## Phase 6.3+ status

**Not started.** Adapter-only cutover remains Phase 6.3.

## Remaining risks before adapter-only cutover

- `createInitialChartRuntimeOutput()` remains stateless for Phase 3–5 parity tests; production cutover must use stabilization controller or React-level memoization in the hook wrapper
- Full viewport command stream integration with ChartPanel ack/settle not exercised end-to-end until Phase 6.3
- Trace/network IO storms under live tab activation still require Phase 6.4 browser smoke
- `npm run build` still fails on pre-existing TS errors outside this phase (`chartEventsRuntime.ts`, `traceRuntime.ts`, `traceEventsOverlaysHarness.ts`, older tests) — no new production-module errors introduced in Phase 6.2 touched files under Vitest coverage

## Checks run

| Check | Result |
|---|---|
| `openspec validate "workbench-chart-runtime-v2" --strict` | pass |
| Phase 6.1 tests (32) | pass |
| Phase 6.2 tests (10) | pass |
| Phase 3–5 runtime tests (49) | pass |
| Relevant Workbench/Chart tests (33) | pass |
| **Total** | **124 tests pass** |
| IDE lints (changed runtime files) | clean |
