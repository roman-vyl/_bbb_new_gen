# Phase 7.07 — Delete Transitional Lifecycle Glue

**Status:** OpenSpec — docs only  
**Slice:** 7.07  
**Maps to:** `tasks.md` §8.7  
**Ownership report:** §5.3 (`stabilizeCaches`, trace orchestrator imports)  
**Depends on:** 7.03 recommended first

---

## 1. Goal

Delete **transitional manual reset** blocks left from pre-6.3F cutover that duplicate lifecycle now owned by bridge owners / runtime modules.

---

## 2. Delete from WorkbenchContext

| Symbol / block | Approx lines | Condition |
|---|---|---|
| `stabilizeCaches` manual slice reset effect | 1611–1620 | Delete when run/variant switch resets via 63B/63E bridge reset paths |
| `queueTraceFetchIntent` | 47, 1356 | Delete only if 63D bridge queues internally |
| Duplicate `evaluateSignalTraceBootstrap` wrapper logic | 1849–1861 | Delete only if inputs available from owner snapshot |
| `registerTraceDisplayCacheInvalidatorForTests` if duplicated | bottom of file | Keep single vitest hook |

### Keep

- `resetPhase63DTraceSessionCache` effect on `sessionCacheIdentity` (authoritative session boundary)
- `resetTraceCoordinator` on run switch
- `resetPhase63FMarketLoadOwner` on run switch (via existing paths)

---

## 3. Forbidden

- Edit bridge/runtime to add new lifecycle hooks for this slice
- If deletion requires bridge change → **BLOCKED**, stop slice

---

## 4. Acceptance checks

| Check | Criterion |
|---|---|
| Run switch + variant switch | `workbenchLoad.test.tsx` |
| No stale render slices after switch | Render-window tests |
| Line delta | ~20–40 lines |
| Build | `npm run build` |

---

## 5. STOP FOR REVIEW
