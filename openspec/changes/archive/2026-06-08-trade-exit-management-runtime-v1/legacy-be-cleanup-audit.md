# Legacy BE cleanup audit (Slice 9)

Change: `trade-exit-management-runtime-v1` · OpenSpec §6.

## Reference scan (categories)

### Runtime compatibility backend (unchanged in Slice 9)

| Location | Role |
|----------|------|
| `research/strategies/ema_pullback/execution/exit_management.py` | Legacy managed combiner runtime |
| `research/strategies/ema_pullback/spec.py` | Parses legacy `always_on/profiles/rules` + new `mode/phase_rules/...` |
| `research/strategies/ema_pullback/instance_loader.py` | JSON loader for both shapes |
| `research/strategies/ema_pullback/component_builders.py` | `break_even_stop_rule()` test/build helpers |
| `research/strategies/ema_pullback/components/registry.py` | `break_even_stop` placeholder registration |

### Deprecated compatibility tests (kept, labeled)

| Location | Role |
|----------|------|
| `tests/test_exit_management.py` | Legacy combiner validation + BE semantics |
| `tests/test_exit_management_extended.py` | Trace/report/backtest with legacy BE |
| `tests/test_exit_management_contracts.py` | New `diagnostic_only` contract (product) |

### Frontend / Composer authoring (cleaned in Slice 9)

| Location | Before | After |
|----------|--------|-------|
| `research_api/services/component_catalog.py` | `break_even_stop` in catalog | Removed from authoring catalog |
| `frontend/.../composerDraft.ts` | Blank `always_on/rules` groups | `diagnostic_only` + `phase_rules` + reserved lists |
| `frontend/.../ComposerPanel.tsx` | List add/remove for legacy BE rules | Product panel only; no legacy add UI |
| `frontend/.../composerDraft.ts` `componentsForRole` | All `exit_management` components | Filters deprecated IDs |

### Catalog / schema / product labels

| Location | Slice 9 action |
|----------|----------------|
| `research_api/.../component_catalog.py` section labels | Mark legacy runtime sections deprecated |
| `frontend/.../composerExitManagementProduct.ts` | Product contract constants + legacy detection |
| `frontend/.../ExitManagementProductPanel.tsx` | User-facing product vs legacy messaging |

### Report / chart read paths (unchanged — historical data)

| Location | Role |
|----------|------|
| `trade_records[].break_even` | Report diagnostics from managed path |
| `frontend/.../tradeDiagnosticsFields.ts` | Read-only display |
| `frontend/.../exitManagementBarInspector.ts` | Signal trace internals |

### Docs / OpenSpec (updated)

| Location | Slice 9 action |
|----------|----------------|
| `openspec/changes/.../tasks.md` §6 | Marked complete |
| `openspec/specs/composer-exit-management/spec.md` | Still describes old BE authoring — superseded at product layer until archive merges delta |

## Slice 9 deliverables

1. **6.1** — `break_even_stop` removed from BFF authoring catalog (not from runtime parser).
2. **6.2** — Composer no longer lists/adds legacy BE; loaded legacy configs show warning only.
3. **6.3** — Blank draft + product panel document `mode` / `phase_rules` / reserved lists.
4. **6.4** — Backend compatibility tests retained with deprecated module docstrings; new API test asserts catalog exclusion.

## Explicit non-goals (Slice 9)

- No execution behavior change
- No removal of backend legacy parser/runtime
- No phase_rules Composer editor
- No OpenSpec archive in this slice

## Residual (intentional, not a blocker)

`research_api/services/component_catalog.py` still defines legacy **exit-management sections** with `role="exit_management"` (`exit_management_always_on`, profile buckets). The **`break_even_stop` component was removed** from the catalog; Composer no longer renders rule-list authoring for those sections (product panel only). Empty `componentsForRole(..., "exit_management")` means those sections are inert for add-component UX.

**Follow-up (deeper cleanup, later):** remove or repurpose the legacy section schemas when catalog/Composer section wiring is next refactored — not required for Slice 9 product semantics.
