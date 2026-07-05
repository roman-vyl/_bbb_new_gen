# Phase 6.1 — Contract Tests And Static Guards

Baseline: `c51281cb6f9cd5817c4294d7eb605bbde15c060e` (Phase 6.0 live-contract map).

Scope: tests, helpers, static guards, and test-only contract derivation helpers only. **No production cutover. No runtime behavior changes in `WorkbenchContext.tsx`, `ChartPanel.tsx`, or mounted chart pipeline.**

## Contracts covered by tests

| Live contract (Phase 6.0 map) | Coverage |
|---|---|
| Adapter/output → ChartPanel shape | `runtimeOutputAdapter.contract.test.ts`, `runtimeOutputAdapter.contract.ts` |
| Required runtime-owned Workbench fields derived from one output | `deriveLegacyWorkbenchChartFieldsFromRuntime`, slice contract test |
| Viewport/interaction callbacks not undefined at adapter boundary | adapter contract test |
| Single-owner pre-cutover (inactive owner flags) | `phase6SingleOwnerContract.test.ts` |
| No runtime v2 import/wiring in `WorkbenchContext` | `phase6SingleOwnerContract.test.ts`, `phase6StaticGuards.test.ts` |
| No old-pipeline fallback patterns in adapter | `runtimeOutputAdapter.contract.test.ts` |
| Old chart-runtime owners still present in provider | `phase6SingleOwnerContract.test.ts`, `phase6StaticGuards.test.ts` |
| Reference stability — chart window slice arrays | `phase6ReferenceStabilityContract.test.ts` |
| Reference stability — programmatic pan suppression | `phase6ReferenceStabilityContract.test.ts` |
| Reference stability — repeated cache-hit ready promotion | `phase6ReferenceStabilityContract.test.ts` |
| Reference stability — chart model `seriesKey` | `phase6ReferenceStabilityContract.test.ts` |
| Reference stability — unchanged market window reset | `phase6ReferenceStabilityContract.test.ts` |
| Selection/focus — `around-trade` vs `tail` focus mode | `phase6SelectionViewportContract.test.ts` |
| Render-window trade init parity (not silent tail fallback) | `phase6SelectionViewportContract.test.ts` |
| Viewport seq / ack semantics | `phase6SelectionViewportContract.test.ts` |
| Viewport trade focus gated by intent | `phase6SelectionViewportContract.test.ts` |
| Trace bootstrap blocked until market + render ready | `phase6MarketTraceReadinessContract.test.ts` |
| Stable chart-events / display cache request keys | `phase6MarketTraceReadinessContract.test.ts` |
| Trace display retain previous events on unchanged loading re-apply | `phase6MarketTraceReadinessContract.test.ts` |
| Static — `ChartPanel` stays on `useWorkbenchChart` | `phase6StaticGuards.test.ts` |
| Static — runtime v2 no React DOM / Lightweight Charts | `phase6StaticGuards.test.ts` |
| Static — no direct cache mutation helpers in runtime production modules | `phase6StaticGuards.test.ts` |

## Contracts not fully covered (and why)

| Contract | Gap | Reason |
|---|---|---|
| Full end-to-end `ChartPanel` adapter cutover shape | Not exercised against live `WorkbenchChartState` object | Phase 6.3 adapter-only cutover; pre-cutover production still uses `WorkbenchContext` |
| Dual-owner post-cutover enforcement in production | Encoded as inactive owner flags + static guards only | Cutover not started; dual-owner would be a Phase 6.3+ failure mode |
| Hook-level output reference stability (`useWorkbenchChartRuntime`) | Not asserted | Shadow hook returns fresh object today; Phase 6.2 targets harness memoization proof |
| `chartViewModel` object identity on unchanged keys | Only `seriesKey` + slice array refs tested | Final model memoization is Phase 6.2/6.3 concern |
| Full trace/network/dense bootstrap orchestration | Partial via bootstrap + display apply guards | Full IO parity remains in Phase 3–5 harness tests, not duplicated here |
| Browser smoke / debug snapshot evidence | Not in scope for 6.1 | Phase 6.4 |

## Existing tests preserved

All prior runtime tests remain unchanged and passing:

- `runtimeTypes.test.ts`
- `marketPhase3aRuntime.test.ts`
- `marketPhase3bFetchPlanLoader.test.ts`
- `marketPhase3cBundleParity.test.ts`
- `displayRenderViewportParity.test.ts`
- `traceEventsOverlaysParity.test.ts`

Additional relevant Workbench/Chart tests re-run without modification:

- `workbenchMarketLoad.test.ts`
- `chartDataWindowManager.test.ts`
- `chartRenderWindowDisplay.test.ts`
- `chartViewModel.test.ts`
- `signalTraceBootstrap.test.ts`

## Static guards added

File: `phase6StaticGuards.test.ts` (+ helper `phase6StaticGuardUtils.ts`)

- `ChartPanel.tsx` must not import `workbenchChartRuntime` / `useWorkbenchChartRuntime`
- Runtime v2 production modules must not import `react`, `react-dom`, or `lightweight-charts`
- Runtime v2 production modules must not import direct cache mutation helpers (`mergeCandlesWindowBundle`, `clearMarketResourceCache`, `seedCandlesWindow`)
- `WorkbenchContext.tsx` must still contain legacy chart-runtime owner symbols and must not import runtime v2
- `runtimeOutputAdapter.ts` scanned for forbidden fallback regex patterns

## Helpers / fixtures added

- `phase6ContractFixtures.ts` — shared report/variant/candles/runtime output fixtures; runtime-owned vs provider-owned field key lists
- `runtimeOutputAdapter.contract.ts` — pure derivation helpers + forbidden fallback pattern list (test/contract only; no production wiring change)

## Production behavior

- **`WorkbenchContext.tsx`**: unchanged
- **`ChartPanel.tsx`**: unchanged
- **Runtime v2 production mount**: still shadow/inert (`inactiveChartRuntimeOwnerFlags`, noop viewport/interaction)
- **No dual owner, no old-pipeline fallback, no cutover**

## Phase 6.2+ status

**Not started.** Phase 6.2 harness stabilization, Phase 6.3 adapter cutover, Phase 6.4 smoke, and Phase 6.5 report remain open.

## Checks run

| Check | Result |
|---|---|
| `openspec validate "workbench-chart-runtime-v2" --strict` | pass |
| Phase 6.1 tests (6 files, 32 tests) | pass |
| Phase 3–5 runtime tests (6 files) | pass |
| Relevant Workbench/Chart tests (5 files) | pass |
| IDE lints on changed files | clean |
| `npm run build` | **fail — pre-existing blockers outside Phase 6.1** (`chartEventsRuntime.ts`, `traceRuntime.ts`, `traceEventsOverlaysHarness.ts`, assorted test TS6133/TS2339 in older files). New Phase 6.1 files compile under Vitest; no new production TS errors introduced in runtime modules touched for derivation helpers only. |
