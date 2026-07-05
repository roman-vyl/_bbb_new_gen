# Workbench Chart Runtime v2 — Final Architecture Summary

**Status:** ACCEPTED — refactor complete, OpenSpec ready for archive  
**Production path:** `frontend/src/features/workbenchChartRuntime/` + `phase63*Bridge` wiring  
**Final acceptance commits:** `f43b794`, `146f599` (trade navigation); staged cutover through `6.3F` (Phase 6.4 smoke)  
**Date:** 2026-07-05

---

## 1. Executive summary

Workbench chart runtime v2 is the **production Chart tab pipeline**. The refactor extracted chart domain logic from monolithic `WorkbenchContext.tsx` into `workbenchChartRuntime/*` modules, cut over all six mutable domains in staged slices 6.3A–6.3F, and later extracted Phase 63B/C render-window + viewport orchestration into `WorkbenchRenderViewportContext`.

`WorkbenchContext` remains the **workbench shell** (runs, report, composer, selection, trace/aux bridges) but is **not** “thin glue only”: it still owns React wiring for market load (63F), trace (63D), aux (63E), and composes `WorkbenchRenderViewportProvider`. It does **not** directly own render-window indices, viewport command policy, or trade-focus orchestration.

Trade navigation and user pan are **separate control paths**. Trade focus is **readiness-gated** (no sync `focusTrade` from `selectTrade`). Post-cutover fixes (`f43b794`, `146f599`) completed outside-window demand-load recovery and inside-window viewport focus without render-window shift.

---

## 2. Main modules and responsibilities

| Module / context | Responsibility | Owns mutable state? |
|---|---|---|
| `WorkbenchContext.tsx` | Shell, report/composer, variant/trade/bar selection, 63D trace effect, 63E aux, 63F market load effect, bundles `WorkbenchRenderViewportProvider` | Selection, report glue; 63D/63E/63F owner refs |
| `WorkbenchRenderViewportContext.tsx` | Phase 63B render-window init/shift/slice; Phase 63C viewport commands; interaction dispatch; **trade-focus orchestrator**; pan prefetch callbacks | 63B/63C owner refs; viewport command React state; trade-focus request/emit refs |
| `phase63FMarketLoadBridge.ts` + `market*Runtime.ts` | Market view identity, focus/coverage windows, fetch lifecycle, bundle composition, pan expansion intents | `phase63FMarketLoadOwnerRef` |
| `phase63BRenderWindowBridge.ts` + `renderWindowRuntime.ts`, `chartWindowRuntime.ts` | Bounded render window, trade/tail init, shift commits | Via 63B owner inside render viewport context |
| `phase63CViewportCommandBridge.ts` + `viewportRuntime.ts`, `interactionRuntime.ts` | Viewport command stream, ack/settle/cancel, interaction→viewport policy | Via 63C owner inside render viewport context |
| `phase63DTraceEventsBridge.ts` + trace runtimes | Trace bootstrap, display cache, chart-events path | `phase63DTraceOwnerRef` in WorkbenchContext |
| `phase63EAuxOverlayBridge.ts` + `auxOverlayRuntime.ts` | BFF aux EMA, HTF overlay projection | `phase63EAuxOverlayOwnerRef` in WorkbenchContext |
| `phase63AModelAdapterBridge` / `chartModelRuntime.ts` | Final `chartViewModel` | Derived in 63E bridge path |
| `phase63TradeFocusBridge.ts` | Pure trade-focus readiness + emit-key helpers | None (pure functions) |
| `ChartPanel.tsx` | Lightweight Charts renderer: `setData`, series, markers, executes viewport commands | Renderer only; no market/render readiness decisions |

---

## 3. Final data and control flow

### 3.1 Cold open / variant switch

```
selectedRun + report ready
  → WorkbenchContext: resolve market view (63F)
  → focus/coverage windows from selected trade entry (63F bridge)
  → runPhase63FMarketLoad (63F effect) → marketResourceCache
  → resolvePhase63FMarketBundleSnapshot → cachedBundle
  → WorkbenchRenderViewportProvider: 63B init render window from bundle
  → chartWindowSlice → chartView → chartViewModel (63A/63E)
  → trade-focus orchestrator: evaluateTradeFocusReadiness → focusTrade when ready
  → ChartPanel renders chartViewModel + applies viewport command
```

### 3.2 User pan (mouse / wheel)

