# Implementation tasks — strategy-level contexts v1

## Architectural anchors (read before coding)

| Topic | Target state |
|-------|----------------|
| **Where context provider lives** | `strategy.contexts[<context_ref>]` only (`htf`, `macro_htf`, …). |
| **Exit policy** | Consumer via `context_consumption`; no `exit_policy.context`. Profile exits require consumption. |
| **Any component as consumer** | Optional `context_consumption` when catalog supports; each picks its own `context_ref`. |
| **Frontend** | Strategy contexts section; explicit `context_ref` everywhere; no legacy exit provider form. |
| **API / catalog** | Reject `exit_policy.context`; validate profile exits + consumption rule. |
| **Diagnostics** | Phase 4 trace/v5; v3/v4 reports read-only; old config not authorable in Composer. |
| **Legacy configs** | One-off script or manual migration only — **no** runtime dual-read or loader shim. |

**Do not implement until OpenSpec review is complete.**

---

## Phase 1 — Research target shape + equivalence

- [x] 1.1 Add `StrategyContextsSpec` / `ContextProviderSpec` and root `contexts` field with default `{}`
- [x] 1.2 Implement `ContextBundle` + `ContextOutput` (`research/strategies/ema_pullback/context/`)
- [x] 1.3 Wire feature plan and `htf_context` provider from `strategy.contexts` only
- [x] 1.4 Add `ContextConsumptionSpec` on `ExitPolicySpec`; remove `HtfContextConfigSpec` from exit policy
- [x] 1.5 Implement `exit_profile_by_htf_state` policy; refactor exit compiler to use bundle + consumption
- [x] 1.6 Loader/API validation: reject `trade_management.exit_policy.context` (hard error)
- [x] 1.7 Loader/API validation: reject non-empty profile exits without `exit_policy.context_consumption`; allow always_on-only without consumption
- [x] 1.7a Loader/API validation: `context_ref` keys are case-sensitive and used as-is (no normalization collisions)
- [x] 1.8 Migrate default templates and examples to `strategy.contexts` + `exit_policy.context_consumption` (target shape in-repo)
- [x] 1.9 Equivalence pytest: target-shape JSON vs pre-change baseline (trades, `active_exit_profile`) — fixtures migrated offline, not dual-read
- [x] 1.10 Optional: add **one-off** CLI migration script (`scripts/migrate_exit_context_to_strategy_contexts.py` or similar) — not called by loader/runtime

## Phase 2 — research_api + Composer

- [x] 2.1 Catalog: `strategy_contexts` section; remove `exit_policy_context` provider section; consumption metadata per `(role, component_id)`
- [x] 2.2 Shared validate function (research + BFF): `context_ref`, policies, reject `exit_policy.context`, profile-exits rule
- [x] 2.3 Frontend: Strategy contexts section (add/edit/remove `context_ref` providers)
- [x] 2.4 Frontend: Exit policy — remove provider fields; `context_consumption` UI; require consumption when profile exits non-empty
- [x] 2.5 Frontend: No auto-select `context_ref`; strip optional entry `context_consumption` when disabled
- [x] 2.5a Frontend: Render entry `context_consumption` only for component_ids already enabled in catalog (before Phase 3 this may be none or exit-only)
- [x] 2.6 Vitest: Composer saves target shape only; rejects `exit_policy.context`; rejects profile exits without consumption

## Phase 3 — Reference entry consumer

- [x] 3.1 Register first entry policy (e.g. `htf_state_gate`) for one role (blocker or setup)
- [x] 3.2 Apply policy in entry pipeline for reference component when `context_consumption` present (same `component_id`, no `htf_gated_*`)
- [x] 3.3 Catalog: mark reference component `supports_context_consumption` + policy schema
- [x] 3.4 Tests: policy param changes alter entry mask; omitting `context_consumption` restores baseline for that component
- [x] 3.5 Tests: unknown `context_ref` fails validation (no fallback)

## Phase 4 — Diagnostics, chart, report schema v5

- [x] 4.1 Emit `context_consumption_trace` in signal trace builder
- [x] 4.2 Add `entry_context_consumption` / `exit_context_consumption`; bump `report_schema_version` to 5 for new runs
- [x] 4.3 Keep v3/v4 readers accepting missing v5 fields; document historical vs authoring split
- [x] 4.4 Chart: explicit `context_overlay_ref` (or picker / consumer-attributed overlay) — no first-provider default
- [x] 4.5 Chart bar inspector / trade diagnostics: per-consumer `context_ref`, `policy_id`, `context_applied`
- [x] 4.6 `signal_trace_service`: HTF meta from `strategy.contexts` by explicit ref
- [x] 4.7 Integration test: trace proves `context_applied`; entry vs exit attribution separated
- [x] 4.8 Manual Workbench: validate → run → Reports + Chart with explicit overlay ref
- [x] 4.9 Ensure loading historical reports with embedded `exit_policy.context` never populates Composer draft in legacy shape

## Cross-cutting

- [ ] X.1 Document target instance JSON and one-off migration script in `research/strategies/ema_pullback/README.md`
- [ ] X.2 Confirm no runtime dual-read / shim code paths remain
- [ ] X.3 OpenSpec archive after all phases merged and acceptance criteria checked
