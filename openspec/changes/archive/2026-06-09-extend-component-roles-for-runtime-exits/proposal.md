## Why

Managed exit research (runner / ADX-DI phase transitions, `disable_initial_tp`, future runner exits) needs RSI and EMA cross exits that activate only after a trade phase threshold — not duplicate components like `runner_rsi_exit` or `phase_gated_ema_cross_exit`. Today `rsi_signal_exit` and `ema_cross_loss_exit` are wired only as always-on `exit_policy` signal exits, while `runtime_exits` supports only the placeholder `phase_runtime_exit` (bar-close on phase). Without an explicit **component vs consumer role** contract, every new managed exit pattern risks copying trading math and silently mis-binding components.

This change extends the existing component registry / catalog so one reusable primitive can be authorized for multiple consumer roles, starting with `exit_management.runtime_exit`, with strict validation and report attribution.

## What Changes

- Introduce **consumer roles** (`exit_policy.signal_exit`, `exit_management.runtime_exit`, `exit_management.phase_condition`, etc.) as a first-class registry/catalog dimension separate from pipeline slot role (`exits`, `blockers`, …).
- Extend research and BFF component catalog with `allowed_roles`, `input_contract`, `output_contract`, `side_aware`, `feature_requirements`, `params_schema`, and `diagnostics_contract` per component (extend existing fields where present; no parallel registry).
- Allow `rsi_signal_exit` and `ema_cross_loss_exit` in both `exit_policy.signal_exit` and `exit_management.runtime_exit` when explicitly listed in `allowed_roles`.
- Extend `runtime_exits[]` rules to reference reusable signal components with mandatory `activate_when`, explicit `role`, and `exit_kind` (`take_profit`, `protective_exit`, …).
- Add validation **reject policy**: unknown `component_id`, disallowed role, or missing `activate_when` on runtime exits → hard validation error (no silent ignore / fallback).
- Extend managed runtime evaluation to dispatch signal logic through a **consumer adapter** (phase-gated evaluation, delayed arm semantics unchanged) without a new trade execution path.
- Extend `same_bar_policy: "v1"` to distinguish managed runtime protective vs take exits by `exit_kind`.
- Normalize exit attribution: precise `exit_layer` (`exit_policy`, `exit_management.runtime_exit`, `exit_management.stop_rule`, …) plus coarse `exit_owner` (`exit_policy` | `exit_management`); metrics breakdown keys MUST match trade-record `exit_layer`.
- Reject `exit_kind: signal` on runtime exits; allowed: `take_profit`, `protective_exit`, `market_close`.
- Runtime RSI/EMA fills at bar close (no intrabar).
- Extend trade-management event trace and report diagnostics: `component_id`, `role`, `rule_id`, phase at trigger, `exit_kind`, managed event types including `runtime_exit_executed`.
- Keep `phase_runtime_exit` as a valid runtime exit component (bar-close placeholder) alongside reusable signal components.
- Implementation split: **Slice 1** backend + BFF catalog + smoke; **CHECKPOINT**; **Slice 2** Composer `runtime_exits` authoring.

Non-goals:

- No new RSI or EMA cross trading math.
- No duplicate components (`runner_rsi_exit`, `phase_gated_*`).
- No silent fallback, dual-read legacy shapes, or new vectorbt callback trade path.
- No `data_engine` changes.
- No automatic suppression of `exit_policy` signal exits when runner activates (remains explicit / future).

## Capabilities

### New Capabilities

- `component-consumer-roles`: Registry and catalog contract for `allowed_roles`, consumer-role validation, and reject policy when a component is used outside authorized roles.

### Modified Capabilities

- `trade-exit-management-runtime`: `runtime_exits` dispatch reusable signal components via `exit_management.runtime_exit`; mandatory `activate_when`; extended v1 arbitration by `exit_kind`; `phase_runtime_exit` coexists.
- `ema-pullback-report-diagnostics`: Exit-layer breakdown, runtime exit counts by `component_id` / `rule_id`, enriched `managed_events[]` fields for runtime exits.
- `composer-exit-management`: Authoring and validate for `runtime_exits` with allowlisted reusable components and `activate_when`.

## Impact

Affected layers: `research` (primary), `research_api` (catalog contract + validate), `frontend` (Composer authoring — later slice).

Likely modules:

- `research/strategies/ema_pullback/components/registry.py` — consumer role metadata on definitions.
- `research/strategies/ema_pullback/spec.py` — `RuntimeExitRuleSpec` generalization, role validation.
- `research/strategies/ema_pullback/execution/managed_components/runtime_exit.py` — consumer adapter dispatch.
- `research/strategies/ema_pullback/execution/exit_arbitration.py` — v1 sub-priority by `exit_kind`.
- `research_api/contracts/catalog.py`, `research_api/services/component_catalog.py` — `allowed_roles` on `ComponentSchema`.
- Report builders under `research/strategies/ema_pullback/` diagnostics.
- Tests: `tests/test_exit_management_contracts.py`, `tests/test_managed_runtime_exit_components.py`, new registry role tests.

Integration boundaries:

- `research` owns signal evaluation, runtime dispatch, arbitration, and report fields.
- `research_api` mirrors catalog metadata and forwards validate errors.
- `frontend` consumes catalog; authoring tasks are a separate vertical slice.

References:

- `docs/research/06_component_registry.md` — pipeline component addressing.
- `docs/research/21_state_driven_exit_management_v1.md` — runner / runtime exit motivation.
- `openspec/specs/trade-exit-management-runtime/spec.md` — existing managed runtime baseline.
