## Why

Archived `trade-exit-management-runtime-v1` delivered `diagnostic_only` exit management: phase rules, runtime trace, and reports show **when** a trade reached `proven` / `protected` / `runner`, but **do not** change exits, stops, or PnL. After `protected`, trades still close on the original `exit_policy` initial SL/TP.

v2 adds **`mode: managed`** — a behavior-changing runtime overlay that activates `stop_management`, `take_management`, and `runtime_exits` from trade phase/state. Research master-plan: `docs/research/21_state_driven_exit_management_v1.md`.

## What Changes

- Add `exit_management.mode: "managed"` alongside unchanged `diagnostic_only` (permanent parity control mode).
- Introduce bar-by-bar managed runtime core with `ActiveManagementSnapshot`, `ExitCandidate`, and `ExitArbitrator`.
- Implement component pack v1 for all three active layers (not BE-only): `break_even_stop`, `lock_profit_stop` (minimal working: entry ± `lock_atr`×ATR, side-aware, tighten-only), `take_profile_switch`, `phase_runtime_exit` (phase-gated exit at bar `close` via `params.exit_price: "close"` — no pattern triggers in v2).
- Define uniform managed events: `phase_changed`, `active_stop_updated`, `active_take_updated`, `runtime_exit_triggered`, `exit_rule_triggered`, `exit_executed`.
- Wire **causal** managed close path: bar-open exit arbitration across `exit_policy` and inherited `exit_management` snapshot; **delayed activation** (phase/snapshot updates on bar N apply from bar N+1).
- Extend report/API/frontend with **generic** managed-layer breakdowns (`exit_layer`, `rule_id`, `component_id`) — not per-component schemas.
- Add baseline vs managed comparison tooling (generic metrics; BE labels derived).
- **Guardrail:** `managed` with empty `stop_management` / `take_management` / `runtime_exits` MUST match baseline parity (same as no behavior-changing rules).
- **Unchanged:** existing `exit_policy` layer and Composer exit-policy authoring; HTF profile locking/gating stays in `exit_policy` — managed runtime only consumes effective `exit_policy` outputs (no HTF reimplementation); legacy `break_even_stop` deprecated shape (no revival).

## Capabilities

### New Capabilities

_None — extends existing capabilities via delta specs._

### Modified Capabilities

- `trade-exit-management-runtime`: managed mode, active layers, arbitration, uniform events, empty-array parity, relationship with `exit_policy`.
- `ema-pullback-report-diagnostics`: managed per-trade fields, variant layer breakdowns, managed event trace extensions, comparison summary fields.

## Impact

| Layer | Impact |
|-------|--------|
| **research** | `spec.py` validation; `trade_runtime.py` managed loop; new arbitration module; component evaluators; `backtest.py` integration; `results.py` serialization; comparison helpers |
| **research_api** | Read-only types/endpoints for managed report fields |
| **frontend** | Report panels read unified managed breakdowns (no Composer authoring in v2) |
| **data_engine** | None |

**Non-goals (this change):** component-based state rules (`component_id` phase conditions), runner management pack (ADX/EMA trail/exhaustion), full Composer managed-mode editors, second trade path, vectorbt callback as source of truth, legacy BE authoring, partial take/scale-out, OHLC intrabar priority v2.

**Future (separate changes):** research doc phases 6–8 — component state rules, runner pack, Composer authoring.
