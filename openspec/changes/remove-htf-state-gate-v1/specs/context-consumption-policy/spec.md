## REMOVED Requirements

### Requirement: htf_state_gate остаётся доступным без изменений

**Reason**: Side-relative gating is fully expressed by `htf_regime_gate`; raw-state allowlist policy is removed.

**Migration**: Recreate blocker `context_consumption` with `policy_id: htf_regime_gate` and explicit `allowed_regimes`. Map prior raw-state intent via `resolve_htf_regime` semantics (e.g. long + `up` → `aligned`).

### Requirement: Side-agnostic политика игнорирует evaluated_side

**Reason**: No side-agnostic HTF consumer policy remains; all HTF blocker gating is side-aware via `htf_regime_gate`.

**Migration**: Use `htf_regime_gate` with `allowed_regimes` per side pass.

## MODIFIED Requirements

### Requirement: Before implementation audit classifies all context-consuming paths

Before implementation, research layer SHALL audit all existing context-consuming call sites and classify them into exactly one implementation path:

1. side-aware context consumers -> MUST use shared evaluator;
2. diagnostic call sites -> MUST use `ContextConsumptionResult` / recorded result from evaluator, or invoke `evaluate_context_consumption` when no recorded result exists;
3. exit policy context usage -> MUST use `evaluate_context_consumption`.

No existing context-consuming path SHALL remain on direct `ContextBundle.get(context_ref) + apply_*`.

#### Scenario: Audit finds legacy direct context access

- **WHEN** implementation audit finds a call site that reads `ContextBundle` and applies a context policy directly
- **THEN** the call site is migrated to `evaluate_context_consumption` or `ContextConsumptionResult` / recorded result from evaluator before the change is complete
- **AND** it is classified as side-aware consumer, diagnostic call site, or exit policy context usage

### Requirement: Entry consumer policies gate without new component_id

Phase 3 SHALL introduce at least one reference entry consumer (setup or blocker) that uses `context_consumption` with a catalog-listed entry policy. The reference MUST use an existing `component_id` (not `htf_gated_*`).

#### Scenario: Reference blocker gates entries by HTF regime

- **GIVEN** a blocker with `context_consumption` and `htf_regime_gate` allowing only `aligned`, raw HTF state `down`, evaluated side `long`
- **WHEN** the blocker runs after bundle build
- **THEN** the entry pipeline mask blocks entries on that bar

## ADDED Requirements

### Requirement: htf_state_gate removed as consumer policy

Research layer MUST NOT register, validate, or execute `htf_state_gate` as a `context_consumption` policy. Raw provider output `htf_state` (`up`, `down`, `neutral`) MUST remain available from `ContextBundle` for policies that resolve regimes via shared evaluator.

#### Scenario: Legacy htf_state_gate config fails validation

- **WHEN** validate or loader receives `policy_id: htf_state_gate` on a blocker
- **THEN** validation fails naming unsupported policy_id

#### Scenario: Catalog omits htf_state_gate

- **WHEN** component catalog is fetched for `ema_pullback`
- **THEN** blocker consumption policies list includes `htf_regime_gate` and MUST NOT include `htf_state_gate`

#### Scenario: Raw provider state unchanged

- **WHEN** `htf_context` provider runs
- **THEN** `ContextOutput` state series remains raw `up`, `down`, or `neutral` with no aligned/countertrend labels
