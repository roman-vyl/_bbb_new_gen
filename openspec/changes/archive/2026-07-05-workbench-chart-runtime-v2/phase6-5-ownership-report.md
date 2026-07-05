# Phase 6.5 — Ownership Report (pre–Phase 7 deletion)

**Status:** COMPLETE — STOP FOR REVIEW (no deletion in 6.5)  
**Branch:** `new-workbench-chart-runtime-v2`  
**HEAD:** `376e8fa48af76ea0d0fcc39aa121b34bc58cd0ab`  
**Prerequisite:** Phase 6.4 smoke matrix PASS (`phase6-4-smoke-summary.md`)  
**Date:** 2026-06-28

## Executive summary

At cutover phase **6.3F**, all six mutable chart domains are owned by **`runtime_v2_production`**. There is **no active `old_production` owner**, no dual-owner fallback wiring, and no guard-forbidden symbols (`executeMarketWindowLoad`, `composeDisplayMarketWindowBundle`, `buildChartViewModel`) in `WorkbenchContext.tsx`.

`WorkbenchContext` is now a **React orchestration shell**: it owns non-chart workbench state (shell, report, composer, selection) and wires six `phase63*OwnerRef` bridges to v2 runtime modules. Chart **behavior** is owned by `frontend/src/features/workbenchChartRuntime/`; chart **rendering** remains in `ChartPanel.tsx` (renderer-only).

**Phase 7 may delete WorkbenchContext glue and shrink the provider** per the deletion plan below. Phase 7 must **not** delete shared `chart/` libraries, API clients, or UI components still consumed by v2 runtime and ChartPanel.

---

## 1. Final owner matrix

Single source of truth: `frontend/src/features/workbenchChartRuntime/chartRuntimeCutoverConfig.ts` (`cutoverPhase: "6.3F"`).

| Domain | Active owner | Production bridge | Core runtime module(s) | Mutable state location | Phase 6.4 proof |
|---|---|---|---|---|---|
| **model** | `runtime_v2_production` | `phase63AModelAdapterBridge` (via `phase63EAuxOverlayBridge.resolvePhase63EModelRuntimeSlice`) | `chartModelRuntime.ts` | Model slice derived in 63E bridge; exposed via `derivePhase63AModelDomainFieldsFromRuntime` | Cold open: `chart.setData.candles`, `chart.setData.anchor_ema`; chart-events smoke |
| **render_window** | `runtime_v2_production` | `phase63BRenderWindowBridge` | `renderWindowRuntime.ts`, `chartWindowRuntime.ts` | `phase63BRenderWindowOwnerRef.controller` (`ChartRuntime` via `createChartRuntime`) | Trade focus, left pan, cache revisit smokes |
| **viewport** | `runtime_v2_production` | `phase63CViewportCommandBridge` | `viewportRuntime.ts`, `interactionRuntime.ts` | `phase63CViewportOwnerRef.viewportState` | Trade focus viewport commands; pan interaction dispatch |
| **trace** | `runtime_v2_production` | `phase63DTraceEventsBridge` | `traceRuntime.ts`, `traceDisplayRuntime.ts`, `chartEventsRuntime.ts` | `phase63DTraceOwnerRef` (trace controller + display cache) | Chart-events smoke; signal-trace readiness diagnostic |
| **aux_overlay** | `runtime_v2_production` | `phase63EAuxOverlayBridge` | `auxOverlayRuntime.ts` | `phase63EAuxOverlayOwnerRef.controller` | Non-empty aux/HTF overlay smoke (frontend-visible PASS) |
| **market** | `runtime_v2_production` | `phase63FMarketLoadBridge` | `marketLoadRuntime.ts`, `marketBundleRuntime.ts`, `marketViewRuntime.ts`, `marketWindowRuntime.ts`, `panRuntime.ts` | `phase63FMarketLoadOwnerRef.controller` | Main vs branch market-load diagnostic; perf A/B |

### Owner diagram

