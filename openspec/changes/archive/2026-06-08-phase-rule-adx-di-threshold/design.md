## Context

Today `PhaseRuleConditionSpec` is a typed union on `condition.type` with ad-hoc fields (`threshold`, `atr`). Parsing lives in `instance_loader._parse_phase_rule_condition`; evaluation is a single `_condition_met` switch in `trade_runtime.py`; feature planning for phase rules is minimal (ATR only via `_atr_series_for_phase_rules` in `backtest.py`).

Elsewhere the family uses **component-style** contracts:

```json
{
  "component_id": "break_even_stop",
  "params": { ... }
}
```

Managed `stop_management` / `take_management` / `runtime_exits` already follow this pattern. Phase rules are the outlier.

Research: `docs/research/22_phase_rule_condition.md`.

## Goals / Non-Goals

**Goals:**

- Normalize `phase_rules[].condition` to `{ component_id, params }`.
- Internal allowlisted registry with per-component pipeline: validate → plan features → evaluate → diagnostics.
- Port `mfe_atr`, `mfe_pct`, `bars_in_trade` with equivalent evaluation semantics; `bars_in_trade.params.threshold` tightens to integer `>= 1` (reject non-integer).
- Add `adx_di_threshold` as fourth allowlisted condition component.
- **Breaking:** reject `condition.type`; update all in-repo configs and Composer.
- Preserve end-of-bar evaluation and delayed activation.

**Non-Goals:**

- Entry pipeline components, ADX blocker changes, ADX-managed exits.
- Plugin/dynamic loading of condition components.
- Dual-read compatibility layer.
- `data_engine/` changes.

## Decisions

### 1. Wire contract (breaking)

**Old (unsupported):**

```json
{
  "condition": {
    "type": "mfe_atr",
    "threshold": 1.0,
    "atr": { "timeframe": "base", "period": 14 }
  }
}
```

**New (required):**

```json
{
  "condition": {
    "component_id": "mfe_atr",
    "params": {
      "threshold": 1.0,
      "atr": { "timeframe": "base", "period": 14 }
    }
  }
}
```

`phase_rules[]` top-level fields unchanged: `rule_id`, `to_phase`, `condition`.

Validation: if `condition.type` is present → fail with `unsupported legacy phase_rules condition.type; use condition.component_id and params`. Unknown `component_id` → fail.

### 2. Allowlisted condition components (v1)

| `component_id` | Role | Params (v1) |
|----------------|------|-------------|
| `mfe_atr` | MFE distance in ATR multiples | `threshold` (>0), `atr: { timeframe, period }` |
| `mfe_pct` | MFE as decimal ratio | `threshold` (>0) |
| `bars_in_trade` | Inclusive bars since entry | `threshold` (integer, ≥ 1) |
| `adx_di_threshold` | ADX strength + optional DI alignment | `timeframe`, `period`, `adx_threshold` (>0), `require_di_alignment` (bool, default true) |

`component_id` values are **internal allowlist** — same discipline as managed exit `component_id`, not the public entry `COMPONENT_REGISTRY` roles.

### 3. Registry / dispatcher module

New research module (proposed path): `research/strategies/ema_pullback/phase_rule_conditions/`

Per component, implement a small definition object (dataclass or protocol) exposing:

```text
component_id: str
validate_params(raw) -> typed params spec
plan_features(params, plan_builder) -> None
evaluate(state, bar_index, context) -> EvaluationResult
  # met: bool, diagnostics: dict for event metadata
```

Central dispatcher:

```text
PHASE_RULE_CONDITION_REGISTRY: dict[str, PhaseRuleConditionDefinition]
dispatch_validate(component_id, params) -> PhaseRuleConditionSpec
dispatch_plan_features(phase_rules, feature_plan)
dispatch_evaluate(component_id, params, state, bar_index, eval_context) -> EvaluationResult
```

`evaluate_phase_rules` calls dispatcher instead of `_condition_met` type switch.

**Alternative considered:** extend entry `COMPONENT_REGISTRY` with role `phase_rule_conditions` — rejected to avoid coupling exit-management runtime to entry signal registry and to keep allowlist separate.

### 2b. `bars_in_trade.params.threshold` is integer

`params.threshold` MUST be validated as an integer `>= 1`. Non-integer values (e.g. `1.5`) MUST be rejected at load/validate time.

