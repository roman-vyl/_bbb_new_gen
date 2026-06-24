## 0. Global Forbidden Rules

- [ ] 0.1 Do not implement runtime code before OpenSpec approval.
- [ ] 0.2 Do not move random effects one by one.
- [ ] 0.3 Do not create a new active owner while the old owner remains active after cutover.
- [ ] 0.4 Do not add chart runtime lifecycle to `WorkbenchContext`.
- [ ] 0.5 Do not modify `ChartPanel` before its contract is defined.
- [ ] 0.6 Do not keep old and new chart runtimes as permanent dual systems.
- [ ] 0.7 Do not mark any required phase complete without STOP FOR REVIEW.
- [ ] 0.8 Do not call `WorkbenchContext` glue until old chart/runtime code is physically removed.
- [ ] 0.9 Do not skip deletion phase.
- [ ] 0.10 Do not leave new modules huge while old `WorkbenchContext` remains huge.
- [ ] 0.11 Before cutover, production-mounted runtime v2 may compute plans/debug only; real loader/cache/network parity must run in isolated test harnesses.

## 1. Phase 0 - Baseline Lock From Main

- [ ] 1.1 Confirm the working branch is `main` or explicitly document the approved branch exception.
- [ ] 1.2 Record the baseline line count for `frontend/src/shared/context/WorkbenchContext.tsx` from current `main`.
- [ ] 1.3 Record the current baseline smoke scenarios from `docs/workbench-chart-runtime-analysis.md`.
- [ ] 1.4 Record the baseline debug snapshot format, including required `__pipelineDebugExport()` fields when debug is enabled.
- [ ] 1.5 Run or document baseline build/tests relevant to Workbench Chart; record any existing blockers without changing runtime behavior.
- [ ] 1.6 Verify that Phase 0 made no runtime changes, no new runtime modules, no `ChartPanel` changes, and no production behavior changes.
- [ ] 1.7 STOP FOR REVIEW before implementation begins.

## 2. Phase 1 - OpenSpec Approval

- [ ] 2.1 Review `proposal.md`, `design.md`, `tasks.md`, and `specs/workbench-chart-runtime-v2/spec.md`.
- [ ] 2.2 Confirm `design.md` covers every responsibility group from `docs/workbench-chart-runtime-analysis.md`.
- [ ] 2.3 Confirm the single-owner matrix covers market windows, market load, cache writes, render-window, viewport commands, trace display cache, dense lanes trace, chart events, aux/HTF overlays, and final model.
- [ ] 2.4 Confirm deletion strategy identifies old `WorkbenchContext.tsx` state, refs, effects, callbacks, imports, and compatibility fields to remove.
- [ ] 2.5 Confirm smoke/debug/test strategy includes cold open, tab activation, distant trade, left/right pan, variant switch, context overlay switch, chart-events enabled/disabled, markers/events/trace, no empty gaps, no fetch storm, and programmatic viewport suppression.
- [ ] 2.6 Run OpenSpec validation/status if the command is available and document the result.
- [ ] 2.7 STOP FOR REVIEW for OpenSpec approval.

## 3. Phase 2 - Runtime Contracts and Skeleton

- [ ] 3.1 Create `frontend/src/features/workbenchChartRuntime/`.
- [ ] 3.2 Create `runtimeTypes.ts` with `ChartRuntimeInput`, `ChartRuntimeOutput`, debug snapshot, owner flags, and compatibility adapter types.
- [ ] 3.3 Create `useWorkbenchChartRuntime.ts` as a minimal orchestrator shell without production wiring.
- [ ] 3.4 Create `runtimeInputAdapter.ts` and `runtimeOutputAdapter.ts` with type-only or minimal mapping boundaries.
- [ ] 3.5 Create empty/minimal module boundaries for market, pan, interaction, render-window, viewport, trace, chart-events, aux overlay, chart-window, chart-model, and debug runtime modules.
- [ ] 3.6 Add contract tests for `ChartRuntimeInput`, `ChartRuntimeOutput`, and debug snapshot shape.
- [ ] 3.7 Verify there are no production behavior changes, no `ChartPanel` changes, and no new chart runtime lifecycle inside `WorkbenchContext`.
- [ ] 3.8 Record phase complexity/ownership report: line count of every new runtime module, current `WorkbenchContext.tsx` line count, old owner symbols still present in `WorkbenchContext.tsx`, and new owner symbols introduced in runtime v2.
- [ ] 3.9 STOP FOR REVIEW before adding parity logic.

