# Phase 7 — WorkbenchContext Deletion-Only Cleanup

**Status:** OpenSpec — docs only, no implementation  
**Branch:** `new-workbench-chart-runtime-v2`  
**HEAD:** `a7b817d2d92ea97ebd11ced860e6ec5abf1e1201`  
**Prerequisite:** Phase 6.5 ownership report approved (`phase6-5-ownership-report.md`)  
**Baseline:** `WorkbenchContext.tsx` = **2,202 lines** at 6.3F (`a7b817d`)

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

At 6.3F, `WorkbenchContext` is still the **sole React entry** that holds `phase63*OwnerRef` and runs bridge `useEffect` cycles. That wiring is **not dead** and must **stay** until a future explicitly scoped cutover (out of Phase 7 deletion-only policy).

| Category | Examples | Phase 7 action |
|---|---|---|
| **Mirror React state** | `marketLoadStatus` useState mirroring `owner.controller.status` | **Delete** — read via `resolvePhase63FMarketReactSync` |
| **Duplicate pre-bridge memos** | `intendedRunMarketView` when bridge resolves view | **Delete** — use `resolvePhase63FMarketView` at point of use |
| **Lanes/trace mirror + duplicate derivations** | `signalTrace` useState + `lanesSignalTrace*` memos | **Delete** — use `resolvePhase63DLanesSnapshot` |
| **Viewport mirror state** | `chartViewportCommand` useState | **Delete** — read from `phase63CViewportOwner` |
| **Revision tick mirrors** | `renderWindowShiftSeq`, `displayApplyRevision`, `auxOverlayRevision` | **Delete** when owner exposes authoritative revision |
| **Transitional glue** | `stabilizeCaches` manual slice reset | **Delete** when bridge/runtime owns lifecycle |
| **Legacy compat duplicates in `chartValue`** | `chartCandles` when `chartViewModel.candles` suffices | **Phase 7.08** or **BLOCKED → Phase 8** |
| **Bridge owner refs + load effects** | `phase63FMarketLoadOwnerRef`, `runPhase63FMarketLoad` effect | **KEEP** — BLOCKED for removal |
| **Shell / report / composer / selection** | runs, trades, config, tabs | **KEEP** — permanent provider ownership |

---

## 3. Slice index

| Slice | Doc | Ownership report | Est. lines removed | Status |
|---|---|---|---:|---|
| **7.01** | `phase7-a1-market-load-provider.md` | §5.1 mirror rows | ~80–120 | Deletable |
| **7.02** | `phase7-02-market-identity-memos.md` | §5.1 pre-bridge memos | ~40–60 | Deletable |
| **7.03** | `phase7-03-trace-mirror-deletion.md` | §5.3 mirror + lanes derivations | ~60–90 | Deletable |
| **7.04** | `phase7-04-viewport-mirror-deletion.md` | §5.2 viewport mirror | ~20–40 | Deletable |
| **7.05** | `phase7-05-render-window-mirror-deletion.md` | §5.2 revision mirrors | ~30–50 | Deletable |
| **7.06** | `phase7-06-aux-overlay-mirror-deletion.md` | §5.3 aux revision mirror | ~15–25 | Deletable |
| **7.07** | `phase7-07-transitional-glue-deletion.md` | §5.3 `stabilizeCaches`, trace orchestrator import | ~20–40 | Deletable (verify) |
| **7.08** | `phase7-08-chartvalue-compat-trim.md` | §5.4 legacy compat fields | ~40–80 | **BLOCKED** until consumer audit |
| **7.09** | `phase7-09-obsolete-imports.md` | §5.5 + §8 Group B | ~10–30 | After 7.01–7.07 |
| **7.10** | `phase7-10-guards-and-report.md` | §8 acceptance | — | Final slice |

**Cumulative realistic deletion-only target:** ~300–450 lines from 2,202 (not −1,000). The −1,000 baseline goal from `design.md` §6 requires removing bridge wiring (BLOCKED under this policy).

---

## 4. BLOCKED slices (do not implement under Phase 7)

| ID | What ownership report §8 called | Why BLOCKED |
|---|---|---|
| **B1** | Relocate market load effect to provider | Requires new React module (forbidden) |
| **B2** | Relocate trace load effect to provider | Same |
| **B3** | Relocate aux/HTF effects to provider | Same |
| **B4** | Relocate render/viewport effects to provider | Same |
| **B5** | Replace owner refs with `useWorkbenchChartRuntime` production | Pipeline v3 (forbidden) |
| **B6** | Delete `phase63*OwnerRef` while effects remain | Breaks sole React entry |
| **B7** | Cutover config / telemetry simplification | `chartRuntimeCutoverConfig.ts` frozen |
| **B8** | −1,000 lines from 3,095 baseline in deletion-only mode | Needs B1–B6 (forbidden) |

Resolve BLOCKED items only in a **future explicitly scoped** change outside Phase 7 deletion-only policy.

---

## 5. Global acceptance (after 7.10)

- [ ] `WorkbenchContext.tsx` line count recorded; delta vs 2,202 documented
- [ ] No new files under `WorkbenchChart*Provider`, `WorkbenchChartOrchestration`, `workbenchContextShared`
- [ ] No changes to `phase63*Bridge.ts`, `*Runtime.ts`, `chartRuntimeCutoverConfig.ts`, backend
- [ ] `executeMarketWindowLoad`, `composeDisplayMarketWindowBundle`, `buildChartViewModel` still absent from `WorkbenchContext.tsx`
- [ ] `phase63*OwnerRef` + bridge effects still present (production wiring intact)
- [ ] `npm run build` passes
- [ ] `phase6StaticGuards.test.ts`, `phase6SingleOwnerContract.test.ts`, `workbenchLoad.test.tsx` pass
- [ ] Phase 6.4 smoke artifacts still valid (re-capture only if behavior changes)

---

## 6. Implementation order

1. 7.01 → 7.07 (mirror and transitional deletions, any order within domain deps)
2. 7.09 (imports, after deletions)
3. 7.08 only if consumer audit unblocks
4. 7.10 (guards + report)

**STOP FOR REVIEW** after each slice PR.

---

## 7. Supersedes

This plan **supersedes** relocation language in `phase6-5-ownership-report.md` §8 Group A ("Relocate into runtime provider"). Phase 7 under deletion-only policy does not relocate — it deletes mirrors and redundant glue only.

**Do not start implementation until this plan is approved.**

**STOP FOR REVIEW**
