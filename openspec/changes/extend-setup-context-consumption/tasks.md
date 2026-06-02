## 1. Strategy contract and validation

- [x] 1.1 Extend setup rule schema/model (`SetupRuleSpec` and API DTOs) with optional `context_consumption` (`context_ref`, `policy.component_id`, policy params).
- [x] 1.2 Enforce setup-role validation: declared `context_ref`, allowed setup policy components, required params for `htf_regime_gate.allowed_regimes`.
- [x] 1.3 Ensure validation rejects legacy/unsupported setup policy IDs (including `htf_state_gate`) and does not introduce fallback or dual-read behavior.

## 2. Setup runtime integration

- [x] 2.1 Update setup runtime pipeline so each setup rule computes local setup mask first (`run_setup_mask`) and applies context gate externally via shared evaluator.
- [x] 2.2 Ensure setup runtime composition receives side-aware evaluation context and `ContextBundle` for per-rule external gating.
- [x] 2.3 Keep setup composition semantics unchanged (`compose_setup_masks` AND behavior), but compose gated per-rule masks.
- [x] 2.4 Verify setup components (`untouched_anchor_setup`, `ema_bounce_counter_setup`) remain context-unaware and keep existing setup-instance-ID feature planning behavior.
- [ ] 2.5 Add explicit guardrails/tests that `evaluate_context_consumption` is NOT called inside `untouched_anchor_setup` or `ema_bounce_counter_setup`.

## 3. Catalog and API parity

- [x] 3.1 Expose setup-role `supports_context_consumption` and allowed policy components in component catalog metadata.
- [x] 3.2 Align research_api validate behavior with research loader errors for setup `context_consumption` acceptance/rejection.

## 4. Tests and diagnostics

- [x] 4.1 Add/adjust unit tests for setup validation: valid declared `context_ref`, unknown ref failure, missing `policy.component_id`, invalid `allowed_regimes`, and legacy policy rejection.
- [x] 4.2 Add runtime tests proving context gate is applied outside setup components and can block an otherwise-true local setup mask.
- [x] 4.3 Add both-side tests showing side-relative `htf_regime_gate` produces different gated setup masks for `long` vs `short` on the same raw HTF state.
- [x] 4.4 Add diagnostics/trace assertions for separate setup states: `local_setup_allowed`, `context_gate_allowed`, `final_setup_allowed` plus `context_ref`, `policy_id`, `allowed_regimes`, `raw_state`, `resolved_regime`, `evaluated_side`.
- [ ] 4.5 Ensure setup `component_events[]` remain local setup events even when context gate blocks final setup mask; assert context block is shown in context diagnostics/consumption trace.

## 5. Frontend Composer authoring

- [x] 5.1 Add setup-item `context_consumption` editor in Composer using setup-role catalog-driven availability.
- [x] 5.2 Require explicit `context_ref` selection by user; default remains no `context_consumption`.
- [x] 5.3 Add UI controls for `htf_regime_gate` and `allowed_regimes` (`aligned`, `neutral`, `countertrend`), without emitting unsupported policies.
- [x] 5.4 Enforce no implicit first-context auto-selection in setup authoring flow.
- [x] 5.5 Keep backward compatibility for load/render of existing configs without setup context consumption.
- [x] 5.6 Verify save/load roundtrip emits and preserves `strategy.setups[].context_consumption` and never emits `htf_state_gate`.