## 4. Phase 3 - Market Runtime Parity

### Phase 3A - Market Identity and Windows Only, No Fetch

- [ ] 4.1 Implement market view identity parity in `marketViewRuntime.ts` using existing helper identity semantics.
- [ ] 4.2 Implement market focus and coverage window parity in `marketWindowRuntime.ts`, including trade-centered/tail reset behavior.
- [ ] 4.3 Add old-vs-new debug comparison for market identity, focus window, coverage window, window keys, and reset reasons.
- [ ] 4.4 Verify production-mounted runtime v2 performs no network fetches, no production `marketResourceCache` writes, and no bundle/cache mutation in Phase 3A.
- [ ] 4.5 Run identity/window parity tests and document any reviewed differences.
- [ ] 4.6 Record Phase 3A complexity/ownership report: line count of every new runtime module, current `WorkbenchContext.tsx` line count, old owner symbols still present in `WorkbenchContext.tsx`, and new owner symbols introduced in runtime v2.
- [ ] 4.7 STOP FOR REVIEW before adding fetch plan or loader wrapper parity.

### Phase 3B - Fetch Plan and Loader Wrapper in Isolated Test Harness

- [ ] 4.8 Implement fetch plan parity for candles and EMA windows without production-mounted network calls.
- [ ] 4.9 Implement loader wrapper parity in isolated test harnesses only, using mocks/stubs or isolated cache instances for abort, generation, in-flight dedupe, status/error, and revision semantics.
- [ ] 4.10 Verify production-mounted runtime v2 still does not write production `marketResourceCache`, perform production network fetches, or become market load status owner.
- [ ] 4.11 Verify isolated harness covers cold load, cache hit, missing range, abort/stale response, duplicate in-flight key, and EMA/candles independent readiness.
- [ ] 4.12 Record Phase 3B complexity/ownership report: line count of every new runtime module, current `WorkbenchContext.tsx` line count, old owner symbols still present in `WorkbenchContext.tsx`, and new owner symbols introduced in runtime v2.
- [ ] 4.13 STOP FOR REVIEW before bundle/fallback/source/count parity.

### Phase 3C - Bundle, Fallback, Source, and Count Parity

- [ ] 4.14 Implement display bundle composition parity in `marketBundleRuntime.ts` using snapshots or isolated seeded caches before cutover.
- [ ] 4.15 Verify focus fallback behavior, candles source, candle count, full candle range, bundle range, and foundation key parity.
- [ ] 4.16 Verify production-mounted runtime v2 reads comparison/debug data only and does not mutate production chart context values.
- [ ] 4.17 Verify there is no duplicate active market fetch owner and no second `marketResourceCache` implementation.
- [ ] 4.18 Run market helper, bundle, and runtime parity tests.
- [ ] 4.19 Record Phase 3C complexity/ownership report: line count of every new runtime module, current `WorkbenchContext.tsx` line count, old owner symbols still present in `WorkbenchContext.tsx`, and new owner symbols introduced in runtime v2.
- [ ] 4.20 STOP FOR REVIEW before display/render/viewport parity.

## 5. Phase 4 - Display, Render, and Viewport Parity

