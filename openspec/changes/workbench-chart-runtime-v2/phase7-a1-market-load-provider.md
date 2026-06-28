# Phase 7.A1 — Market Load Provider (WorkbenchContext shrink)

**Status:** Not started (OpenSpec — implementation pending review)  
**Branch:** `new-workbench-chart-runtime-v2`  
**Prerequisite:** Phase 6.5 ownership report approved (`phase6-5-ownership-report.md`)  
**Parent plan:** `phase6-5-ownership-report.md` §8 Group A step **A1**  
**Maps to:** `tasks.md` §8.1–8.4 (market domain only)  
**Phase debug tag:** `phase: 7.A1`, `domain: market`

## 1. Goal

Relocate **market-domain React orchestration** out of `WorkbenchContext.tsx` into a **thin production runtime provider** so that:

- `WorkbenchContext` no longer owns `phase63FMarketLoadOwnerRef`, market `useEffect` cycles, or market mirror React state.
- **Mutable market behavior** remains owned by existing v2 modules (`phase63FMarketLoadBridge` → `marketLoadRuntime`, `marketBundleRuntime`, `marketViewRuntime`, `marketWindowRuntime`, `panRuntime`).
- `WorkbenchContext` consumes a **read-only market output snapshot** (adapter fields only) and keeps non-chart provider responsibilities unchanged.

This step is **glue relocation only**. It does not change fetch contracts, backend APIs, cache semantics, or cutover ownership (`runtime_v2_production` for `market` stays).

---

## 2. Scope

### In scope (A1)

| Area | WorkbenchContext today | Target owner |
|---|---|---|
| `phase63FMarketLoadOwnerRef` lifecycle | Context `useRef` + reset on run switch | Market runtime provider |
| Focus/coverage window sync effect | `syncPhase63FMarketFocusWindows` + `setMarketFocusWindow` / `setMarketCoverageWindow` | Provider internal state |
| Market load `useEffect` | `runPhase63FMarketLoad`, abort/cancel, `onChunkSeeded` revisions | Provider effect |
| Market React mirror state | `marketLoadStatus`, `marketError`, `runMarketViewIdentity`, revisions | Provider → output snapshot |
| `marketBundleSnapshot` / `cachedBundle` / `renderWindowFoundationKey` | Context memos | Provider output |
| `getCandles` cache read + `cachedBundleCandlesRef` | Context effect (~1019–1035, ~1136–1145) | `marketBundleRuntime` or provider read path |
| `intendedRunMarketView` / identity memos | Context `useMemo` (~700–838) | `runtimeInputAdapter` + `marketViewRuntime` input builder in provider |
| `logPhase63FComposeFocusFallback` effect | Context (~1019–1059) | Provider |
| `attemptMarketPanPrefetch` callback body | Context (~1189–1228) | Provider (pan still `domain: market` via 63F) |
| Window key memos | `marketFocusWindowKey`, `marketCoverageWindowKey` | Provider output |

### Out of scope (later A2–A6 / Phase 8)

| Area | Deferred to |
|---|---|
| Render-window init/apply/shift (`phase63B*`) | A2 |
| Viewport commands (`phase63C*`) | A3 |
| Trace load cycle (`phase63D*`) | A4 |
| Aux/HTF overlays (`phase63E*`) | A5 |
| Model slice / `chartValue` shrink | A6 |
| Legacy adapter field removal (`chartCandles`, …) | Phase 8 |
| Delete `phase63FMarketLoadBridge.ts` or `*Runtime.ts` modules | Never in A1 — bridges/runtime stay |
| Backend EMA / signal-trace performance | Out of scope backlog (Phase 6.4) |
| Cutover config / telemetry tag cleanup | Phase 7 Group C |

---

## 3. Architecture

### 3.1 Current (6.3F)

```
WorkbenchContext
  ├── phase63FMarketLoadOwnerRef
  ├── marketFocusWindow / marketCoverageWindow (useState)
  ├── market load useEffect → runPhase63FMarketLoad
  ├── marketBundleSnapshot memo
  ├── attemptMarketPanPrefetch → evaluatePhase63FPanPrefetch
  └── chartValue ← reads market fields + other domains
```

### 3.2 Target (7.A1)

```
WorkbenchContext
  ├── builds ChartRuntimeInput (report, selection, IO gate, …)
  ├── <WorkbenchChartMarketRuntimeProvider input={…}>
  │     └── owns phase63F owner + effects + pan prefetch
  │     └── exposes MarketRuntimeOutput snapshot
  └── reads market snapshot for chartValue + downstream domain inputs
        (renderWindowFoundationKey, cachedBundle, marketLoadStatus, …)
```

