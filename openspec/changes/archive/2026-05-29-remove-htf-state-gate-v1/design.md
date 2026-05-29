## Context

`side-relative-context-regimes-v1` introduced `htf_regime_gate` and the shared evaluator path (`resolve_htf_regime`, `evaluate_context_consumption`). `htf_state_gate` remained temporarily for raw-state allowlists. Authors now standardize on side-relative regime gating only.

## Goals / Non-Goals

**Goals**

- Remove `htf_state_gate` as a registered consumer policy everywhere (catalog, loader, evaluator, UI).
- Preserve provider raw `htf_state` output and `exit_profile_by_htf_state` via shared evaluator.
- Fail fast on legacy `htf_state_gate` configs.

**Non-Goals**

- Auto-migrate old configs.
- Change `ContextProvider` output or add frontend regime mapping.
- Touch `data_engine/`.
- Remove archived OpenSpec history mentioning `htf_state_gate`.

## Decisions

1. **Provider unchanged** — `htf_context` continues emitting raw `up/down/neutral`; no long/short awareness in provider layer.
2. **Single HTF context consumption policy** — `htf_regime_gate` with mandatory non-empty `allowed_regimes`.
3. **Legacy unsupported** — loader/API validation reject `policy_id: htf_state_gate`; old reports may show missing/invalid policy in diagnostics.
4. **No `allowed_states` in authoring** — param removed from catalog schema and saved payloads.

## Risks / Trade-offs

- **Breaking existing saved configs** → Accepted; authors recreate with `htf_regime_gate`.
- **Old signal traces** with `htf_state_gate` outcome fields → Diagnostics no longer surface `allowed_states`; raw_state/regime fields remain for new runs.

## Migration Plan

1. Deploy catalog + validation removal.
2. Authors reopen strategies in Composer; select `HTF regime gate` and set `allowed_regimes`.
3. Re-run backtests; discard old reports tied to `htf_state_gate`.

No automated migration script.
