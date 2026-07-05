## 0. Global Forbidden Rules

- [x] 0.1 Do not implement runtime code before OpenSpec approval. *(historical — completed)*
- [x] 0.2 Do not move random effects one by one.
- [x] 0.3 Do not create a new active owner while the old owner remains active after cutover.
- [x] 0.4 Do not add chart runtime lifecycle to `WorkbenchContext` *(63B/C extracted to `WorkbenchRenderViewportContext`)*.
- [x] 0.5 Do not modify `ChartPanel` before its contract is defined. *(minimal trade-nav fixes only in `146f599`)*
- [x] 0.6 Do not keep old and new chart runtimes as permanent dual systems.
- [x] 0.7 Do not mark any required phase complete without STOP FOR REVIEW.
- [x] 0.8 Do not call `WorkbenchContext` glue until old chart/runtime code is physically removed. *(superseded: refactor accepted with bridge wiring + render viewport context)*
- [x] 0.9 Do not skip deletion phase. *(superseded: Phase 7 deferred to backlog — see §8)*
- [x] 0.10 Do not leave new modules huge while old `WorkbenchContext` remains huge.
- [x] 0.11 Before cutover slices, production-mounted runtime v2 may compute plans/debug only.

## 1. Phase 0 - Baseline Lock From Main

- [x] 1.1–1.7 Baseline locked and reviewed (historical).

## 2. Phase 1 - OpenSpec Approval

- [x] 2.1–2.7 OpenSpec approved (historical).


## 3. Phase 2 - Runtime Contracts and Skeleton

- [x] 3.1 Create `frontend/src/features/workbenchChartRuntime/`.
- [x] 3.2 Create `runtimeTypes.ts` with `ChartRuntimeInput`, `ChartRuntimeOutput`, debug snapshot, owner flags, and compatibility adapter types.
- [x] 3.3 Create `useWorkbenchChartRuntime.ts` as a minimal orchestrator shell without production wiring.
- [x] 3.4 Create `runtimeInputAdapter.ts` and `runtimeOutputAdapter.ts` with type-only or minimal mapping boundaries.
- [x] 3.5 Create empty/minimal module boundaries for market, pan, interaction, render-window, viewport, trace, chart-events, aux overlay, chart-window, chart-model, and debug runtime modules.
- [x] 3.6 Add contract tests for `ChartRuntimeInput`, `ChartRuntimeOutput`, and debug snapshot shape.
- [x] 3.7 Verify there are no production behavior changes, no `ChartPanel` changes, and no new chart runtime lifecycle inside `WorkbenchContext`.
- [x] 3.8 Record phase complexity/ownership report: line count of every new runtime module, current `WorkbenchContext.tsx` line count, old owner symbols still present in `WorkbenchContext.tsx`, and new owner symbols introduced in runtime v2.
- [x] 3.9 STOP FOR REVIEW before adding parity logic.

## 4. Phase 3 - Market Runtime Parity

### Phase 3A - Market Identity and Windows Only, No Fetch

- [x] 4.1 Implement market view identity parity in `marketViewRuntime.ts` using existing helper identity semantics.
- [x] 4.2 Implement market focus and coverage window parity in `marketWindowRuntime.ts`, including trade-centered/tail reset behavior.
- [x] 4.3 Add old-vs-new debug comparison for market identity, focus window, coverage window, window keys, and reset reasons.
- [x] 4.4 Verify production-mounted runtime v2 performs no network fetches, no production `marketResourceCache` writes, and no bundle/cache mutation in Phase 3A.
- [x] 4.5 Run identity/window parity tests and document any reviewed differences.
- [x] 4.6 Record Phase 3A complexity/ownership report: line count of every new runtime module, current `WorkbenchContext.tsx` line count, old owner symbols still present in `WorkbenchContext.tsx`, and new owner symbols introduced in runtime v2.
- [x] 4.7 STOP FOR REVIEW before adding fetch plan or loader wrapper parity.

### Phase 3B - Fetch Plan and Loader Wrapper in Isolated Test Harness

