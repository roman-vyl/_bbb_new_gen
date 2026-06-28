# Phase 7.02 — Delete Market Identity Duplicate Memos

**Status:** OpenSpec — docs only  
**Slice:** 7.02  
**Maps to:** `tasks.md` §8.2  
**Ownership report:** §5.1 (`resolveRunMarketView` / `buildRunMarketViewIdentity` memos)  
**Depends on:** 7.01 merged

---

## 1. Goal

Delete duplicate market **identity/view memos** in `WorkbenchContext.tsx` where `phase63FMarketLoadBridge` / `marketViewRuntime` already resolves the same data.

Deletion-only — no new modules.

---

## 2. Delete from WorkbenchContext

| Symbol / block | Approx lines | Replacement |
|---|---|---|
| `intendedRunMarketView` `useMemo` | 821–833 | `resolvePhase63FMarketView` at effect/read site |
| `intendedRunMarketViewIdentity` `useMemo` | 835–838 | `buildRunMarketViewIdentity` on resolved view |
| Duplicate `expectedRunMarketViewIdentity` if identical to bridge input | 700–722 | Collapse to single read path |
| `logPhase63FComposeFocusFallback` effect inputs duplicated from memos | 1019–1059 | Pass owner + bridge resolver output |

### Keep

- `expectedRunMarketViewIdentity` **if** still required by trace bootstrap with different gating than `intendedRunMarketViewIdentity` — audit before delete
- All `phase63F` effects and owner ref

---

## 3. Forbidden

Same global forbidden list as `phase7-deletion-only-plan.md` §1.

---

## 4. Acceptance checks

| Check | Criterion |
|---|---|
| No standalone `intendedRunMarketView` memo | Unless proven required for non-market consumers |
| `resolvePhase63FMarketView` used from bridge import | No direct `resolveRunMarketView` duplication |
| Trace bootstrap still works | `workbenchLoad.test.tsx`, chart-events tests |
| Line delta | ~40–60 lines |
| Build | `npm run build` |

---

## 5. BLOCKED if

- Removing memos forces new React module to cache view across effects → stop, mark BLOCKED, do not create provider.

---

## 6. STOP FOR REVIEW

**Do not start 7.03 until 7.02 is merged.**