```
WorkbenchContext (React shell — NOT a chart domain owner)
  ├── Shell / Report / Composer / Selection  ← stays provider-owned
  └── phase63*OwnerRef bridges  ← sole mutable chart orchestration entry
        ├── 63F market  → marketLoadRuntime / marketBundleRuntime / panRuntime
        ├── 63B render  → renderWindowRuntime → chart/runtime/chartRuntime (engine)
        ├── 63C viewport → viewportRuntime
        ├── 63D trace   → traceRuntime / traceDisplayRuntime / chartEventsRuntime
        ├── 63E aux     → auxOverlayRuntime
        └── 63A model   → chartModelRuntime → buildChartViewModel (library)

ChartPanel
  └── useWorkbenchChart() → reads chartViewModel + callbacks only (renderer-only)
```

---

## 2. Single-owner proof

### 2.1 Active config — no `old_production`

```json
{
  "cutoverPhase": "6.3F",
  "domainOwners": {
    "model": "runtime_v2_production",
    "render_window": "runtime_v2_production",
    "viewport": "runtime_v2_production",
    "trace": "runtime_v2_production",
    "aux_overlay": "runtime_v2_production",
    "market": "runtime_v2_production"
  }
}
```

`old_production` exists only in **historical phase constants** (`PHASE_63A`…`PHASE_63E`) inside `chartRuntimeCutoverConfig.ts` for tests and rollback documentation. It is **not** referenced in active production paths.

### 2.2 Guard-enforced absence of dual pipeline

| Check | Enforced by | Result |
|---|---|---|
| No `executeMarketWindowLoad` in WorkbenchContext | `phase6SingleOwnerContract.test.ts` | **Pass** — only in `phase63FMarketLoadBridge` / `marketLoadRuntime` |
| No `composeDisplayMarketWindowBundle` in WorkbenchContext | design §6 + grep | **Pass** — only in `runMarketView` / `marketBundleRuntime` |
| No `buildChartViewModel` in WorkbenchContext | `phase6StaticGuards.test.ts` | **Pass** — only in `chartModelRuntime` / harnesses |
| No `useWorkbenchChartRuntime` in production | `phase6StaticGuards.test.ts` | **Pass** — isolated harness only |
| No `legacyPipeline` / `fallbackToOld` / `runtimeOutput ?? chartViewModel` | `phase6SingleOwnerContract.test.ts` | **Pass** |
| ChartPanel does not import `workbenchChartRuntime` | `phase6StaticGuards.test.ts` | **Pass** |

### 2.3 Telemetry attribution

All production pipeline marks carry `owner: runtime_v2_production`, `phase: 6.3F`, and domain tag. Verified in Phase 6.4 smokes (`wb.cutover.domain_owners`, per-step `owner`/`domain` in `__pipelineDebugExport()`).

---

## 3. ChartPanel is renderer-only

| Responsibility | Owner | Evidence |
|---|---|---|
| Lightweight Charts `setData`, series, markers, price lines | `ChartPanel.tsx` | No `@/features/workbenchChartRuntime` imports (static guard) |
| Chart data model (`chartViewModel`) | v2 runtime → provider adapter | `useWorkbenchChart().chartViewModel` |
| Viewport command execution | `ChartPanel` imperative layer | `executeViewportCommand` in `chart/runtime/` |
| Market/trace fetch, window planning, cache writes | v2 runtime bridges | Not in ChartPanel |
| User interaction → viewport policy | Provider `dispatchChartInteraction` → 63B+63C bridges | ChartPanel calls callback only |

ChartPanel **must not** be modified for Phase 7 deletion except if adapter field names shrink (Phase 8 compatibility trim).

---

## 4. WorkbenchContext today vs Phase 7 target

| Metric | Baseline (Phase 6.0, commit `5d086cb`) | Now (6.3F) | Phase 7 target |
|---|---|---|---|
| Lines | **3,095** | **2,202** (−893, −29%) | **≤ ~2,095** (−1,000 from baseline per `design.md` §6) |
| Inline market load effect | Present | **Removed** → `runPhase63FMarketLoad` | Glue moves into unified runtime hook or thinner coordinator |
| `chartRuntimeRef` | Present | **Removed** → `phase63BRenderWindowOwner` | N/A |
| `buildChartViewModel` in provider | Present | **Removed** → 63A via 63E | N/A |
| Bridge owner refs | N/A | **6 refs** (B,C,D,E,F + model via E) | Consolidate or hide behind single runtime facade |

Shrink so far is **real but incomplete**: ~893 lines removed; Phase 7 must remove remaining chart orchestration glue, not shared libraries.