**Naming (implementation choice — pick one, document in PR):**

- Preferred: `frontend/src/features/workbenchChartRuntime/WorkbenchChartMarketRuntimeProvider.tsx`
- Hook surface: `useWorkbenchChartMarketRuntime()` (provider-internal or exported for tests)
- Pure helpers stay in `phase63FMarketLoadBridge.ts`; provider is React wiring only.

### 3.3 Output contract (minimum)

Provider MUST expose a stable snapshot consumed by `WorkbenchContext`:

```ts
type WorkbenchChartMarketRuntimeOutput = {
  marketLoadStatus: RuntimeLoadStatus;
  marketError: string | null;
  runMarketViewIdentity: RunMarketViewIdentity | null;
  marketFocusWindow: MarketDisplayWindowMs | null;
  marketCoverageWindow: MarketDisplayWindowMs | null;
  marketFocusWindowKey: string | null;
  marketCoverageWindowKey: string | null;
  marketBundleSnapshot: Phase63FMarketBundleSnapshot; // or equivalent
  cachedBundle: ChartMarketBundle | null;
  renderWindowFoundationKey: string | null;
  marketCandlesRevision: number;
  marketOverlayRevision: number;
  attemptMarketPanPrefetch: (
    visibleFromSec: number,
    visibleToSec: number,
    forceUserPan?: boolean,
    visibleSample?: string,
  ) => void;
  /** Test-only reset; not exported to ChartPanel */
  resetForRunSwitch: () => void;
};
```

`WorkbenchContext` passes `attemptMarketPanPrefetch` through to `dispatchChartInteraction` unchanged until A2/A3 relocate interaction glue.

---

## 4. WorkbenchContext symbols to remove (A1)

After A1, these MUST NOT remain in `WorkbenchContext.tsx`:

| Symbol | Approx lines (current) | Action |
|---|---|---|
| `phase63FMarketLoadOwnerRef` | 409–414 | Move to provider |
| `createPhase63FMarketLoadOwnerState` import usage in context | 411 | Provider only |
| `marketFocusWindow` / `setMarketFocusWindow` | 401+, 840–873 | Provider state |
| `marketCoverageWindow` / `setMarketCoverageWindow` | 401+, 840–873, 1215–1225 | Provider state |
| `marketFocusWindowRef` / `marketCoverageWindowRef` / `intendedRunMarketViewRef` | refs for sync/pan | Provider refs |
| Market focus sync `useEffect` | 840–879 | Provider |
| Market load `useEffect` | 899–990 | Provider |
| `marketBundleSnapshot` memo | 992–1014 | Provider |
| `getCandles` cache read effect | 1019–1035 | Provider or `marketBundleRuntime` |
| `logPhase63FComposeFocusFallback` effect | 1019–1059 | Provider |
| `marketCandlesRevision` / `marketOverlayRevision` bump helpers | 762–768 | Provider |
| `intendedRunMarketView` / `intendedRunMarketViewIdentity` memos | 700–838 | Provider input builder |
| `attemptMarketPanPrefetch` implementation | 1189–1228 | Provider |
| Direct `resetPhase63FMarketLoadOwner` on run switch | 606, 844 | Provider `resetForRunSwitch` |

### Must remain in WorkbenchContext (A1)

- `chartHeavyIoEnabled` / tab activation gate (input to provider)
- `report`, `selectedVariant`, `chartTimeframe`, `reloadToken`, `selectedTradeEntryTimeMs` (inputs)
- `dispatchChartInteraction` wrapper that **calls** `attemptMarketPanPrefetch` from provider snapshot
- `chartValue` fields sourced from market snapshot (names unchanged for ChartPanel compat)
- Non-chart shell/report/composer/selection state

---

## 5. Forbidden

- Reintroduce `executeMarketWindowLoad` in `WorkbenchContext.tsx`
- Reintroduce `composeDisplayMarketWindowBundle` in `WorkbenchContext.tsx`
- Dual market owner (context + provider both calling `runPhase63FMarketLoad`)
- `old_production` fallback for empty market bundle
- Change network endpoints, EMA periods, or window planner semantics
- Move pan prefetch to render/viewport domain (stays `domain: market` via 63F)
- Wire `useWorkbenchChartRuntime` full harness as production owner (guarded forbidden)
- Delete `phase63FMarketLoadBridge.ts` or runtime modules in A1

---

## 6. Implementation steps

