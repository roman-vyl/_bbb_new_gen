## Why

Context consumer policy `htf_state_gate` filters on **raw provider state** (`up` / `down` / `neutral`) — the technical direction of the HTF EMA stack. That is correct at the provider layer but is **not** a trader-facing regime: the trading meaning of `up` depends on whether the strategy is evaluating a **long** or **short** entry. The same config `allowed_states: ["up"]` means *aligned* for long and *countertrend* for short, which is dangerous for both-side strategies and confusing in Strategy Composer. We need an explicit **side-relative regime** policy at consumer evaluation time while keeping provider output unchanged.

## What Changes

- **New consumer policy** `htf_regime_gate` with `params.allowed_regimes`: `aligned`, `countertrend`, `neutral` (trader-facing labels).
- **Side-relative mapping** inside consumer policy evaluation only:
  - long + raw `up` → `aligned`; long + raw `down` → `countertrend`; any side + raw `neutral` → `neutral`
  - short + raw `down` → `aligned`; short + raw `up` → `countertrend`
- **Consumer evaluation contract** extended so policy handlers receive **evaluated trade side** alongside raw `ContextOutput` state (today `apply_htf_state_gate` is side-agnostic; signal trace builds per-side masks but applies the same raw gate).
- **Validation & catalog**: register `htf_regime_gate` for supported blocker (and future entry) consumers; validate `allowed_regimes` shape.
- **Diagnostics** (trace / forensics): per evaluation record `context_ref`, `raw_state`, `evaluated_side`, `resolved_regime`, `allowed_regimes`, pass/fail.
- **Existing `htf_state_gate` retained** — no removal, no automatic config migration in this change.

**Not changing**

- Provider output: `htf_state` remains `up` / `down` / `neutral` from market/features only.
- Provider config: no trade side, no aligned/countertrend in `strategy.contexts`.
- Composer as source of truth for regime mapping (mapping lives in research policy evaluation only).

**Explicit non-goals**

- No runtime implementation in this propose step.
- No `data_engine/`, production `research_api/`, or `frontend/` code changes in propose.
- No provider output or provider-side side logic.
- No automatic migration from `htf_state_gate` configs to `htf_regime_gate`.
- No removal of `htf_state_gate`.
- No aligned/countertrend computed in Composer UI as authoritative logic.

## Architectural separation (why this shape)

| Layer | Responsibility | Knows trade side? | Output / input |
|-------|----------------|-------------------|----------------|
| **Context provider** | Compute raw technical HTF state from EMA stack | No | `htf_state`: `up` / `down` / `neutral` |
| **Strategy / component evaluation** | Evaluate signals per enabled side (`long` / `short`) | Yes (evaluated side) | Side-specific masks / trace |
| **Context consumer policy** | Map raw state + evaluated side → trader regime; gate on `allowed_regimes` | Receives evaluated side as input | `aligned` / `countertrend` / `neutral` |

1. **Raw `up/down/neutral` stays provider-level** — it describes market structure (e.g. EMA50 > EMA100 > EMA200), independent of how the strategy will trade.
2. **Provider must not know trade side** — aligned/countertrend are defined relative to intent; a provider cannot know whether the current evaluation pass is for long or short entry.
3. **Aligned/countertrend cannot be computed in the provider** — one raw bar can be aligned for long and countertrend for short simultaneously; only consumer evaluation with side context can resolve this.
4. **Side-relative regime belongs in consumer policy evaluation** — same place as `htf_state_gate`, but with an explicit mapping step before allow/deny.
5. **Policy evaluation inputs** — raw context state series + **evaluated trade side** for the current mask/trace pass; if the contract does not pass side today, implementation MUST extend it (blocker compile path, `signal_trace`, `consumption_trace`, attribution helpers).
6. **Both-side strategies** — authors configure `allowed_regimes: ["aligned", "neutral"]` once; long and short each get semantically correct gating without duplicating inverted raw `allowed_states`.

### Example config

```yaml
context_consumption:
  context_ref: htf_4h_50_100_200
  policy:
    policy_id: htf_regime_gate
    params:
      allowed_regimes: ["aligned", "neutral"]
```

### Mapping table (normative for implementation)

| Evaluated side | Raw `htf_state` | Resolved regime |
|----------------|-----------------|-----------------|
| long | up | aligned |
| long | down | countertrend |
| long | neutral | neutral |
| short | down | aligned |
| short | up | countertrend |
| short | neutral | neutral |

**Examples**

- Raw `up`, evaluating **long** → `resolved_regime = aligned`.
- Raw `up`, evaluating **short** → `resolved_regime = countertrend`.

### Acceptance criteria (for `/opsx:apply`)

- Provider still emits only `up` / `down` / `neutral`; no provider changes required for correctness.
- `htf_regime_gate` registered in policy registry and component catalog for at least blocker consumers that today support `htf_state_gate`.
- Validation rejects unknown `allowed_regimes` values and empty lists when `allowed_regimes` is present.
- Per-side blocker masks: long pass uses long mapping; short pass uses short mapping; both-side instance with `allowed_regimes: ["aligned"]` blocks long on raw `down` and short on raw `up`.
- `htf_state_gate` behavior unchanged for existing configs.
- Trace / diagnostic outcome includes: `context_ref`, `raw_state` (per bar or at attribution index), `evaluated_side`, `resolved_regime`, `allowed_regimes`, pass/fail.
- Unit tests cover mapping table rows and both-side asymmetry (same raw bar, different pass/fail per side).

## Capabilities

### New Capabilities

- _(none — behavior extends existing context consumption domain)_

### Modified Capabilities

- `context-consumption-policy`: ADD policy `htf_regime_gate`, side-aware evaluation contract, `allowed_regimes` validation, diagnostics fields for regime resolution.

## Impact

| Layer | Scope |
|-------|--------|
| **research** | `context/policies.py`, consumption validation, blocker compile + `signal_trace`, `consumption_trace`, attribution; tests |
| **research_api** | Component catalog policy registry entry for `htf_regime_gate` |
| **frontend** | Composer: catalog-driven policy params for `allowed_regimes` (read-only validation via API; no client-side mapping) |
| **data_engine** | _none_ |

**Reference docs**: [`docs/research/strategy_constructor_master_plan.md`](../../../docs/research/strategy_constructor_master_plan.md), [`openspec/specs/context-consumption-policy/spec.md`](../../specs/context-consumption-policy/spec.md), [`openspec/specs/strategy-instance-contexts/spec.md`](../../specs/strategy-instance-contexts/spec.md).

**Related code today**: `_active_rule_group_for_side` in `research/strategies/ema_pullback/context/policies.py` already implements the mapping for `exit_profile_by_htf_state`; this change exposes the same semantics as an explicit gate policy for entry/blocker consumers.