---

## 5. Dead / removable code in WorkbenchContext (Phase 7 candidates)

These blocks are **no longer the authoritative chart owner**; they are React wiring that Phase 7 should delete or relocate into `workbenchChartRuntime` (e.g. unified `useWorkbenchChartRuntime` production wiring or a `WorkbenchChartRuntimeProvider`).

### 5.1 Market domain glue (delegate to 63F / shrink)

| Symbol / block | Approx lines | Status | Phase 7 action |
|---|---|---|---|
| `phase63FMarketLoadOwnerRef` + market load `useEffect` | 409–414, 840–981 | Active wiring | **Relocate** into runtime provider; context reads snapshot only |
| `marketFocusWindow` / `marketCoverageWindow` React state | 401–421, 933–937 | Mirror of 63F owner | **Delete** from context; expose via runtime output adapter |
| `getCandles` cache read fallback | 1027–1035, 1136–1145 | Read glue | **Move** to `marketBundleRuntime` / adapter |
| `resolveRunMarketView` / `buildRunMarketViewIdentity` memos | 700–838 | Pre-bridge identity | **Move** to `marketViewRuntime` input builder |
| `marketCandlesRevision` / `marketOverlayRevision` | 406–407, 762–768 | React revision counters | **Derive** from runtime output |

### 5.2 Render / viewport glue (delegate to 63B/63C)

| Symbol / block | Approx lines | Status | Phase 7 action |
|---|---|---|---|
| `phase63BRenderWindowOwnerRef` + init/apply/shift effects | 473–489, 1066–1375 | Active wiring | **Relocate** to runtime provider |
| `phase63CViewportOwnerRef` + command seq state | 479–487, 1089–1187 | Active wiring | **Relocate**; context exposes adapter output only |
| `dispatchChartInteraction` hybrid (B dispatch + 63C) | 1230–1268 | Active | **Move** to `interactionRuntime` facade |
| `chartViewportCommand` / `chartViewportCommandSeq` React state | 491–492 | Mirror | **Delete**; single source in 63C owner |
| `renderWindowShiftSeq` / `displayApplyRevision` | 437–438, 1334–1335 | Mirror | **Derive** from runtime |

### 5.3 Trace / aux glue (delegate to 63D/63E)

| Symbol / block | Approx lines | Status | Phase 7 action |
|---|---|---|---|
| `phase63DTraceOwnerRef` + trace load cycle effect | 429–434, 1825–1961 | Active wiring | **Relocate** to runtime provider |
| `signalTrace` / `signalTraceStatus` / `lanesSignalTrace*` React state | 457–460, 1897–1905 | Mirror | **Delete**; derive from 63D snapshot |
| `queueTraceFetchIntent` / `takeCommittedTraceFetchIntent` | 1349–1357, 1884 | Legacy orchestrator import | **Move** into `traceRuntime` / 63D bridge |
| `evaluateSignalTraceBootstrap` | 1849–1861 | Context-local bootstrap | **Move** to `traceRuntime` |
| Lanes trace filtering (`signalTraceLoadPolicy`) | 1632–1657 | Active glue | **Move** to 63D `resolvePhase63DLanesSnapshot` path |
| `phase63EAuxOverlayOwnerRef` + HTF/BFF effects | 422–427, 1395–1545 | Active wiring | **Relocate** |
| `contextOverlayRef` state + default resolution | 461, 1311–1393 | **Provider UI glue** | **Keep** in context (contract §13: selector stays provider) |
| `stabilizeCaches` manual reset on run change | 1611–1617 | Transitional | **Delete** after runtime owns lifecycle |

### 5.4 Model / chart value assembly

| Symbol / block | Approx lines | Status | Phase 7 action |
|---|---|---|---|
| `phase63AModelSlice` / `modelDomainFields` memos | 1743–1768 | Active adapter | **Replace** with `runtimeOutputAdapter` single output |
| `chartValue` mega-memo | 2033–2120 | Compatibility surface | **Shrink** — map from `ChartRuntimeOutput` only |
| Duplicate legacy fields (`chartCandles`, `chartEmaOverlays`, …) | 2037–2064 | Adapter compat | **Phase 8** trim after ChartPanel consumes `chartViewModel` only |

### 5.5 Already removed (do not reintroduce)