```
ChartPanel → dispatchChartInteraction(pointer/wheel/visible_range_changed)
  → WorkbenchRenderViewportContext:
       renderWindow.dispatch(event)  // may enter user_panning via controller FSM
       viewport half via 63C bridge
       visible_range_changed: prefetch ONLY if interaction state is
         user_panning | pending_shift | applying_shift  (NOT broad promotion)
  → onPanPrefetch callback → WorkbenchContext evaluatePhase63FPanPrefetch
  → coverage window expansion → 63F market load effect
  → render-window shift commit → restoreAfterWindowSwap viewport command
```

**Keyboard pan** (`keyboard_pan_start` from document-level navigation keys) is a **user-pan prelude** only: it clears active trade-focus intent and can enter `user_panning`. It is **not** the primary trade-navigation fix.

### 3.3 Trade navigation (Reports row, Next/Prev trade)

```
selectTrade(tradeId)  // WorkbenchContext — selection only, NO sync focusTrade
  → setSelectedTradeId / bar / tab switch
  → resolvePhase63FMarketTargetWindows(selectedTradeEntryTimeMs)
       outside-window: focus window changes → coverage reset key → demand load
       inside-window: focus window may stay; coverage NOT reset to loading (146f599)
  → 63F market load until cache covers new focus
  → WorkbenchRenderViewportContext trade-focus orchestrator:
       tradeFocusRequestSeq bump on trade key change
       evaluateTradeFocusReadiness (market ready, foundation key, entry in slice)
       shouldEmitTradeFocus / pending request → runPhase63CForceTradeFocusCommand
       inside-window without render-window shift: forced focus emit (146f599)
  → ChartPanel applies focusTrade viewport command
```

### 3.4 Separation invariant

| Input | Path | Must not |
|---|---|---|
| Mouse/wheel pan | `user_panning` FSM → boundary prefetch → render-window shift | Be triggered by bare `visible_range_changed` |
| Trade Next/Prev | `selectTrade` → demand-load → readiness-gated `focusTrade` | Sync-emit `focusTrade` from `selectTrade` |
| Programmatic restore / focus | Viewport commands from 63C | Start pan prefetch as user pan |

---

## 4. Key invariants (accepted)

1. **Single owner per domain** at `cutoverPhase: "6.3F"` — all six domains `runtime_v2_production` (`chartRuntimeCutoverConfig.ts`).
2. **No dual pipeline** — `executeMarketWindowLoad`, `composeDisplayMarketWindowBundle`, `buildChartViewModel` are not active owners in `WorkbenchContext`.
3. **`visible_range_changed` is not a user-pan detector** — prefetch runs only when render-window interaction state is already `user_panning`, `pending_shift`, or `applying_shift` after controller dispatch.
4. **Trade focus is readiness-gated** — `selectTrade` does not synchronously emit `focusTrade`; orchestrator waits for market/render/chart model coverage (`phase63TradeFocusBridge`).
5. **Outside-window trade navigation** uses demand-load + contiguous cache coverage (`f43b794`: chunk coalescing in `marketResourceCache`, coverage/focus window alignment).
6. **Inside-window trade navigation** does not spuriously reset market to loading; `focusTrade` applies even when 25k render window does not shift (`146f599`).
7. **Phase63B init** does not seed stale candles from a previous focus target — init gated on current focus window candles from cache.
8. **ChartPanel** executes prepared model and viewport commands; does not decide market/render readiness.

---

## 5. Rejected / obsolete approaches

| Approach | Verdict | Notes |
|---|---|---|
| Broad `visible_range_changed` → `user_panning` | **REJECTED** | Caused spurious prefetch and trade-focus suppression; replaced by interaction-state gate |
| Keyboard pan as primary trade-navigation fix | **REJECTED** | Keyboard prelude supports edge pan UX only; trade nav fixed via demand-load + readiness gating |
| Sync `focusTrade` from `selectTrade` | **REJECTED** | Race with unloaded market/slice; orchestrator emits when ready |
| Restore old WorkbenchContext market mirror `useState` | **REJECTED / OBSOLETE** | Reads via `resolvePhase63FMarketReactSync`; mirrors were Phase 7 deletion targets |
| Stale cached bundle fallback for new trade focus target | **REJECTED** | Outside-window recovery requires demand-load + coalesced cache coverage |
| Chunk eviction without coalescing | **REJECTED** | `marketResourceCache` coalesces overlapping chunks (`f43b794`) |
| Permanent dual old+v2 production owners | **REJECTED** | Staged cutover complete; no fallback path |
| Phase 7 mirror deletion as blocker for “done” | **SUPERSEDED** | Optional follow-up; refactor acceptance does not require −1000 lines |

