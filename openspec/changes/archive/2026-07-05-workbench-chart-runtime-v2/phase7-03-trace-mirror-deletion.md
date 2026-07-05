# Phase 7.03 — Delete Trace Mirror State

**Status:** OpenSpec — docs only  
**Slice:** 7.03  
**Maps to:** `tasks.md` §8.3  
**Ownership report:** §5.3 (`signalTrace*` mirror, lanes derivations, `queueTraceFetchIntent`)  
**Depends on:** 7.01–7.02 merged

---

## 1. Goal

Delete redundant **trace/lanes mirror React state** from `WorkbenchContext.tsx`. Trace behavior stays in `phase63DTraceEventsBridge` → `traceRuntime` / `traceDisplayRuntime` / `chartEventsRuntime`.

---

## 2. Delete from WorkbenchContext

| Symbol / block | Approx lines | Replacement |
|---|---|---|
| `useState` `signalTrace`, `signalTraceStatus`, `signalTraceError`, `loadedSignalTraceWindowKey` | 457–460 | `resolvePhase63DLanesSnapshot(phase63DTraceOwner())` |
| `signalTraceStatusRef`, `signalTraceRef`, `signalTraceErrorRef`, `loadedSignalTraceWindowKeyRef` | 462–466 | Owner reads |
| `setSignalTrace*` in trace load effect callbacks | 1897–1905, 1026–1033 | Bridge owner mutation only |
| `lanesSignalTrace` / `lanesSignalTraceStatus` / `lanesSignalTraceError` memos | 1632–1657 | `resolvePhase63DLanesSnapshot` + `signalTraceMatchesChartWindow` at read site |
| `queueTraceFetchIntent` import + call | 47, 1356 | **Delete if** 63D bridge already queues — verify in bridge before PR |

### Keep

- `phase63DTraceOwnerRef`
- Trace load `useEffect` → `runPhase63DTraceLoadCycle`
- `traceDisplayState`, `displayCacheVersion`, `traceSchedulingTick` if required for display apply scheduling (audit — may be mirror candidates for 7.05)
- `evaluateSignalTraceBootstrap` call inside trace effect until bridge absorbs (7.07)

---

## 3. Forbidden

- Relocate trace effect to new provider
- Edit `phase63DTraceEventsBridge.ts`, `traceRuntime.ts`
- Delete trace load `useEffect` (BLOCKED B2)

---

## 4. Acceptance checks

| Check | Criterion |
|---|---|
| No `useState` for `signalTrace` / `signalTraceStatus` | Mirror removed |
| `phase63DTraceOwner`, `runPhase63DTraceLoadCycle` present | Wiring intact |
| ChartPanel lanes still render | `ChartPanel.tsx` uses `lanesSignalTrace*` from context — values must still be exposed via `chartValue` derived from snapshot |
| `chartEventsDisplayLoad.test.tsx` | Pass |
| Line delta | ~60–90 lines |
| Build | `npm run build` |

---

## 5. STOP FOR REVIEW

**Do not start 7.04 until 7.03 is merged.**
