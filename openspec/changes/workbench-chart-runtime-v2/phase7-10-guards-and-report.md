# Phase 7.10 — Guards, Line Count, Final Report

**Status:** OpenSpec — docs only  
**Slice:** 7.10 (final)  
**Maps to:** `tasks.md` §8.10–8.14  
**Ownership report:** §8 acceptance, §11 checklist  
**Depends on:** 7.01–7.09 (7.08 if unblocked)

---

## 1. Goal

Close Phase 7 deletion-only track: update guards, record line counts, verify smoke references.

---

## 2. Work items

| Item | Action |
|---|---|
| Static guards | Update `phase6StaticGuards.test.ts` — assert deleted mirrors absent; assert `phase63*Owner` **still present** |
| Single-owner contract | Update `phase6SingleOwnerContract.test.ts` — forbidden symbols stay forbidden; no provider relocation assertions |
| Line count | Record `WorkbenchContext.tsx` lines vs 2,202 baseline and vs 3,095 design baseline |
| BLOCKED report | Document B1–B8 still blocked; realistic deletion delta vs −1,000 goal |
| Smoke | Reference Phase 6.4 artifacts; re-capture only if 7.01–7.07 changed behavior |
| Report file | Add `phase7-deletion-only-report.md` with checklist results |

---

## 3. Acceptance checks

| Check | Criterion |
|---|---|
| No new `WorkbenchChart*` files | `git ls-files` |
| Runtime modules unchanged | `git diff` excludes `workbenchChartRuntime/*Runtime.ts`, `phase63*Bridge.ts`, `chartRuntimeCutoverConfig.ts` |
| `npm run build` | Pass |
| `workbenchLoad.test.tsx` + bridge tests | Pass |
| `executeMarketWindowLoad` / `composeDisplayMarketWindowBundle` / `buildChartViewModel` | Absent from `WorkbenchContext.tsx` |

---

## 4. Forbidden

- Mark Phase 7 complete if only docs merged (this OpenSpec change) without implementation slices
- Claim −1,000 line reduction if not achieved

---

## 5. STOP FOR REVIEW

Final gate before Phase 8 legacy field trim.