- [ ] 5.1 Implement `chartWindowRuntime.ts` slicing parity for candles, anchor EMA, aux overlays, stable keys, and render-window bounds.
- [ ] 5.2 Implement `renderWindowRuntime.ts` parity for init, tail/trade-centered windows, boundary shifts, shift seq, and committed bounds.
- [ ] 5.3 Implement `viewportRuntime.ts` parity for `focusTrade`, `restoreAfterWindowSwap`, command seq, acknowledge, cancellation, and settle.
- [ ] 5.4 Implement `interactionRuntime.ts` and `panRuntime.ts` parity for pointer/wheel/programmatic/visible-range dispatch and coverage expansion intents without connecting runtime v2 to live `ChartPanel` interaction dispatch as an active owner before cutover.
- [ ] 5.5 Keep production Chart tab on the current working runtime during this phase.
- [ ] 5.6 Compare old-vs-new render ranges, chart ranges, shift seq, viewport command payloads, and pan expansion decisions; document any reviewed differences.
- [ ] 5.7 Verify no empty chart gaps in candidate output built from snapshots or isolated seeded inputs.
- [ ] 5.8 Verify viewport command contract is documented and tested.
- [ ] 5.9 Run render-window, viewport, chart-window, pan, and adapter tests.
- [ ] 5.10 Record Phase 4 complexity/ownership report: line count of every new runtime module, current `WorkbenchContext.tsx` line count, old owner symbols still present in `WorkbenchContext.tsx`, and new owner symbols introduced in runtime v2.
- [ ] 5.11 STOP FOR REVIEW before trace/events/overlays parity.

## 6. Phase 5 - Trace, Events, Overlays, and Chart-Model Parity

- [ ] 6.1 Implement `traceDisplayRuntime.ts` parity for display cache reset, chunk scheduling, display apply, stale retention, missing range, and revisions.
- [ ] 6.2 Implement `traceRuntime.ts` parity for bootstrap, request keys, coordinator, abort/generation, dense lanes state, session cache, and lanes-scoped status/error.
- [ ] 6.3 Implement `chartEventsRuntime.ts` parity for chart-events enabled path, disabled path, fallback path, and display merge decisions.
- [ ] 6.4 Implement `auxOverlayRuntime.ts` parity for BFF aux EMA, HTF trace overlays, frozen/stale behavior, context overlay invalidation, and display slicing.
- [ ] 6.5 Implement `chartModelRuntime.ts` parity for complete `ChartRuntimeOutput.chartViewModel`.
- [ ] 6.6 Add debug snapshot fields for trace request keys/status, chart-events/component event counts, aux/HTF overlay counts, marker/event counts, and owner flags.
- [ ] 6.7 Verify new runtime can produce a complete candidate `ChartRuntimeOutput` from snapshots or isolated harness inputs without production cache writes, production trace cache merges, production network fetches, viewport commands, or production context mutation.
- [ ] 6.8 Compare markers/events/overlays counts against the current working pipeline and document reviewed differences.
- [ ] 6.9 Cover chart-events enabled and disabled/fallback paths with tests.
- [ ] 6.10 Verify HTF context EMA overlays on a variant with `strategy.contexts`.
- [ ] 6.11 Record Phase 5 complexity/ownership report: line count of every new runtime module, current `WorkbenchContext.tsx` line count, old owner symbols still present in `WorkbenchContext.tsx`, and new owner symbols introduced in runtime v2.
- [ ] 6.12 STOP FOR REVIEW before atomic Chart tab cutover.

## 7. Phase 6 - Atomic Chart Tab Cutover

- [ ] 7.1 Switch Chart context production output to runtime v2 through `runtimeOutputAdapter.ts`.
- [ ] 7.2 Ensure old chart runtime is not an active owner for market windows, market load, cache writes, render-window, viewport commands, trace display cache, dense lanes trace, chart events, aux/HTF overlays, or final model.
- [ ] 7.3 Keep compatibility adapter only as output mapping; do not hide runtime lifecycle inside adapter.
- [ ] 7.4 Run all required smoke scenarios: cold open, tab activation, distant trade, pan left, pan right, variant switch, context overlay switch, chart-events enabled, chart-events disabled/fallback, markers/events/trace, no empty gaps, no fetch storm, and programmatic viewport suppression.
- [ ] 7.5 Capture runtime debug snapshot evidence for critical smoke scenarios.
- [ ] 7.6 Verify no dual-owner debug/static violations.
- [ ] 7.7 Verify no market or trace fetch storms.
- [ ] 7.8 Verify no empty chart gaps after market status ready.
- [ ] 7.9 Record Phase 6 complexity/ownership report: line count of every new runtime module, current `WorkbenchContext.tsx` line count, old owner symbols still present in `WorkbenchContext.tsx`, and new owner symbols introduced in runtime v2.
- [ ] 7.10 STOP FOR REVIEW before deleting old provider runtime.