- `executeMarketWindowLoad` direct call in provider
- `composeDisplayMarketWindowBundle` in provider
- `buildChartViewModel` in provider
- `chartRuntimeRef` / inline `renderWindowManager()`
- `marketLoadGenRef`, `marketFetchInFlightKeysRef`, `signalTraceDisplayCacheRef` (caches on bridge owners)

---

## 6. What WorkbenchContext must keep (not removable in Phase 7)

### 6.1 Non-chart domains (permanent provider ownership)

| Domain | State / API |
|---|---|
| Shell | `activeTab`, `hasChartEverActivated`, `chartHeavyIoEnabled`, tab activation |
| Runs / report | `runs`, `selectedRunId`, `report`, fetch/reload effects |
| Composer | `configDraft`, `configList`, config load/save |
| Selection | `selectedVariantKey`, `selectedTradeId`, `selectedBarTimeSec`, `selectTrade`, `selectBar`, trade warnings |
| Marker UI toggles | `chartShow*` booleans (user preferences, not runtime domain) |
| Context overlay selector | `contextOverlayRef`, options, default from run config |

### 6.2 Required glue until a runtime provider exists

- Split contexts: `WorkbenchShellContext`, `WorkbenchReportContext`, `WorkbenchComposerContext`, `WorkbenchChartContext`
- Hooks: `useWorkbench`, `useWorkbenchShell`, `useWorkbenchReport`, `useWorkbenchComposer`, `useWorkbenchChart`
- `emitCutoverDomainOwnersSnapshot()` on run switch (telemetry; removable post–Phase 7 cleanup phase)
- Chart IO gate: heavy IO blocked until Chart tab activated

---

## 7. Read-only / report / debug dependencies

These **read** runtime or chart state but do **not** own mutable chart domains. Phase 7 must preserve them.

| Consumer | Dependency | Type | Notes |
|---|---|---|---|
| `pipelineDebug.ts` / `__pipelineDebugExport` | Pipeline marks from bridges | Debug read | `VITE_EMA_PIPELINE_DEBUG=true`; used in all Phase 6.4 smokes |
| `chartRuntimeCutoverTelemetry.ts` | `chartRuntimeCutoverConfig` | Debug write (marks only) | `dbgMarkCutover`, `emitCutoverDomainOwnersSnapshot` |
| `runtimeDebug.ts` | `createEmptyRuntimeDebugSnapshot` | Debug read | Snapshot contract `design.md` §7; no mutation |
| `debug/capture-phase64-*.mjs` | Playwright + pipeline export | Smoke harness | Report-only; not production |
| `phase6StaticGuards.test.ts` | WorkbenchContext source patterns | CI guard | Must update when Phase 7 deletes symbols |
| `phase6SingleOwnerContract.test.ts` | Import + fallback rules | CI guard | Phase 7 deletion must keep passing |
| Phase 6.3A–F bridge tests | Bridge contracts | Unit tests | Remain after Phase 7 |
| `workbenchLoad.test.tsx` | Provider integration | Integration test | No `fetchChartMarketBundle` on cold open |
| `ReportsPanel.tsx` | Report context only | UI read | No chart runtime |
| `ChartBarInspector.tsx` | `chartViewModel`, trace fields via chart context | UI read | Depends on trace readiness path |
| `SignalTimelineLanes.tsx` | Lanes trace from chart context | UI read | Fed by 63D lanes snapshot |

### Isolated / non-production runtime entry points (keep for tests, not production owner)

| Module | Purpose |
|---|---|
| `useWorkbenchChartRuntime.ts` | Phase 2–6.2 isolated harness; **must not** wire to production (guarded) |
| `displayRenderViewportHarness.ts` | Shadow parity harness |
| `traceEventsOverlaysHarness.ts` | Shadow parity harness |
| `marketLoadHarness.ts` | Loader harness with mocks |
| `runtimeOutputStabilizationHarness.ts` | Reference stability tests |
| `phase6ContractFixtures.ts` | Test fixtures |

---

## 8. Phase 7 deletion plan

**No code deletion in Phase 6.5.** Phase 7 executes the plan below with STOP FOR REVIEW after each major group.

### Group A — WorkbenchContext shrink (primary goal)