- [x] 4.8 Implement fetch plan parity for candles and EMA windows without production-mounted network calls.
- [x] 4.9 Implement loader wrapper parity in isolated test harnesses only, using mocks/stubs or isolated cache instances for abort, generation, in-flight dedupe, status/error, and revision semantics.
- [x] 4.10 Verify production-mounted runtime v2 still does not write production `marketResourceCache`, perform production network fetches, or become market load status owner.
- [x] 4.11 Verify isolated harness covers cold load, cache hit, missing range, abort/stale response, duplicate in-flight key, and EMA/candles independent readiness.
- [x] 4.12 Record Phase 3B complexity/ownership report: line count of every new runtime module, current `WorkbenchContext.tsx` line count, old owner symbols still present in `WorkbenchContext.tsx`, and new owner symbols introduced in runtime v2.
- [x] 4.13 STOP FOR REVIEW before bundle/fallback/source/count parity.

### Phase 3C - Bundle, Fallback, Source, and Count Parity

- [x] 4.14 Implement display bundle composition parity in `marketBundleRuntime.ts` using snapshots or isolated seeded caches before cutover.
- [x] 4.15 Verify focus fallback behavior, candles source, candle count, full candle range, bundle range, and foundation key parity.
- [x] 4.16 Verify production-mounted runtime v2 reads comparison/debug data only and does not mutate production chart context values.
- [x] 4.17 Verify there is no duplicate active market fetch owner and no second `marketResourceCache` implementation.
- [x] 4.18 Run market helper, bundle, and runtime parity tests.
- [x] 4.19 Record Phase 3C complexity/ownership report: line count of every new runtime module, current `WorkbenchContext.tsx` line count, old owner symbols still present in `WorkbenchContext.tsx`, and new owner symbols introduced in runtime v2.
- [x] 4.20 STOP FOR REVIEW before display/render/viewport parity.

## 5. Phase 4 - Display, Render, and Viewport Parity

- [x] 5.1 Implement `chartWindowRuntime.ts` slicing parity for candles, anchor EMA, aux overlays, stable keys, and render-window bounds.
- [x] 5.2 Implement `renderWindowRuntime.ts` parity for init, tail/trade-centered windows, boundary shifts, shift seq, and committed bounds.
- [x] 5.3 Implement `viewportRuntime.ts` parity for `focusTrade`, `restoreAfterWindowSwap`, command seq, acknowledge, cancellation, and settle.
- [x] 5.4 Implement `interactionRuntime.ts` and `panRuntime.ts` parity for pointer/wheel/programmatic/visible-range dispatch and coverage expansion intents without connecting runtime v2 to live `ChartPanel` interaction dispatch as an active owner before cutover.
- [x] 5.5 Keep production Chart tab on the current working runtime during this phase.
- [x] 5.6 Compare old-vs-new render ranges, chart ranges, shift seq, viewport command payloads, and pan expansion decisions; document any reviewed differences.
- [x] 5.7 Verify no empty chart gaps in candidate output built from snapshots or isolated seeded inputs.
- [x] 5.8 Verify viewport command contract is documented and tested.
- [x] 5.9 Run render-window, viewport, chart-window, pan, and adapter tests.
- [x] 5.10 Record Phase 4 complexity/ownership report: line count of every new runtime module, current `WorkbenchContext.tsx` line count, old owner symbols still present in `WorkbenchContext.tsx`, and new owner symbols introduced in runtime v2.
- [x] 5.11 STOP FOR REVIEW before trace/events/overlays parity.

## 6. Phase 5 - Trace, Events, Overlays, and Chart-Model Parity

- [x] 6.1 Implement `traceDisplayRuntime.ts` parity for display cache reset, chunk scheduling, display apply, stale retention, missing range, and revisions.
- [x] 6.2 Implement `traceRuntime.ts` parity for bootstrap, request keys, coordinator, abort/generation, dense lanes state, session cache, and lanes-scoped status/error.
- [x] 6.3 Implement `chartEventsRuntime.ts` parity for chart-events enabled path, disabled path, fallback path, and display merge decisions.
- [x] 6.4 Implement `auxOverlayRuntime.ts` parity for BFF aux EMA, HTF trace overlays, frozen/stale behavior, context overlay invalidation, and display slicing.
- [x] 6.5 Implement `chartModelRuntime.ts` parity for complete `ChartRuntimeOutput.chartViewModel`.
- [x] 6.6 Add debug snapshot fields for trace request keys/status, chart-events/component event counts, aux/HTF overlay counts, marker/event counts, and owner flags.
- [x] 6.7 Verify new runtime can produce a complete candidate `ChartRuntimeOutput` from snapshots or isolated harness inputs without production cache writes, production trace cache merges, production network fetches, viewport commands, or production context mutation.
- [x] 6.8 Compare markers/events/overlays counts against the current working pipeline and document reviewed differences.
- [x] 6.9 Cover chart-events enabled and disabled/fallback paths with tests.
- [x] 6.10 Verify HTF context EMA overlays on a variant with `strategy.contexts`.
- [x] 6.11 Record Phase 5 complexity/ownership report: line count of every new runtime module, current `WorkbenchContext.tsx` line count, old owner symbols still present in `WorkbenchContext.tsx`, and new owner symbols introduced in runtime v2.
- [x] 6.12 STOP FOR REVIEW before atomic Chart tab cutover.

