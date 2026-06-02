## Why

`context_consumption` already gates blockers and exit policy, but setup rules in `strategy.setups[]` still cannot consume HTF context through the same policy model. This creates an inconsistent contract in the entry pipeline and forces HTF gating to live outside setup rules.

## What Changes

- Extend `strategy.setups[]` schema/model so each setup rule may declare optional `context_consumption` with explicit `context_ref` and policy payload.
- Introduce setup-role validation and catalog exposure for setup context consumption, including `htf_regime_gate` with `allowed_regimes`.
- Apply context gate outside setup components: setup components keep producing only local masks, then runtime gates each rule result using shared context policy evaluation.
- Keep setup composition semantics unchanged: setup rules remain AND-composed after per-rule gating.
- Preserve existing boundaries and remove no-longer-used legacy paths: do not reintroduce `htf_state_gate`, `exit_policy.context`, fallbacks, dual-read, or silent migration.

## Capabilities

### New Capabilities
- `<none>`: no new capability namespace is introduced.

### Modified Capabilities
- `context-consumption-policy`: add setup rules in `strategy.setups[]` as first-class context consumers with policy-driven gating applied outside setup component internals.
- `strategy-instance-contexts`: update strategy instance contract so `setups[]` accepts and validates optional `context_consumption` blocks per setup rule.

## Impact

- Affected research strategy contracts: setup rule schema (`SetupRuleSpec`) and strategy loader/validator path.
- Affected runtime entry compilation: setup mask pipeline (`run_setup_mask`, setup composition) with per-rule context gating inserted after component-local mask evaluation.
- Affected catalog/API surface: setup role metadata for `supports_context_consumption` and allowed setup policies.
- Affected tests and diagnostics for setup context gating behavior, including side-relative regime mapping via existing shared evaluator.