| Step | Delete / relocate from `WorkbenchContext.tsx` | Guard / smoke |
|---|---|---|
| A1 | Market load effect → thin runtime provider | `phase63FMarketLoadBridge.test.ts`, cold open smoke |
| A2 | Trace load cycle effect → 63D provider | `phase63DTraceEventsBridge.test.ts`, chart-events smoke |
| A3 | Aux/HTF effects → 63E provider | aux/HTF smoke |
| A4 | Render/viewport effects → 63B/63C provider | trade focus, pan smokes |
| A5 | React mirror state replaced by `ChartRuntimeOutput` adapter | `phase6ReferenceStabilityContract.test.ts` |
| A6 | `queueTraceFetchIntent` import removed from context | trace coordinator tests |

**Acceptance:** `WorkbenchContext.tsx` at least **1,000 lines smaller** than 3,095 baseline (~≤2,095 lines).

### Group B — Forbidden symbol cleanup (verify absent after A)

| Symbol | Must not appear in WorkbenchContext after Phase 7 |
|---|---|
| `executeMarketWindowLoad` | ✓ already absent |
| `composeDisplayMarketWindowBundle` | ✓ already absent |
| `buildChartViewModel` | ✓ already absent |
| `phase63FMarketLoadOwner` direct ref | Replace with runtime provider |
| `evaluateMarketPanPrefetchExpansion` direct import | Only via 63F bridge |

### Group C — Cutover config simplification (optional, post-deletion)

| Item | Action |
|---|---|
| `PHASE_63A`…`PHASE_63E` historical constants | May trim to single `PHASE_63F` after Phase 7 stable |
| `isModelDomainRuntimeV2Production()` helpers | Collapse when only v2 remains |
| `cutoverPhase` telemetry tag | Bump to `7.0` or remove phase gating |

### Group D — NOT in Phase 7 scope (do not delete)

| Path / symbol | Reason |
|---|---|
| `frontend/src/features/chart/**` shared libraries | Used by v2 runtime modules and ChartPanel |
| `chart/runtime/chartRuntime.ts` | Engine inside `renderWindowRuntime` |
| `chart/runtime/chartViewModel.ts` `buildChartViewModel` | Called from `chartModelRuntime.ts` |
| `workbenchMarketLoad.ts` `executeMarketWindowLoad` | Called from `phase63FMarketLoadBridge` / `marketLoadRuntime` |
| `marketResourceCache.ts` | Production cache; v2 load writes via controlled paths |
| `api/client.ts` `fetchChartMarketBundle` | Deprecated but may remain for API compat / tests |
| `ChartPanel.tsx` and chart UI components | Renderer + UX |
| `phase63*Bridge.ts` files | Active production bridges until unified facade replaces them |
| All `workbenchChartRuntime/*Runtime.ts` modules | Active owners |

### Group E — Phase 8 (after Phase 7 stable)

Per `design.md` §6: shrink `WorkbenchChartState` legacy duplicate fields (`chartCandles`, `chartEmaOverlays`, …) after ChartPanel and tests consume `chartViewModel` only.

---

## 9. Runtime module inventory (active production owners)

| Module | Domain(s) | Lines (approx) | React-free |
|---|---|---|---|
| `chartModelRuntime.ts` | model | <500 | ✓ |
| `renderWindowRuntime.ts` | render_window | <500 | ✓ |
| `chartWindowRuntime.ts` | render_window | <500 | ✓ |
| `viewportRuntime.ts` | viewport | <500 | ✓ |
| `interactionRuntime.ts` | viewport | <500 | ✓ |
| `traceRuntime.ts` | trace | may need split | ✓ |
| `traceDisplayRuntime.ts` | trace | <500 | ✓ |
| `chartEventsRuntime.ts` | trace | <500 | ✓ |
| `auxOverlayRuntime.ts` | aux_overlay | <500 | ✓ |
| `marketLoadRuntime.ts` | market | <500 | ✓ |
| `marketBundleRuntime.ts` | market | <500 | ✓ |
| `marketViewRuntime.ts` | market | <500 | ✓ |
| `marketWindowRuntime.ts` | market | <500 | ✓ |
| `panRuntime.ts` | market | <500 | ✓ |
| `marketFetchPlanRuntime.ts` | market | <500 | ✓ |
| `runtimeInputAdapter.ts` | input glue | <500 | ✓ |
| `runtimeOutputAdapter.ts` | output compat | <500 | ✓ |
| `runtimeOutputAdapter.contract.ts` | model contract | <500 | ✓ |
| `chartRuntimeCutoverConfig.ts` | config | <500 | ✓ |
| `chartRuntimeCutoverTelemetry.ts` | telemetry | <500 | ✓ |
| `runtimeDebug.ts` | debug snapshot | <500 | ✓ |

