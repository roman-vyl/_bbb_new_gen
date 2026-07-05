# Phase 7.09 — Delete Obsolete Imports

**Status:** OpenSpec — docs only  
**Slice:** 7.09  
**Maps to:** `tasks.md` §8.9  
**Ownership report:** §5.5, §8 Group B  
**Depends on:** 7.01–7.07 merged

---

## 1. Goal

Remove imports in `WorkbenchContext.tsx` made obsolete by mirror/trace/viewport deletions.

---

## 2. Delete candidates

| Import source | Condition |
|---|---|
| `queueTraceFetchIntent` / `takeCommittedTraceFetchIntent` | After 7.07 verification |
| `resolveRunMarketView` / `buildRunMarketViewIdentity` | After 7.02 if unused |
| `getCandles` | Only if 7.01+ removes all context reads (unlikely — may stay) |
| `signalTraceLoadPolicy` derivations | After 7.03 if lanes read from 63D snapshot only |
| Unused phase63 bridge imports | Per-slice grep after deletions |

---

## 3. Forbidden

- Remove imports still required by kept bridge effects
- Edit bridge/runtime files to match

---

## 4. Acceptance checks

| Check | Criterion |
|---|---|
| No unused import TS errors | `npm run build` |
| `phase6StaticGuards.test.ts` | Still pass |
| Line delta | ~10–30 lines |

---

## 5. STOP FOR REVIEW