## 8. Phase 7 - Delete Old Chart Runtime Pipeline From WorkbenchContext

- [ ] 8.1 Delete old market identity/window state, refs, keys, and effects from `WorkbenchContext.tsx`.
- [ ] 8.2 Delete old market load status/effect, generation refs, in-flight refs, and direct `executeMarketWindowLoad()` ownership.
- [ ] 8.3 Delete old market cache/bundle composition, focus fallback refs, market count/range/source derivations, and direct `composeDisplayMarketWindowBundle()` ownership.
- [ ] 8.4 Delete old pan/edge refs/functions and direct `evaluateMarketPanPrefetchExpansion()` ownership.
- [ ] 8.5 Delete old `chartRuntimeRef`, render-window init/rebuild/shift ownership, and old render-window revisions.
- [ ] 8.6 Delete old viewport command state, transaction refs, acknowledge/cancel/settle ownership from provider.
- [ ] 8.7 Delete old trace bootstrap/network/cache orchestration, trace effect, coordinator refs, session cache refs, and dense trace owner state from provider.
- [ ] 8.8 Delete old chart-events/component-events provider ownership, display apply revision ownership, and direct component event state setters.
- [ ] 8.9 Delete old aux/HTF overlay provider ownership, BFF aux EMA fetch effect, HTF fallback/frozen refs, and direct aux overlay state ownership.
- [ ] 8.10 Delete old chart window slicing refs/memos and direct slice cache ownership.
- [ ] 8.11 Delete old chart model composition and legacy chart compatibility fields that are no longer needed.
- [ ] 8.12 Delete old imports made obsolete by runtime v2 modules.
- [ ] 8.13 Add static guards against old chart runtime symbols/imports returning to `WorkbenchContext.tsx`.
- [ ] 8.14 Verify `WorkbenchContext.tsx` contains only shell/report/Composer/provider glue and runtime input/output adapter wiring.
- [ ] 8.15 Record post-deletion line count and verify the file is materially smaller, targeting at least 1000 fewer lines from baseline unless separately approved.
- [ ] 8.16 Run static guards, relevant unit/integration tests, and all required smoke scenarios.
- [ ] 8.17 Record Phase 7 complexity/ownership report: line count of every new runtime module, current `WorkbenchContext.tsx` line count, old owner symbols still present in `WorkbenchContext.tsx`, and new owner symbols introduced in runtime v2.
- [ ] 8.18 STOP FOR REVIEW before final cleanup.

## 9. Phase 8 - Final Cleanup

- [ ] 9.1 Remove temporary shadow/comparison code.
- [ ] 9.2 Remove temporary flags or debug-only switches that are no longer needed.
- [ ] 9.3 Shrink chart context output toward the clean runtime API and remove obsolete compatibility fields when consumers are migrated.
- [ ] 9.4 Update documentation to point from `docs/workbench-chart-runtime-analysis.md` and this OpenSpec to the delivered runtime architecture.
- [ ] 9.5 Run final tests/build.
- [ ] 9.6 Run final browser/manual smoke, including HTF context EMA overlay verification.
- [ ] 9.7 Verify there is no permanent dual pipeline.
- [ ] 9.8 Record final complexity/ownership report: line count of every new runtime module, final `WorkbenchContext.tsx` line count, old owner symbols still present in `WorkbenchContext.tsx`, and new owner symbols introduced in runtime v2.
- [ ] 9.9 Mark OpenSpec tasks complete only after final verification evidence is recorded.
