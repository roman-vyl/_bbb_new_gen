# Phase 7.04 — Delete Viewport Mirror State

**Status:** OpenSpec — docs only  
**Slice:** 7.04  
**Maps to:** `tasks.md` §8.4  
**Ownership report:** §5.2 (`chartViewportCommand`, `chartViewportCommandSeq`)  
**Depends on:** 7.01 merged (orthogonal to trace; may parallel 7.03 after 7.01)

---

## 1. Goal

Delete viewport **command mirror React state** from `WorkbenchContext.tsx`. Commands stay owned by `phase63CViewportOwnerRef` / `viewportRuntime`.

---

## 2. Delete from WorkbenchContext

| Symbol | Approx lines | Replacement |
|---|---|---|
| `useState` `chartViewportCommand` | 491 | Read `phase63CViewportOwner().viewportState.pendingCommand` (or bridge export) |
| `useState` `chartViewportCommandSeq` | 492 | Read `phase63CViewportOwner().viewportState.commandSeq` |
| `setChartViewportCommand(null)` in acknowledge | 1095–1096 | Bridge acknowledge only; derive null from owner |
| `setChartViewportCommandSeq` in `emitChartViewportCommand` | 1091–1092 | Read seq from owner after dispatch |

### Keep

- `phase63CViewportOwnerRef`
- `emitChartViewportCommand`, `acknowledgeChartViewportCommand`, `dispatchChartInteraction`
- Viewport swap transaction callbacks

---

## 3. Forbidden

- Delete viewport owner or interaction dispatch (BLOCKED B4/B6)
- Edit `phase63CViewportCommandBridge.ts`, `viewportRuntime.ts`

---

## 4. Acceptance checks

| Check | Criterion |
|---|---|
| Viewport commands reach ChartPanel | Trade focus smoke / `workbenchLoad.test.tsx` viewport tests |
| `chartViewportCommand` still exposed on `chartValue` | Derived from owner, not `useState` |
| Line delta | ~20–40 lines |
| Build | `npm run build` |

---

## 5. BLOCKED if

- ChartPanel re-render requires mirror `useState` ticks and owner reads do not trigger updates → document; may need minimal `renderWindowRevision`-style owner subscription **without** new module.

---

## 6. STOP FOR REVIEW