1. Add `WorkbenchChartMarketRuntimeProvider` + `useWorkbenchChartMarketRuntime` with `phase63FMarketLoadOwnerRef` moved inside.
2. Move market effects (focus sync, load cycle, bundle snapshot, compose fallback, cache read) into provider.
3. Move `attemptMarketPanPrefetch` into provider; expose via context/output.
4. Wrap `WorkbenchProvider` children path: provider receives runtime input slice from shell state.
5. Replace WorkbenchContext inline market state with snapshot reads.
6. Update `phase6StaticGuards.test.ts` / `phase6SingleOwnerContract.test.ts`:
   - Context must **not** contain `phase63FMarketLoadOwner` or `runPhase63FMarketLoad`
   - Provider must contain them
7. Add `phase7A1MarketLoadProvider.test.tsx` (provider integration with mocked report/variant).
8. Verify line-count delta: target **≥150 lines** removed from `WorkbenchContext.tsx` in A1 alone (partial progress toward −1000 total).

---

## 7. Tests

| Check | Command / file |
|---|---|
| 63F bridge contracts unchanged | `phase63FMarketLoadBridge.test.ts` |
| New provider integration | `phase7A1MarketLoadProvider.test.tsx` (new) |
| Single-owner guards | `phase6SingleOwnerContract.test.ts` (updated) |
| Static guards | `phase6StaticGuards.test.ts` (updated) |
| Provider load integration | `workbenchLoad.test.tsx` (cold open, no `fetchChartMarketBundle`) |
| Market parity harness | `marketPhase3cBundleParity.test.ts` |
| Build | `npm run build` (frontend) |

---

## 8. Browser smoke evidence (required before merge)

Re-run or reference existing artifacts; capture new only if behavior changed:

| Scenario | Verdict required | Evidence |
|---|---|---|
| Cold Chart open | PASS | `debug/reports/phase63F-cold-open.json` or re-capture |
| Cache revisit | PASS | `debug/reports/phase63F-cache-revisit.json` |
| Left pan / prefetch | PASS | `debug/reports/phase63F-left-pan.json` |
| Trade focus (market window) | PASS | `debug/reports/phase63F-trade-focus.json` |
| Main vs branch market pattern | No regression | `phase6-4-main-vs-runtime-v2-market-load-diagnostic.md` |

Pipeline: all market steps tagged `owner: runtime_v2_production`, `domain: market`, `phase: 6.3F` (or `7.A1` after telemetry bump if implemented).

---

## 9. Acceptance criteria

- [ ] `WorkbenchContext.tsx` does not reference `phase63FMarketLoadOwner`, `runPhase63FMarketLoad`, or market load `useEffect`
- [ ] `executeMarketWindowLoad` not imported in `WorkbenchContext.tsx` (unchanged from 6.3F)
- [ ] Single market load owner: provider only calls `runPhase63FMarketLoad`
- [ ] Chart cold open: candles + 3 EMA visible; `barCount > 0`
- [ ] No fetch storm on cache revisit / clamped pan
- [ ] `attemptMarketPanPrefetch` still reachable from chart interaction path
- [ ] Static guards + unit tests pass
- [ ] `npm run build` passes
- [ ] No backend / `data_engine` changes

---

## 10. Files (expected)

| File | Change |
|---|---|
| `phase7-a1-market-load-provider.md` | This spec |
| `WorkbenchChartMarketRuntimeProvider.tsx` | **New** — React provider |
| `useWorkbenchChartMarketRuntime.ts` | **New** (optional if hook colocated) |
| `phase7A1MarketLoadProvider.test.tsx` | **New** |
| `WorkbenchContext.tsx` | **Shrink** — remove A1 symbols |
| `phase6StaticGuards.test.ts` | Update ownership location assertions |
| `phase6SingleOwnerContract.test.ts` | Update forbidden symbols in context |
| `tasks.md` | Link A1 spec under §8 |

**Do not change in A1:** `phase63FMarketLoadBridge.ts`, `marketLoadRuntime.ts`, `workbenchMarketLoad.ts`, `ChartPanel.tsx`, backend.

---

## 11. Rollback

Revert provider extraction; restore market refs/effects in `WorkbenchContext`. Cutover config remains `6.3F` all-v2 — rollback is wiring-only, not ownership rollback.

---

## 12. STOP FOR REVIEW

- Review this spec before implementation.
- Implementation PR: **A1 only** — no A2–A6, no Phase 8 adapter trim.
- After merge: update `phase6-5-ownership-report.md` checklist or add `phase7-a1-market-load-provider-report.md` with line counts and smoke evidence.

**Do not start A2 until A1 is approved and merged.**
