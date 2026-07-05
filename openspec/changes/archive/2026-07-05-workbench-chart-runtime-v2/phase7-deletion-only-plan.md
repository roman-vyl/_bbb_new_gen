# Phase 7 — WorkbenchContext Deletion-Only Cleanup

**Status:** **DEFERRED** — not part of runtime-v2 refactor acceptance (see `final-architecture-summary.md` §8)  
**Branch:** merged to main production path  
**Prerequisite:** Phase 6.5 + trade-navigation acceptance (`f43b794`, `146f599`) — **met**  
**Baseline:** `WorkbenchContext.tsx` ≈ **1,947 lines**; `WorkbenchRenderViewportContext.tsx` ≈ **800 lines** (post-extraction)

---

## Policy update (2026-07-05)

Phase 7 was planned as mirror-state deletion from `WorkbenchContext.tsx` after 6.3F cutover. The refactor is **accepted complete** without Phase 7 implementation:

- Further shrink is **optional backlog**, not an open refactor task.
- `WorkbenchRenderViewportContext` already extracted 63B/C orchestration (not envisioned in original Phase 7 plan).
- Bridge owner refs (`phase63*OwnerRef`) and load effects **must remain** the React entry until a future explicitly scoped change.

Implement Phase 7 only if a separate OpenSpec change is approved.

---

## 1. Policy (non-negotiable)

Phase 7 **only deletes** dead or redundant chart-glue from `frontend/src/shared/context/WorkbenchContext.tsx`.

The v2 chart pipeline **already exists** in parallel:

- `frontend/src/features/workbenchChartRuntime/phase63*Bridge.ts` — production React→runtime wiring API
- `frontend/src/features/workbenchChartRuntime/*Runtime.ts` — pure domain owners
- `chartRuntimeCutoverConfig.ts` — all six domains `runtime_v2_production` at 6.3F

Phase 7 does **not** build a third pipeline.

### Allowed in Phase 7 implementation PRs

- Delete symbols, state, refs, memos, effects, callbacks, and imports from `WorkbenchContext.tsx`
- Replace deleted **mirror** React state with reads from existing `phase63*Owner` refs via existing bridge `resolve*` helpers (same file, no new modules)
- Update static guards / tests that assert on deleted symbols
- Shrink `chartValue` compatibility fields **only** when no consumer reads them (verify with grep + tests)

### Forbidden in Phase 7

| Forbidden | Reason |
|---|---|
| New `WorkbenchChart*Provider` | Relocation, not deletion |
| `WorkbenchChartOrchestration` | Relocation, not deletion |
| `workbenchContextShared` split | Relocation, not deletion |
| New `*Runtime.ts` modules | Runtime already built |
| Changes to `phase63*Bridge.ts` | Runtime code frozen |
| Changes to `*Runtime.ts` | Runtime code frozen |
| Changes to `chartRuntimeCutoverConfig.ts` | Cutover frozen |
| Backend / `data_engine` | Out of scope |
| `ChartPanel.tsx` changes | Phase 8 / separate contract |
| Production `useWorkbenchChartRuntime` wiring | Pipeline v3 |

### Slice rule

Each slice = **one reviewed PR** that deletes a coherent block from `WorkbenchContext.tsx`.

If a slice cannot be completed by deletion (and in-file `resolve*` reads) alone → mark **BLOCKED**. Do not propose a new layer.

---

## 2. What is deletable vs what stays

At 6.3F + render viewport extraction, `WorkbenchContext` is still the **sole React entry** for 63D/63E/63F. `WorkbenchRenderViewportContext` owns 63B/63C.

| Category | Examples | Phase 7 action |
|---|---|---|
| **Mirror React state** | `marketLoadStatus` useState mirroring `owner.controller.status` | **Delete** — read via `resolvePhase63FMarketReactSync` |
| **Duplicate pre-bridge memos** | `intendedRunMarketView` when bridge resolves view | **Delete** — use `resolvePhase63FMarketView` at point of use |
| **Lanes/trace mirror + duplicate derivations** | `signalTrace` useState + `lanesSignalTrace*` memos | **Delete** — use `resolvePhase63DLanesSnapshot` |
| **Viewport mirror state** | `chartViewportCommand` useState in WorkbenchContext | **DONE** — moved to `WorkbenchRenderViewportContext` |
| **Revision tick mirrors** | `renderWindowShiftSeq`, `displayApplyRevision`, `auxOverlayRevision` | **Partial** — render viewport owns shift seq |
| **Transitional glue** | `stabilizeCaches` manual slice reset | **Delete** when bridge/runtime owns lifecycle |
| **Legacy compat duplicates in `chartValue`** | `chartCandles` when `chartViewModel.candles` suffices | **Phase 7.08** or **BLOCKED → Phase 8** |
| **Bridge owner refs + load effects** | `phase63FMarketLoadOwnerRef`, `runPhase63FMarketLoad` effect | **KEEP** — BLOCKED for removal |
| **Shell / report / composer / selection** | runs, trades, config, tabs | **KEEP** — permanent provider ownership |
| **WorkbenchRenderViewportContext** | 63B/C orchestration | **KEEP** — not Phase 7 deletion target |

---

## 3. Slice index

| Slice | Doc | Est. lines removed | Status |
|---|---|---:|---|
| **7.01** | `phase7-a1-market-load-provider.md` | ~80–120 | **DEFERRED** |
| **7.02** | `phase7-02-market-identity-memos.md` | ~40–60 | **DEFERRED** |
| **7.03** | `phase7-03-trace-mirror-deletion.md` | ~60–90 | **DEFERRED** |
| **7.04** | `phase7-04-viewport-mirror-deletion.md` | ~20–40 | **SUPERSEDED** — viewport moved to render viewport context |
| **7.05** | `phase7-05-render-window-mirror-deletion.md` | ~30–50 | **PARTIAL** — render window in render viewport context |
| **7.06** | `phase7-06-aux-overlay-mirror-deletion.md` | ~15–25 | **DEFERRED** |
| **7.07** | `phase7-07-transitional-glue-deletion.md` | ~20–40 | **DEFERRED** |
| **7.08** | `phase7-08-chartvalue-compat-trim.md` | ~40–80 | **BLOCKED** → Phase 8 backlog |
| **7.09** | `phase7-09-obsolete-imports.md` | ~10–30 | **DEFERRED** |
| **7.10** | `phase7-10-guards-and-report.md` | — | **DEFERRED** |

**Cumulative realistic deletion-only target:** ~300–450 lines from pre-extraction baseline (not −1,000).

---

## 4. BLOCKED slices (do not implement under Phase 7)

| ID | What ownership report §8 called | Why BLOCKED |
|---|---|---|
| **B1** | Relocate market load effect to provider | Requires new React module (forbidden) |
| **B2** | Relocate trace load effect to provider | Same |
| **B3** | Relocate aux/HTF effects to provider | Same |
| **B4** | Relocate render/viewport effects to provider | **Done** via `WorkbenchRenderViewportContext` (separate from Phase 7 policy) |
| **B5** | Replace owner refs with `useWorkbenchChartRuntime` production | Pipeline v3 (forbidden) |
| **B6** | Delete `phase63*OwnerRef` while effects remain | Breaks sole React entry |
| **B7** | Cutover config / telemetry simplification | `chartRuntimeCutoverConfig.ts` frozen |
| **B8** | −1,000 lines via deletion-only | Needs B1–B6; not refactor acceptance criteria |