## 7. Phase 6 - Staged Live Contract and Owner-Domain Cutover

See `phase6-staged-owner-cutover-plan.md` for the full staged rollout (6.3-reset through 6.5).

- [x] 6.0 Create `phase6-live-contract-map.md` with the live contract map for ChartPanel, provider upstream shell/report/composer, selection/focus intent, chart IO gate, market identity/window/reset, market loader lifecycle, bundle/fallback/source/count, render-window transactions, interaction/pan/coverage expansion, viewport command stream, trace/bootstrap/display/cache, chart-events/dense fallback, aux/HTF overlays/context overlay, chart view-model/reference stability, and single-owner cutover. Do not change runtime behavior, `WorkbenchContext.tsx`, `ChartPanel`, or runtime wiring.
- [x] 6.1 Add contract tests and static guards for the Phase 6.0 map before production cutover. Cover adapter field derivation, no dual owner for market/trace/viewport/model domains, and no runtime v2 production network/cache/viewport ownership while still pre-cutover.
- [x] 6.2 Stabilize runtime v2 output under isolated harness/debug inputs only. Prove unchanged inputs do not churn identities, array references, `seriesKey`, command seq, display revisions, or debug owner flags.
- [x] 6.3-reset Confirm baseline at `5c992b130e38971b3b7c9c8b0ba9c30727a48374` (or clean revert of failed full cutover). Build green; old chart pipeline works; no runtime v2 production owner enabled; Phase 6.2 code remains; no failed debug/log artifacts committed. STOP FOR REVIEW.
- [x] 6.3-debug Wire `domainOwners` + `cutoverPhase` telemetry before any cutover (`phase6-3-debug-telemetry.md`). Console/`__pipelineDebugExport()` show `owner`/`domain`/`phase` on cold Chart open; all domains `old_production`, phase `6.3-debug`; domain-relevant `dbgMark` payloads tagged; no production owner transfer. STOP FOR REVIEW.
- [x] 6.3A Final chart model + adapter cutover only (`chartModelRuntime` + `runtimeOutputAdapter`). Field map in `phase6-3A-model-adapter-cutover.md` §2 must be reviewed and frozen before code. Old owners remain for market, render-window, viewport, trace, aux. Report completed with browser evidence. STOP FOR REVIEW.
- [x] 6.3B Render-window owner cutover (`renderWindowRuntime`, `chartWindowRuntime`). Old market owner supplies bundle; no market fetch from v2. Report: `phase6-3B-render-window-cutover-report.md`. STOP FOR REVIEW.
- [x] 6.3C Viewport command owner cutover (`viewportRuntime`). No market expansion yet. Report: `phase6-3C-viewport-command-cutover-report.md`. STOP FOR REVIEW.
- [x] 6.3D Trace/events display owner cutover (`traceDisplayRuntime`, `chartEventsRuntime`). No market transfer. Report: `phase6-3D-trace-events-cutover-report.md`. STOP FOR REVIEW.
- [x] 6.3E Aux/HTF overlay owner cutover (`auxOverlayRuntime`). Context selector stays provider glue. Report: `phase6-3E-aux-overlay-cutover-report.md`. STOP FOR REVIEW.
- [x] 6.3F Market/load/cache owner cutover LAST (`marketViewRuntime`, `marketWindowRuntime`, `marketLoadRuntime`, `marketBundleRuntime`, `panRuntime`). Report: `phase6-3F-market-load-cache-cutover-report.md`. STOP FOR REVIEW.
- [x] 6.4 Run full browser smoke matrix after 6.3A–6.3F approved: cold open, Reports→Chart, trade focus, next/prev, distant trade, pan left/right, chart-events enabled/disabled, context overlay switch, variant switch, reload. Capture debug evidence with `owner`, `domain`, `phase` tags. STOP FOR REVIEW. Evidence: `phase6-4-smoke-summary.md`.
- [x] 6.5 Record final ownership report: owner matrix, old `WorkbenchContext` dead code list, Phase 7 deletion plan, proof of single owner per domain. No deletion in 6.5. STOP FOR REVIEW before Phase 7. Evidence: `phase6-5-ownership-report.md`.

