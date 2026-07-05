# Phase 7.01 — Delete Market Mirror State From WorkbenchContext

**Status:** OpenSpec — docs only, no implementation  
**Slice:** 7.01 (replaces incorrect "market load provider" direction)  
**Maps to:** `tasks.md` §8.1  
**Ownership report:** `phase6-5-ownership-report.md` §5.1 (mirror rows), §5.5 (already-removed symbols must stay absent)  
**Phase tag:** `phase: 7.01`, `domain: market`  
**Baseline lines:** `WorkbenchContext.tsx` ≈ 2,202 @ `a7b817d`

---

## 1. Goal

Delete **redundant market mirror React state** from `WorkbenchContext.tsx`. Market behavior stays owned by existing v2 stack (`phase63FMarketLoadBridge` → `marketLoadRuntime` / `marketBundleRuntime` / `marketViewRuntime` / `marketWindowRuntime` / `panRuntime`).

**No new files. No provider. No relocation.**

---

## 2. Delete from WorkbenchContext

| Symbol / block | Approx lines | Why dead |
|---|---|---|
| `useState` for `marketLoadStatus` | 401 | Mirrors `owner.controller.status` — use `resolvePhase63FMarketReactSync` |
| `useState` for `marketError` | 402 | Mirrors `owner.controller.error` |
| `useState` for `runMarketViewIdentity` | 403–405 | Mirrors `owner.controller.readyIdentity` |
| `useState` for `marketCandlesRevision` / `marketOverlayRevision` | 406–407 | Bump-only ticks; derive from owner revision fields or bundle snapshot |
| `useState` for `marketFocusWindow` / `marketCoverageWindow` | 418–421 | Mirrors 63F owner windows after `syncPhase63FMarketFocusWindows` |
| `marketFocusWindowRef` / `marketCoverageWindowRef` / `intendedRunMarketViewRef` | 415–417, 895–897 | Ref mirrors of above; read owner directly |
| `setMarketLoadStatus` / `setMarketError` / `setRunMarketViewIdentity` in sync callbacks | 762–768, 933–937 | Side-effect of mirror pattern |
| `setMarketFocusWindow` / `setMarketCoverageWindow` in focus sync effect | 840–879 | Replace with owner-only sync (bridge already mutates owner) |

### Keep in WorkbenchContext (NOT this slice)

| Symbol | Reason |
|---|---|
| `phase63FMarketLoadOwnerRef` | Sole production React owner handle |
| Market load `useEffect` → `runPhase63FMarketLoad` | Sole React entry to 63F bridge |
| `attemptMarketPanPrefetch` → `evaluatePhase63FPanPrefetch` | Interaction glue calling existing bridge |
| `marketBundleSnapshot` memo calling `resolvePhase63FMarketBundleSnapshot` | Adapter read (may shrink in 7.02) |
| `getCandles` cache read for `cachedBundleCandlesRef` | Render input glue until B1 resolved |

---

## 3. In-file replacement (allowed)

Read market fields in memos / `chartValue` from existing bridge helpers:

```ts
const marketSync = resolvePhase63FMarketReactSync(phase63FMarketLoadOwner());
const bundleSnapshot = resolvePhase63FMarketBundleSnapshot({ owner, ... });
```

Do **not** add imports from new modules. Only use symbols already exported from `phase63FMarketLoadBridge.ts`.

---

## 4. Forbidden

- Create `WorkbenchChartMarketRuntimeProvider` or any `WorkbenchChart*` provider
- Create `WorkbenchChartOrchestration` or `workbenchContextShared`
- Move market effects to a new file
- Edit `phase63FMarketLoadBridge.ts`, `marketLoadRuntime.ts`, `workbenchMarketLoad.ts`
- Edit `chartRuntimeCutoverConfig.ts`, backend, `ChartPanel.tsx`
- Delete `phase63FMarketLoadOwnerRef` or market load `useEffect` (see BLOCKED B1/B6 in `phase7-deletion-only-plan.md`)

---

## 5. Acceptance checks

| Check | Command / criterion |
|---|---|
| Mirror `useState` removed | Grep: no `setMarketLoadStatus`, `setMarketFocusWindow` in `WorkbenchContext.tsx` |
| Bridge wiring intact | Grep: `phase63FMarketLoadOwner`, `runPhase63FMarketLoad` still present |
| Forbidden symbols absent | No `executeMarketWindowLoad` in context |
| Line delta | ≥ 80 lines removed (target 80–120) |
| Build | `npm run build` |
| Market bridge tests | `phase63FMarketLoadBridge.test.ts` |
| Provider integration | `workbenchLoad.test.tsx` (cold open, pan prefetch) |
| Smoke | Reference `debug/reports/phase63F-*.json`; re-capture only on regression |

---

## 6. Rollback

Revert slice PR; restore mirror `useState` pattern. No runtime ownership change.

---

## 7. STOP FOR REVIEW

- Approve this spec before any 7.01 code PR.
- One slice per PR — no 7.02+ in same change.
- If deletion breaks React render scheduling without mirror ticks, document minimal in-file revision read from owner (still deletion-only, not relocation).

**Do not start 7.02 until 7.01 is merged.**
