## Context

Strategy-level contexts and side-relative HTF regime resolution are already implemented and consumed by blockers and exit policy through `context_consumption`. Setup rules in `strategy.setups[]` are still context-agnostic at the contract level, so HTF gating cannot be configured per setup rule using the same policy model.

Current setup runtime flow is:
- evaluate setup component-local mask (`run_setup_mask`)
- combine all setup masks with AND (`compose_setup_masks`)
- apply resulting setup mask in entry pipeline

Two setup components are currently supported (`untouched_anchor_setup`, `ema_bounce_counter_setup`), and `ema_bounce_counter_setup` relies on setup instance IDs for EMA column planning. This behavior must remain unchanged.

## Goals / Non-Goals

**Goals:**
- Allow each `strategy.setups[]` rule to declare optional `context_consumption` (`context_ref` + `policy`).
- Validate setup context consumption against setup-role policy registry/catalog.
- Apply context gate per setup rule after local setup mask evaluation, before setup composition.
- Reuse shared context policy evaluator (`evaluate_context_consumption`) with side-aware context.
- Keep compatibility with existing setup components and instance-ID-based feature planning.

**Non-Goals:**
- Do not make setup components HTF-aware internally.
- Do not change setup AND composition semantics.
- Do not reintroduce `htf_state_gate`, `exit_policy.context`, runtime fallback, dual-read, or silent migration.
- Do not change provider raw state format (`up/down/neutral`) or resolved regime labels (`aligned/countertrend/neutral`).

## Decisions

1. **Setup rules become context consumers at spec/schema level**
   - Add optional `context_consumption` to setup rule contract (`SetupRuleSpec` and corresponding API schema).
   - Rationale: setup rules are already a logical entry consumer boundary, so this keeps the model consistent with blockers/exit policy.
   - Alternative considered: introducing dedicated `htf_*` setup components. Rejected because it duplicates setup logic and couples setup internals to specific context providers.

2. **Context gate is applied outside setup component internals**
   - Runtime evaluates component-local setup mask first.
   - If rule defines `context_consumption`, runtime evaluates policy through shared evaluator and intersects (`local_mask AND context_gate_mask`) for that rule.
   - Composed setup mask remains AND across all rule masks.
   - Rationale: preserves single responsibility of setup components and avoids HTF-specific branches inside each setup implementation.

3. **Setup role uses existing policy registry/catalog contracts**
   - Setup role exposes `supports_context_consumption` and allowed policies in catalog metadata.
   - `htf_regime_gate` remains the policy for side-relative HTF gating with required `allowed_regimes`.
   - Rationale: keeps one policy governance path across consumer roles and avoids role-specific policy forks.

4. **No legacy compatibility paths**
   - Validation rejects unsupported/legacy policy IDs and malformed setup consumption blocks.
   - No runtime fallback for missing/unknown `context_ref`.
   - Rationale: aligns with existing strict policy from `context-consumption-policy` and prevents hidden behavior drift.

5. **Composer authoring is explicit and catalog-driven**
   - Setup item editor exposes `context_consumption` only when setup-role catalog marks component as supporting it.
   - User explicitly chooses `context_ref`, `htf_regime_gate`, and `allowed_regimes`; default state is no `context_consumption`.
   - Composer does not auto-select first context and does not emit legacy `htf_state_gate`.
   - Rationale: prevents implicit config behavior and keeps UI aligned with strict backend validation.

6. **Diagnostics preserve local setup evidence**
   - Setup `component_events[]` remains local setup diagnostics even if external context gate blocks final setup mask.
   - Context blocking is represented in context diagnostics fields (`local/gate/final`), not by removing local events.
   - Rationale: preserves forensic value ("setup happened but was disallowed by context") for chart/report analysis.

## Risks / Trade-offs

- **Risk:** Per-rule context evaluation may add overhead when many setup rules share the same context.  
  **Mitigation:** rely on shared evaluator cache keyed by `(context_ref, evaluated_side)` so resolved regime series are reused.

- **Risk:** Confusion between component-local setup failure and context-gate failure in diagnostics.  
  **Mitigation:** extend setup diagnostics/trace outcome to surface context gate inputs and pass/fail separately from local setup mask.

- **Risk:** Catalog/UI mismatch for setup role policies.  
  **Mitigation:** enforce setup-role parity between research loader validation and research_api catalog-driven validation.
