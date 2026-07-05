# Phase 7.05 — Delete Render-Window Mirror Revisions

**Status:** OpenSpec — docs only  
**Slice:** 7.05  
**Maps to:** `tasks.md` §8.5  
**Ownership report:** §5.2 (`renderWindowShiftSeq`, `displayApplyRevision`, `renderWindowRevision`)  
**Depends on:** 7.01 merged

---

## 1. Goal

Delete redundant **render-window revision mirror state** from `WorkbenchContext.tsx` where `phase63BRenderWindowOwner` / `renderWindowRuntime` already tracks shifts and apply generations.

---

## 2. Delete from WorkbenchContext

| Symbol | Approx lines | Replacement |
|---|---|---|
| `renderWindowShiftSeq` `useState` + `renderWindowShiftSeqRef` | 438, 493 | `phase63BRenderWindowOwner().controller` shift seq field |
| `displayApplyRevision` `useState` | 437 | Owner display apply revision |
| `renderWindowRevision` `useState` + `bumpRenderWindow` if only mirror | 490, 199–201 area | Owner/controller revision tick |
| `chartDisplayComponentEvents` `useState` + ref if mirrored from 63D/63E | 439–440 | `resolvePhase63EModelRuntimeSlice` / trace display output |

### Keep

- `phase63BRenderWindowOwnerRef`, render init/apply/shift effects
- `applyWindowCommitRef` callback wiring
- `v2ChartRuntime()` / `v2RenderWindow()` accessors

---

## 3. Forbidden

- Delete render-window effects (BLOCKED B4)
- Edit `phase63BRenderWindowBridge.ts`, `renderWindowRuntime.ts`

---

## 4. Acceptance checks

| Check | Criterion |
|---|---|
| Trade focus + left pan | `workbenchLoad.test.tsx`, phase 6.4 pan smoke refs |
| `renderWindowShiftSeq` still on `chartValue` if ChartPanel reads it | Derived from owner |
| Line delta | ~30–50 lines |
| Build | `npm run build` |

---

## 5. STOP FOR REVIEW