Bridge files (`phase63A`–`phase63F`) are the **current production wiring layer** between React and pure runtime modules. Phase 7 may merge bridges into a single facade but must not remove runtime modules.

---

## 10. Known backlog (not Phase 7 blockers)

From Phase 6.4 — **do not conflate with ownership gaps**:

1. Dense signal-trace cold-path UX (~16 MB, 10–40s+)
2. Cold `/api/market/ema-window` backend latency
3. ChartPanel paint freezes on fast pan (`setData` synchronous)
4. `componentEventsLen=0` / `componentMarkerCount=0` in tested runs

These are performance/data-path issues. Phase 7 deletion must not be blocked on them.

---

## 11. Phase 7 entry checklist

Before starting Phase 7 code deletion:

- [x] Phase 6.4 smoke matrix PASS
- [x] All six domains `runtime_v2_production` in active config
- [x] No dual-owner guard violations
- [x] ChartPanel renderer-only (static guard)
- [x] Dead WorkbenchContext symbols identified (this report §5)
- [x] Non-deletable shared libraries identified (§8 Group D)
- [ ] **This report approved** — STOP FOR REVIEW
- [ ] Phase 7 scoped PR plan (Group A steps, one reviewed slice at a time)

---

## 12. Final verdict

**Ownership is complete for production cutover.** Every mutable chart domain has exactly one active owner (`runtime_v2_production` via `phase63*` bridges → `*Runtime.ts` modules). `WorkbenchContext` no longer implements inline chart pipeline logic; it orchestrates bridge owners and exposes compatibility adapter fields.

**Phase 7 may proceed after this report is approved.** Phase 7 deletes **WorkbenchContext glue and mirror state**, not the v2 runtime library or ChartPanel. Phase 8 trims legacy adapter fields.

**Do not start Phase 7 in the same change as this report.**

---

## Source documents

| Document | Role |
|---|---|
| `phase6-4-smoke-summary.md` | Prerequisite PASS |
| `phase6-3F-market-load-cache-cutover-report.md` | Final domain transfer |
| `phase6-live-contract-map.md` | Contract 1–15 ownership map |
| `design.md` §5–§6 | Cutover rules + deletion strategy |
| `phase6-staged-owner-cutover-plan.md` | Staged rollout authority |
| `phase6StaticGuards.test.ts` | Production wiring guards |
| `phase6SingleOwnerContract.test.ts` | Single-owner import guards |

**STOP FOR REVIEW**

---

## Addendum — post-6.5 stabilization (2026-07-05)

**Status:** ACCEPTED — supersedes §4 line-count table and §12 “Phase 7 may proceed” as refactor gate.

### Architectural changes after 6.5

| Change | Detail |
|---|---|
| `WorkbenchRenderViewportContext` | Phase 63B/C + trade-focus orchestrator extracted from `WorkbenchContext` |
| Trade focus gating | `phase63TradeFocusBridge`; `selectTrade` does not sync-emit `focusTrade` |
| Outside-window trade nav | `f43b794` — cache coalescing, demand-load recovery |
| Inside-window trade nav | `146f599` — no spurious loading reset; forced focus without render-window shift |
| Pan gate | `visible_range_changed` does not alone promote `user_panning` |

### Updated ownership diagram

```
WorkbenchContext (shell + 63D trace + 63E aux + 63F market load)
  └── WorkbenchRenderViewportProvider (63B render + 63C viewport + trade-focus orchestrator)
        └── ChartPanel (renderer)
```

### Line counts (current)

| File | Lines (approx.) |
|---|---|
| `WorkbenchContext.tsx` | ~1,947 |
| `WorkbenchRenderViewportContext.tsx` | ~800 |

Phase 7 mirror deletion remains **optional backlog** — not a blocker for archiving this OpenSpec change.

See `final-architecture-summary.md` for authoritative final architecture.