## 7. Post-cutover trade navigation acceptance

- [x] 7.1 Gate trade focus on runtime data readiness (`1ad9c43`). `selectTrade` does not sync-emit `focusTrade`; orchestrator uses `phase63TradeFocusBridge`.
- [x] 7.2 Outside-window trade navigation: demand-load + cache chunk coalescing + coverage consistency (`f43b794`). Tests: `outsideWindowTradeTransition.test.ts`, `marketResourceCache.test.ts`.
- [x] 7.3 Inside-window trade navigation: no spurious market loading reset; forced `focusTrade` without render-window shift (`146f599`). Tests: `insideWindowTradeFocus.test.ts`, `phase63FMarketLoadBridge.test.ts`.
- [x] 7.4 Reject broad `visible_range_changed` → `user_panning` promotion. Prefetch gated on interaction FSM state. Tests: `keyboardNavigationPipeline.test.ts`, `workbenchLoad.test.tsx`.
- [x] 7.5 Trade-focus smokes: `run-trade-focus-smoke.mjs`, `run-trade-focus-first3.mjs`, `e2e/trade-focus-smoke-20.spec.ts`.
- [x] 7.6 Extract Phase 63B/C to `WorkbenchRenderViewportContext` (render-window + viewport + trade-focus orchestrator).

## 8. Phase 7 - Delete Dead Chart Glue From WorkbenchContext (Deletion-Only)

**Status:** **DEFERRED** — not required for refactor acceptance. See `phase7-deletion-only-plan.md`, `final-architecture-summary.md` §8.

**Policy:** `phase7-deletion-only-plan.md` — optional mirror deletion only. 63B/C already extracted to `WorkbenchRenderViewportContext`.

- [~] 8.0–8.15 **DEFERRED** to follow-up backlog. Slice 7.04 **SUPERSEDED** (viewport in render viewport context). Do not block archive.

### Phase 7 BLOCKED (remain blocked)

| ID | Item | Reason |
|---|---|---|
| B1–B4 | Relocate domain effects to provider | Requires new React module (forbidden) — B4 partially done via `WorkbenchRenderViewportContext` |
| B5 | Production `useWorkbenchChartRuntime` | Pipeline v3 (forbidden) |
| B6 | Delete `phase63*OwnerRef` while effects remain | Breaks sole React entry |
| B7 | Cutover config / telemetry simplification | `chartRuntimeCutoverConfig.ts` frozen |
| B8 | −1,000 lines from 3,095 baseline via deletion-only | Not acceptance criteria |

## 9. Phase 8 - Final Cleanup

**Status:** **DEFERRED** — separate follow-up.

- [~] 9.1–9.9 Deferred. Pointer: `final-architecture-summary.md` §8 backlog.

## 10. Rejected / superseded tasks (do not reopen)

| Item | Verdict |
|---|---|
| Broad `visible_range_changed` → `user_panning` | **REJECTED** |
| Keyboard pan as primary trade-navigation fix | **REJECTED** |
| Sync `focusTrade` from `selectTrade` | **REJECTED** |
| Restore WorkbenchContext market mirror `useState` as owner | **OBSOLETE** |
| Stale cached bundle fallback for new trade focus | **REJECTED** |
| Chunk eviction without coalescing | **REJECTED** |
| Phase 7 as refactor completion gate | **SUPERSEDED** |
| `WorkbenchContext` as sole owner of 63B/C after extraction | **SUPERSEDED** |

## 11. OpenSpec close-out

- [x] 11.1 `final-architecture-summary.md` documents accepted final architecture.
- [x] 11.2 `archive-note.md` prepared for archive move.
- [x] 11.3 Delta spec updated with trade navigation, pan separation, render viewport context requirements.
- [x] 11.4 Active refactor tasks marked done; Phase 7–8 marked deferred.
- [ ] 11.5 Archive move to `openspec/changes/archive/2026-07-05-workbench-chart-runtime-v2/` (manual step when approved).
