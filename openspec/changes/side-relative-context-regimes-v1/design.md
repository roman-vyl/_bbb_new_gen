## Context

`strategy-level-contexts-v1` established provider vs consumer separation: providers emit raw HTF state; consumers own `context_consumption.policy`. Blocker reference policy `htf_state_gate` filters `allowed_states` against raw `up/down/neutral` without regard to evaluated side. Signal trace builds **per-side** `_build_side_trace(..., side=long|short)` but applies `apply_htf_state_gate(...)` without passing `side`, so `allowed_states: ["up"]` blocks shorts on raw up bars (countertrend for short) and allows longs (aligned) — opposite of author intent when thinking in regimes.

Exit policy already maps raw state → aligned/countertrend/neutral via `exit_profile_by_htf_state` and `_active_rule_group_for_side` in `policies.py`. This change adds a **symmetric gate policy** for blockers/setup/trigger consumers without moving mapping into providers or Composer.

## Goals / Non-Goals

**Goals:**

- Introduce `htf_regime_gate` with `allowed_regimes` and documented mapping table.
- Extend consumer policy evaluation contract to pass **evaluated trade side** into regime gate handlers.
- Enrich diagnostics so forensics show raw state, side, resolved regime, and pass/fail.
- Keep `htf_state_gate` for authors who explicitly want raw-state filtering.

**Non-Goals:**

- Changing provider components or `ContextOutput` shape.
- Automatic migration tooling for existing instances.
- Computing regimes in frontend or Composer as authoritative logic.
- Removing or deprecating `htf_state_gate` in this change.

## Decisions

### D1 — Regime mapping lives in research policy module, not provider

**Choice:** Implement `resolve_htf_regime(raw_state, side) -> aligned|countertrend|neutral` in `research/strategies/ema_pullback/context/policies.py` (reuse logic from `_active_rule_group_for_side`).

**Rationale:** Single source of truth in consumer layer; provider stays market-only.

**Alternative considered:** Duplicate mapping in each blocker component — rejected (drift risk).

### D2 — New policy id `htf_regime_gate`, params `allowed_regimes`

**Choice:** Parallel to `htf_state_gate` / `allowed_states`; default when omitted: all three regimes allowed (mirror `htf_state_gate` defaulting to all raw states).

**Rationale:** Clear author intent; config reads as trading language.

### D3 — Extend policy handler signature with `side: TradeSide`

**Choice:** `apply_htf_regime_gate(output, *, policy, index, side)`; call sites in per-side compile/trace paths pass the side being evaluated.

**Rationale:** Minimal contract change; matches existing per-side signal trace structure.

**Alternative considered:** Pass pre-resolved regime series from compiler — rejected (hides policy params and complicates trace attribution).

### D4 — Per-side trace records for `htf_regime_gate`

**Choice:** When building `context_consumption_trace`, include `evaluated_side` on blocker records using `htf_regime_gate`; optionally split trace by side if one record cannot represent asymmetric outcomes (prefer side field + per-side `context_applied` lists already keyed under `signal_trace.long` / `short`).

**Rationale:** Same raw bar may pass for long and fail for short; diagnostics must not collapse to a single boolean without side context.

### D5 — Catalog and validation parity

**Choice:** Register `htf_regime_gate` in `research_api` component catalog alongside `htf_state_gate` for the same blocker roles; extend `consumption_validation.py` with `validate_htf_regime_gate_params`.

**Rationale:** Composer and API validate only catalog-listed policies.

### D6 — Do not change `exit_profile_by_htf_state`

**Choice:** Exit profile selection keeps existing policy; `htf_regime_gate` is for gating consumers (blockers first), not exit bucket selection.

**Rationale:** Scope control; exit path already side-aware via profile long/short series.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Authors confuse `htf_state_gate` vs `htf_regime_gate` | Catalog labels + docs; keep both; examples in Composer use regimes for blockers |
| Trace shape breaking chart diagnostics | Additive `outcome` fields; frontend displays new fields when present |
| Missing `side` at a call site silently wrong | Type/signature requirement + tests for both sides on same bar |
| Duplication with `_active_rule_group_for_side` | Extract shared `resolve_htf_regime` used by exit profile and regime gate |

## Migration Plan

- **Deploy:** Additive policy registration; existing instances unchanged.
- **Author migration:** Manual — replace raw `allowed_states` with `allowed_regimes` where intent is side-relative; no runtime auto-convert.
- **Rollback:** Remove catalog entry and handler; instances using `htf_regime_gate` fail validation until reverted.

## Open Questions

- Should setup/trigger consumers get `htf_regime_gate` in the same slice as blockers, or blockers-only v1?
- Should `context_consumption_trace` at strategy level duplicate per side or remain under per-side signal trace only?
