# Archive Note — workbench-chart-runtime-v2

**Archived:** 2026-07-05  
**Change schema:** spec-driven (`.openspec.yaml`)  
**Archive location:** `openspec/changes/archive/2026-07-05-workbench-chart-runtime-v2/`

---

## Canonical spec (current architecture)

The **permanent promoted spec** is:

`openspec/specs/workbench-chart-runtime-v2/spec.md`

That file is the canonical description of the **current production** Workbench Chart runtime v2 architecture. This archived change directory contains **history only**: phase reports, cutover evidence, `final-architecture-summary.md`, and the original delta spec under `specs/`.

Do not treat archived `proposal.md`, `design.md`, or delta `specs/workbench-chart-runtime-v2/spec.md` as active requirements when they diverge from the promoted main spec.

---

## What was delivered

The Workbench Chart tab runs entirely on **runtime v2** (`frontend/src/features/workbenchChartRuntime/`) with staged cutover phase **6.3F** complete. Chart domain behavior is owned by `*Runtime.ts` modules and `phase63*Bridge.ts` production wiring.

Post-cutover stabilization added:

- **`WorkbenchRenderViewportContext`** — Phase 63B/C React orchestration extracted from `WorkbenchContext`
- **Readiness-gated trade focus** — `phase63TradeFocusBridge` + orchestrator in render viewport context
- **Outside-window trade navigation** — demand-load + cache chunk coalescing (`f43b794`)
- **Inside-window trade navigation** — no spurious market loading reset; forced focus without render-window shift (`146f599`)

Historical detail: **`final-architecture-summary.md`** in this archive.

---

## What was NOT delivered (intentionally deferred)

| Planned slice | Status | Reason |
|---|---|---|
| Phase 7 deletion-only (`phase7-deletion-only-plan.md`) | **DEFERRED** | Mirror deletion optional; bridge refs must remain |
| Phase 8 compat / shadow removal | **DEFERRED** | Separate cleanup; `chartValue` trim blocked on consumer audit |
| `WorkbenchContext` −1000 lines | **NOT MET** | Full −1000 required relocating bridge effects (forbidden in Phase 7 policy) |
| Production `useWorkbenchChartRuntime` hook | **NOT DONE** | Pipeline v3; rejected under Phase 7 policy |

---

## Rejected experiments (do not resurrect)

1. Treating every `visible_range_changed` as user pan
2. Keyboard pan as the main trade-navigation fix
3. Synchronous `focusTrade` from `selectTrade`
4. Restoring WorkbenchContext-owned market mirror state as authoritative
5. Serving stale bundle for a new trade focus target without demand-load
6. Relying on chunk eviction without coalescing (coverage holes)

---

## Task completion at archive time

| Section | Status |
|---|---|
| Phase 0–1 (baseline / approval) | Done (historical) |
| Phase 2–5 (skeleton + parity) | Done |
| Phase 6.3-debug through 6.3F | Done |
| Phase 6.4 smoke matrix | Done (`phase6-4-smoke-summary.md`) |
| Phase 6.5 ownership report | Done (`phase6-5-ownership-report.md`) |
| Trade navigation acceptance (`f43b794`, `146f599`) | Done |
| Phase 7 mirror deletion | **Rejected as refactor scope** → backlog |
| Phase 8 final cleanup | **Deferred** → backlog |
| Archive move | **Done** |
| Promoted main spec | **Done** — `openspec/specs/workbench-chart-runtime-v2/spec.md` |

---

## Archive readiness checklist

- [x] Final architecture documented (`final-architecture-summary.md`)
- [x] Rejected approaches explicitly listed
- [x] `tasks.md` updated: active work done; Phase 7–8 deferred
- [x] No contradictory “current architecture” claims for rejected experiments
- [x] Acceptance criteria mapped to tests/smokes
- [x] Remaining backlog separated from refactor scope
- [x] Archive move completed
- [x] Permanent spec promoted to `openspec/specs/workbench-chart-runtime-v2/spec.md`

---

## Reviewer one-liner

**Runtime v2 is production.** Canonical spec: `openspec/specs/workbench-chart-runtime-v2/spec.md`. WorkbenchContext is shell + 63D/63E/63F wiring; render/viewport/trade-focus live in `WorkbenchRenderViewportContext`. Trade nav = demand-load + readiness-gated focusTrade; user pan = interaction FSM gate, not bare `visible_range_changed`.