Rationale: bar-by-bar runtime uses discrete inclusive bar counts (`bars_in_trade == 1` on entry bar). Float thresholds are legacy from the temporary `condition.type` union; the breaking component-style migration is the right moment to enforce integer semantics.

### 4. Feature planning dispatch

`build_feature_plan` iterates `exit_management.phase_rules`, resolves each `condition.component_id`, calls `plan_features`:

| Component | Features planned |
|-----------|------------------|
| `mfe_atr` | ATR for `params.atr.(timeframe, period)` — same as today |
| `mfe_pct` | none (uses trade state only) |
| `bars_in_trade` | none |
| `adx_di_threshold` | ADX, +DI, -DI for `(timeframe, period)` via shared ADX/DMI helper |

ADX/DMI planning MUST NOT require blocker presence. Reuse `_add_adx_dmi_features` / `adx_dmi_columns` dedup key.

`backtest.py` builds evaluation context maps (`atr_series_by_key`, `adx_dmi_series_by_key`) from `FeaturePlan` + enriched DataFrame.

### 5. Runtime evaluation dispatch

Evaluation runs **end-of-bar** only (unchanged). For each ordered phase rule:

1. Skip if `to_phase` rank ≤ current phase (monotonic).
2. Dispatcher evaluates `condition.component_id` with trade `side`, `state`, `bar_index`, prepared series.
3. If met → `phase_changed` with `rule_id`, `to_phase`, metadata.

**`adx_di_threshold` semantics (v1, single bar):**

```text
long:  ADX >= adx_threshold AND (NOT require_di_alignment OR +DI > -DI)
short: ADX >= adx_threshold AND (NOT require_di_alignment OR -DI > +DI)
NaN/missing → not met, diagnostics.reason = indicator_not_ready
```

No rolling, slope, peak, or hold-N-bars.

**Managed layer coupling unchanged:** `break_even_stop` / `take_profile_switch` still via `activate_when.phase_at_least`; ADX never moves stop/TP directly.

### 6. Event / report metadata

Reuse `phase_changed` event type. Metadata SHOULD include:

```json
{
  "condition_component_id": "adx_di_threshold",
  "adx": 42.1,
  "di_plus": 31.5,
  "di_minus": 18.2,
  "di_aligned": true
}
```

For migrated built-ins, `condition_component_id` replaces prior `condition_type` string where applicable. Report consumers treat metadata as optional.

### 7. Composer / catalog

Phase rules editor switches from `PHASE_RULE_CONDITION_TYPES` (type union) to **condition component catalog**:

- Picker lists allowlisted `component_id` values with labels and param schemas.
- UI renders params per component (same fields as backend `params`).
- Serialize `{ component_id, params }` only.
- Validate rejects `condition.type` in draft.

Catalog metadata can live beside registry (param JSON schema or typed defaults) and be mirrored lightly in frontend constants — no browser-side indicator computation.

### 8. Pipeline placement

```text
entry pipeline (unchanged)
execution layer (unchanged)
exit_policy (unchanged)

exit_management
  phase_rules[]
    condition.component_id + params
      → registry validate (load time)
      → registry plan_features (feature plan build)
      → registry evaluate (end-of-bar per open trade)
      → phase_changed
      → snapshot effective bar N+1
  stop_management / take_management / runtime_exits (unchanged; react to phase)
```

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| **BREAKING** breaks saved external configs | Explicit validation error; document rewrite in `notes.md`; update all in-repo fixtures |
| Registry duplication with `_condition_met` during migration | Single cutover PR; delete type switch |
| Composer + backend param drift | Shared param shapes in tests; smoke round-trip |
| HTF ADX uses aligned forward-filled values | Document v1 limitation; acceptable for hypothesis test |
| Touching `features/plan.py` | Scoped changes; no WorkbenchContext / HTF overlay path |

## Migration Plan

1. Implement registry + new wire contract with validation rejecting `condition.type`.
2. Port three built-in evaluators into registry (behavior parity tests).
3. Add `adx_di_threshold` component.
4. Rewrite in-repo smoke/experiment JSON and Composer defaults (`defaultDiagnosticPhaseRules`).
5. Remove `EXIT_MANAGEMENT_CONDITION_TYPES`, `PhaseRuleConditionSpec.type`, `_condition_met` type branches.
6. No runtime dual-read period.

**Rollback:** revert commit; configs must use new shape if re-applied.

## Open Questions

- Exact module path name: `phase_rule_conditions/` vs `exit_management/conditions/` — prefer family-local `phase_rule_conditions/`.