---

## 6. Final commits (trade navigation acceptance)

| Commit | Scope |
|---|---|
| `1ad9c43` | Gate trade focus on runtime data readiness (orchestrator foundation) |
| `f43b794` | Outside-window trade navigation: cache chunk coalescing, demand-load recovery, market load / render-window transition alignment |
| `146f599` | Inside-window trade navigation: no spurious market loading reset; `focusWindowResetKey`; forced `focusTrade` without render-window shift |

Staged cutover baseline: Phase 6.3A–6.3F (documented in phase 6.3* reports). Phase 6.4 smoke PASS (`phase6-4-smoke-summary.md`).

---

## 7. Tests and smokes (acceptance)

### Automated

| Suite | Covers |
|---|---|
| `phase6SingleOwnerContract.test.ts`, `phase6StaticGuards.test.ts` | Single owner, forbidden symbols in WorkbenchContext |
| `phase63TradeFocusBridge.test.ts` | Readiness + emit-key logic |
| `tradeFocusDemandLoad.test.ts` | Demand-load + readiness gating |
| `outsideWindowTradeTransition.test.ts` | Outside-window coverage / cache recovery (`f43b794`) |
| `insideWindowTradeFocus.test.ts` | Inside-window focus without window shift (`146f599`) |
| `phase63FMarketLoadBridge.test.ts` | Focus window reset key, inside-window loading behavior |
| `keyboardNavigationPipeline.test.ts` | Keyboard prelude vs trade focus; visible_range gate |
| `workbenchLoad.test.tsx` | Integration: pan prefetch, visible_range gate |
| `marketResourceCache.test.ts` | Chunk coalescing |

### Manual / script smokes

| Script / artifact | Covers |
|---|---|
| `frontend/scripts/run-trade-focus-smoke.mjs` | 22× Next trade; no sticky “Market data unavailable” |
| `frontend/scripts/run-trade-focus-first3.mjs` | Short inside-window trade sequence |
| `frontend/e2e/trade-focus-smoke-20.spec.ts` | Playwright trade-focus path |
| `debug/reports/phase63F-*.json` | Cold open, trade focus, left pan, cache revisit (Phase 6.4) |
| Phase 6.4 matrix | Pan, chart-events, aux/HTF, market-load diagnostic |

### Acceptance checklist (final)

- [x] Mouse/wheel pan works; left/right edge market load works
- [x] Render-window shift + viewport restore works
- [x] Trade navigation inside current window moves viewport (`146f599`)
- [x] Trade navigation outside current window loads/recovers (`f43b794`)
- [x] No sticky “Market data unavailable” after trade sequence smokes
- [x] No broad `visible_range_changed` user-pan promotion
- [x] No restored old market mirror ownership pattern in production path

---

## 8. Remaining backlog (outside this refactor)

These items are **not** blockers for archiving `workbench-chart-runtime-v2`:

| Item | Source | Notes |
|---|---|---|
| Phase 7 mirror deletion slices (7.01–7.10) | `phase7-deletion-only-plan.md` | Optional `WorkbenchContext` shrink; bridge wiring stays |
| Phase 8 compat trim (`chartValue` legacy fields) | `phase7-08-chartvalue-compat-trim.md` | Consumer audit required |
| Dense signal-trace cold-path UX (~16 MB) | Phase 6.4 backlog | Backend/network; not v2 regression |
| ChartPanel paint freezes on fast pan | Phase 6.4 backlog | setData paint layer |
| Component events absent in some payloads | Phase 6.4 backlog | Data/trace semantics |
| `docs/frontend/follow-up-workbench-context-decomposition.md` | Separate proposed change | Predates v2; superseded by delivered architecture |
| `docs/workbench-chart-runtime-analysis.md` | Baseline doc | Describes pre-v2 monolith; historical reference only |

---

## 9. Archive pointer

When archiving this change to `openspec/changes/archive/2026-07-05-workbench-chart-runtime-v2/`:

- Delta spec at `specs/workbench-chart-runtime-v2/spec.md` may be promoted to `openspec/specs/workbench-chart-runtime-v2/spec.md` (optional sync).
- Active tasks: Phases 2–6.5 + trade-navigation acceptance = **done**.
- Phase 7–8 = **deferred backlog**, not open refactor tasks.
- See `archive-note.md` for reviewer checklist.
