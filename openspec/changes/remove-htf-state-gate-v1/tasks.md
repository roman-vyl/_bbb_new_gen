## 1. OpenSpec

- [ ] 1.1 Delta specs for `context-consumption-policy` and `workbench-strategy-contexts`
- [ ] 1.2 `openspec validate remove-htf-state-gate-v1 --strict`

## 2. Backend / research

- [ ] 2.1 Remove `htf_state_gate` from policies, evaluation, validation, instance loader
- [ ] 2.2 Catalog: only `htf_regime_gate` for blocker HTF gating
- [ ] 2.3 Simplify consumption trace for regime-gate-only blockers

## 3. Frontend

- [ ] 3.1 Remove `htf_state_gate` / `allowed_states` from composer and diagnostics
- [ ] 3.2 Update Vitest mocks and tests

## 4. Tests & verification

- [ ] 4.1 Backend targeted pytest (catalog rejection, regime gate preserved, resolve_htf_regime)
- [ ] 4.2 Frontend tests
- [ ] 4.3 Grep: no active `htf_state_gate` / HTF `allowed_states`
