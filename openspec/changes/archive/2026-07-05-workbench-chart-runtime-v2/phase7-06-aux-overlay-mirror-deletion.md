# Phase 7.06 — Delete Aux Overlay Mirror Revision

**Status:** OpenSpec — docs only  
**Slice:** 7.06  
**Maps to:** `tasks.md` §8.6  
**Ownership report:** §5.3 (`auxOverlayRevision`, HTF/BFF effect mirror bumps)  
**Depends on:** 7.01 merged

---

## 1. Goal

Delete `auxOverlayRevision` and related bump-only state from `WorkbenchContext.tsx`. Aux/HTF behavior stays in `phase63EAuxOverlayBridge` → `auxOverlayRuntime`.

---

## 2. Delete from WorkbenchContext

| Symbol | Approx lines | Replacement |
|---|---|---|
| `auxOverlayRevision` `useState` + `setAuxOverlayRevision` bumps | 428, 1395–1545 | Read overlay generation from `phase63EAuxOverlayOwner().controller` |
| Redundant `resetPhase63EAuxOverlayOwner` + revision bump pairs | 1562–1563, 1618 | Owner reset only |

### Keep

- `phase63EAuxOverlayOwnerRef`
- BFF aux / HTF sync effects calling bridge functions
- `contextOverlayRef` state (permanent provider UI glue — §6.1)

---

## 3. Forbidden

- Delete aux effects or owner ref (BLOCKED B3)
- Edit `phase63EAuxOverlayBridge.ts`, `auxOverlayRuntime.ts`

---

## 4. Acceptance checks

| Check | Criterion |
|---|---|
| HTF/context overlay smoke | Phase 6.4 aux overlay evidence |
| `phase63EAuxOverlayBridge.test.ts` | Pass unchanged |
| Line delta | ~15–25 lines |
| Build | `npm run build` |

---

## 5. STOP FOR REVIEW
