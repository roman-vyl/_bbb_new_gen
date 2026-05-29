## Context

`side-relative-context-regimes-v1` (archived) added backend policy `htf_regime_gate` with mandatory `params.allowed_regimes` and centralized side-relative mapping in research. `research_api` component catalog already lists `htf_regime_gate` on catalog-supported blockers with `params_schema.allowed_regimes.enum`.

Strategy Composer already has catalog-driven `ContextConsumptionSection`, `ParamFields` array-enum multiselect, and explicit empty `context_ref` on enable. Gaps: entry-consumer draft validation for consumption when enabled, tests covering `htf_regime_gate` roundtrip, diagnostics display of regime fields, and verified browser acceptance.

Reference: `openspec/specs/context-consumption-policy/spec.md`, `openspec/changes/archive/2026-05-29-side-relative-context-regimes-v1/`.

## Goals / Non-Goals

**Goals:**

- Catalog-driven policy pickers include `htf_regime_gate` when catalog exposes it for `(role, component_id)`.
- Author `allowed_regimes` via multiselect; reject empty selection before save.
- Load/save roundtrip preserves `context_ref`, `policy_id`, `allowed_regimes` without rewriting `htf_state_gate` configs.
- Show backend diagnostic fields for `htf_regime_gate` without recomputing mapping.
- Vitest + Playwright/MCP acceptance evidence.

**Non-Goals:**

- Backend evaluator, provider output, or catalog registration changes (unless metadata gap blocks UI).
- Auto-migration `htf_state_gate` → `htf_regime_gate`.
- Frontend computation of `aligned`/`countertrend` from raw `up`/`down`.
- `data_engine/` changes.

## Decisions

### D1 — Reuse `ParamFields` for `allowed_regimes`

**Choice:** Keep generic `ParamFields` + catalog `params_schema`; no policy-specific React branch unless schema cannot express multiselect.

**Rationale:** `allowed_regimes` is `type: array` with `enum` — same control as `allowed_states`. Catalog is source of truth for labels and allowed values.

### D2 — Client draft validation in `composerStrategyContexts`

**Choice:** Extend `collectComposerStrategyErrors` (and helpers) to validate enabled entry `context_consumption`: required `context_ref`, `policy_id`, and policy-specific params (`allowed_regimes` non-empty for `htf_regime_gate`; do not require `allowed_states` on regime policy).

**Rationale:** Mirrors backend rules; prevents obviously invalid payloads before API validate. No mapping logic — only shape checks using catalog `policy_id` string match.

### D3 — Policy switch clears params

**Choice:** On `policy_id` change, reset `params` to `{}` (existing behavior).

**Rationale:** Avoids carrying `allowed_states` into `htf_regime_gate` save payload.

### D4 — Diagnostics display additive

**Choice:** In bar inspector / trade diagnostics, render optional trace fields (`allowed_regimes`, `raw_state`, `evaluated_side`, `resolved_regime`) when present on trace records.

**Rationale:** Display-only; no client-side derivation.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Test mocks omit `htf_regime_gate` | Update catalog fixtures to match live API |
| ParamFields applies default for arrays with default | `allowed_regimes` has no catalog default — empty until user selects |
| Duplicate validation vs API | Client checks shape only; API remains authoritative |

## Migration Plan

No data migration. Existing strategies with `htf_state_gate` unchanged. Authors manually adopt `htf_regime_gate` where needed.

## Open Questions

None — backend catalog already exposes policy on blockers.
