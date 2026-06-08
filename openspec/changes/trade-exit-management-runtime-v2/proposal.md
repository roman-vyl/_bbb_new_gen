## Why

Archived `trade-exit-management-runtime-v1` delivered `diagnostic_only` exit management: phase rules, runtime trace, and reports show **when** a trade reached `proven` / `protected` / `runner`, but **do not** change exits, stops, or PnL. After `protected`, trades still close on the original `exit_policy` initial SL/TP.

v2 adds **`mode: managed`** — a behavior-changing **managed exit state / candidate provider** for already-open trades. It activates `stop_management`, `take_management`, and `runtime_exits` from trade phase/state and supplies managed candidates, snapshots, and events to the **existing execution layer**, which remains the owner of position lifecycle (open, hold, close). Research master-plan: `docs/research/21_state_driven_exit_management_v1.md`.

## What Changes

- Add `exit_management.mode: "managed"` alongside unchanged `diagnostic_only` (permanent parity control mode).
- Introduce managed exit provider core: `ActiveManagementSnapshot`, managed `ExitCandidate`, and `ExitArbitrator` (used by execution layer).
- Implement component pack v1 for all three active layers (not BE-only): `break_even_stop`, `lock_profit_stop` (minimal working: entry ± `lock_atr`×ATR, side-aware, tighten-only), `take_profile_switch`, `phase_runtime_exit` (phase-gated exit at bar `close` via `params.exit_price: "close"` — no pattern triggers in v2).
- Define uniform managed events: `phase_changed`, `active_stop_updated`, `active_take_updated`, `runtime_exit_triggered`, `exit_rule_triggered`, `exit_executed`.
- **Execution integration:** existing execution/backtest layer consumes effective `exit_policy` candidates plus managed candidates from the provider; applies close decisions with **delayed activation** (provider snapshot updates on bar N apply from bar N+1).
- Extend report/API/frontend with **generic** managed-layer breakdowns (`exit_layer`, `rule_id`, `component_id`) — not per-component schemas.
- Add baseline vs managed comparison tooling (generic metrics; BE labels derived).
- **Guardrail:** `managed` with empty `stop_management` / `take_management` / `runtime_exits` MUST match baseline parity (same as no behavior-changing rules).
- **Single managed runtime path:** behavior-changing execution uses only v2 `run_managed_execution_loop` (`ManagedExitProvider` + `ExitCandidate` + `ExitArbitrator`). No legacy BE combiner runtime path.
- **Legacy shape rejected (presence-based):** if `exit_management` contains `always_on` or `profiles` keys at all (including empty wrappers), validation fails with an explicit error. No runtime path, no authoring surface, no `run_managed_bar_loop` call-sites (including signal trace / diagnostics). No compatibility migration, no adapter shim, no unified `execution_combiner`. `exit_policy.always_on`/`profiles` unchanged.
- **Unchanged:** existing entry pipeline (setup/blocker/trigger/direction → entries); existing `exit_policy` layer and Composer exit-policy authoring; HTF profile locking/gating stays in `exit_policy` — managed provider only consumes effective `exit_policy` outputs; `data_engine/`.

## Capabilities

### New Capabilities

_None — extends existing capabilities via delta specs._

### Modified Capabilities

- `trade-exit-management-runtime`: managed mode, active layers, provider/execution integration, uniform events, empty-array parity, relationship with `exit_policy`.
- `ema-pullback-report-diagnostics`: managed per-trade fields, variant layer breakdowns, managed event trace extensions, comparison summary fields.

## Impact

| Layer | Impact |
|-------|--------|
| **research** | `spec.py` validation; managed exit provider (`trade_runtime.py`, component evaluators); `ExitArbitrator`; execution integration in `backtest.py`; `results.py` serialization; comparison helpers |
| **research_api** | Read-only types/endpoints for managed report fields |
| **frontend** | Report panels read unified managed breakdowns (no Composer authoring in v2) |
| **data_engine** | None |

**Non-goals (this change):** component-based state rules (`component_id` phase conditions), runner management pack (ADX/EMA trail/exhaustion), full Composer managed-mode editors, second trade path / second portfolio, exit_management as entry or lifecycle owner, vectorbt callback as source of truth, legacy BE runtime / `run_managed_bar_loop` execution path, legacy JSON migration, adapter-based execution combiner (`execution_combiner` / `execution_adapters`), partial take/scale-out, OHLC intrabar priority v2.

**Future (separate changes):** research doc phases 6–8 — component state rules, runner pack, Composer authoring.
