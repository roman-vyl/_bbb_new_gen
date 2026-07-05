# Phase 7.08 — Trim chartValue Compatibility Duplicates

**Status:** **BLOCKED** (pending consumer audit) — OpenSpec only  
**Slice:** 7.08  
**Maps to:** `tasks.md` §8.8  
**Ownership report:** §5.4 (`chartValue` mega-memo, legacy duplicate fields)  
**Overlaps:** Phase 8 (`design.md` §6 legacy field trim)

---

## 1. Goal

Delete **duplicate legacy fields** from `chartValue` when consumers read `chartViewModel` (or bridge snapshot) instead.

---

## 2. Candidate deletions (after audit)

| Field on `chartValue` | Duplicate of | Consumer check |
|---|---|---|
| `chartCandles` | `chartViewModel.candles` | `ChartPanel` uses `chartViewModel` — field may be redundant |
| `chartEmaOverlays` | `chartViewModel.emaOverlays` | Same |
| `chartAuxEmaOverlays` / `chartDisplayAuxEmaOverlays` | model slice | Grep all consumers |
| `chartDisplayComponentEvents` | `chartViewModel.componentEvents` | Same |
| `chartViewMode`, `chartViewCenterTimeSec`, … | `chartViewModel.*` | Tests + `ChartBarInspector` |

---

## 3. Why BLOCKED

- `ChartPanel` still destructures `lanesSignalTrace*` separately from `chartViewModel`
- Multiple integration tests assert legacy field names on `useWorkbenchChart()`
- Removing fields without consumer migration is a **contract break**, not glue deletion

**Unblock when:** grep proves zero production consumers for a field; tests updated in same PR.

---

## 4. Forbidden

- `ChartPanel.tsx` changes in Phase 7.08 unless explicitly approved as consumer migration slice (separate from deletion-only policy)

---

## 5. Acceptance checks (when unblocked)

| Check | Criterion |
|---|---|
| Field removed from `WorkbenchChartState` type | Typecheck |
| No grep hits for removed field in `frontend/src` | Except tests updated |
| Line delta | ~40–80 lines |
| Build + full smoke | Pass |

---

## 6. STOP FOR REVIEW

Do not implement until BLOCKED status cleared.
