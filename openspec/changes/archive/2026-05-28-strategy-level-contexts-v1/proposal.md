## Why

HTF context is currently embedded as a **provider** inside `trade_management.exit_policy.context`, so only exit policy can own or configure it. That couples indicator production to exit-profile selection, blocks reuse by setup/trigger/blockers, and encouraged spike patterns (`htf_gated_*` component_ids, implicit “first context” fallbacks, frontend condition builders). After rolling back prior prototype work, we need a clean **strategy-level context + explicit consumption** architecture before adding more entry/exit components.

## What Changes

- **`strategy.contexts`**: Named context providers at strategy-instance scope (`context_ref` keys: `htf`, `macro_htf`, `local_htf`, etc.). Providers only produce state/readiness/features; they do not take trading decisions.
- **`context_consumption`**: Optional block on catalog-supported consumers (setup, trigger, blocker/filter, exit policy). Selects `context_ref` + consumer-owned `policy`. Different consumers MAY reference different `context_ref` values. No block → component does not read `ContextBundle`.
- **Exit policy validation**: If `exit_policy.profiles` contains non-empty profile-scoped exits, `exit_policy.context_consumption` is **required**. Without consumption, only `always_on` exits are valid — loader/API MUST error on profile exits without consumption (no silent skip).
- **Runtime `ContextBundle`**: Built once after feature enrichment from `strategy.contexts` only. No runtime dual-read of `exit_policy.context`.
- **Target instance JSON only**: Provider config under `strategy.contexts`; `trade_management.exit_policy.context` **removed** and **rejected** by loader/API. No loader shim, no normalize-on-load, no one-release compatibility path in runtime.
- **Component catalog / research_api**: `supports_context_consumption`, allowed policies per `(role, component_id)`; validation mirrors research loader.
- **Workbench Composer**: Strategy contexts section; exit policy consumer settings only; catalog-driven consumption on supported components; **does not** author or reload `exit_policy.context`.
- **Reports / chart**: Per-consumer attribution in trace/v5 fields (Phase 4). Chart HTF overlay uses **explicit** `context_ref` selection — never “first HTF provider”.
- **Phased delivery**: Four phases (research target shape → API/Composer → entry consumers → diagnostics). Each phase is a reviewable vertical slice.

**BREAKING**

- Strategy instance JSON: only `strategy.contexts` + `exit_policy.context_consumption`; nested `exit_policy.context` unsupported.
- Stored experiments with old shape: migrate via **one-off script or manual edit** — not runtime dual-read.
- Report schema v5 additive fields in Phase 4; v3/v4 reports remain readable as historical artifacts.

**Explicit non-goals**

- No `data_engine/` changes.
- No revival of spike implementations as implementation basis.
- No `htf_gated_*` catalog components solely for context.
- No generic rule engine or frontend-only condition builder.
- No implicit auto-select or fallback to first `context_ref` (runtime, validation, or UI).
- No runtime dual-read, loader shim, or normalize-on-load for `exit_policy.context`.
- No mass migration of every component to context consumption in one phase.
- No HTF/EMA computation in the browser.
- No Composer support for authoring old `exit_policy.context` shape.

## Capabilities

### New Capabilities

- `strategy-instance-contexts`: `strategy.contexts`, `ContextBundle`, loader rejects `exit_policy.context`, feature plan from contexts only.
- `context-consumption-policy`: `context_consumption`, profile-exits-require-consumption rule, consumer policies, catalog registry.
- `workbench-strategy-contexts`: Strategy contexts section; catalog-driven consumption; explicit chart overlay `context_ref`; no legacy exit provider form.

### Modified Capabilities

- `ema-pullback-report-diagnostics`: Trace/v5 per-consumer attribution; v3/v4 read-only historical compatibility; old config shape not supported by Composer/API.

## Impact

| Layer | Scope |
|-------|--------|
| **research** | Spec/loader/instance templates, `ContextBundle`, exit compiler consumer path, optional entry consumers, report/trace |
| **research_api** | Catalog, validate parity, signal trace meta from `strategy.contexts` |
| **frontend** | Composer, chart overlay selection, diagnostics display |
| **data_engine** | _none_ |

**Reference docs**: [`docs/research/strategy_constructor_master_plan.md`](../../../docs/research/strategy_constructor_master_plan.md), [`docs/frontend/implementation_plan.md`](../../../docs/frontend/implementation_plan.md), [`openspec/specs/ema-pullback-report-diagnostics/spec.md`](../../specs/ema-pullback-report-diagnostics/spec.md).

**Supersedes (design only)**: archived/spike changes `strategy-instance-shared-contexts-v1`, `workbench-strategy-contexts-v1`, `strategy-context-consumers-v1`.
