## Slice 1 — Backend (registry, runtime, reports, catalog)

### 1. Consumer registry contract

- [x] 1.1 Extend consumer metadata with `allowed_roles`, `input_contract`, `output_contract`, `side_aware`, `feature_requirements`, `params_schema_ref`, `diagnostics_contract`
- [x] 1.2 Populate `allowed_roles` for v1 components: `rsi_signal_exit`, `ema_cross_loss_exit`, `atr_stop_loss`, `atr_take_profit`, `adx_di_threshold`, `phase_runtime_exit`, management components
- [x] 1.3 Add validate-time role resolution: JSON path + explicit `role` on `runtime_exits` rules → registry lookup → hard reject if disallowed
- [x] 1.4 Test: registry rejects component used in disallowed role (`atr_stop_loss` in `runtime_exits`)

### 2. Spec types and runtime_exits wire shape

- [x] 2.1 Generalize `RuntimeExitRuleSpec` to support `rsi_signal_exit`, `ema_cross_loss_exit`, and `phase_runtime_exit` with `role`, `exit_kind`, `activate_when`, typed `params`
- [x] 2.2 Reject `runtime_exits` without `activate_when`; reject `exit_kind: "signal"`; reject unknown `component_id`; reject role mismatch
- [x] 2.3 Test: `rsi_signal_exit` validates in both `exit_policy.signal_exit` and `exit_management.runtime_exit` with `activate_when`
- [x] 2.4 Test: `ema_cross_loss_exit` validates in both consumers
- [x] 2.5 Test: existing `exit_policy`-only configs still validate and run unchanged

### 3. Runtime consumer adapter

- [x] 3.1 Refactor `evaluate_runtime_exits` to dispatch by `component_id` through consumer adapters (no duplicated RSI/EMA math)
- [x] 3.2 Wire feature planning for runtime-only `rsi_signal_exit` / `ema_cross_loss_exit` rules
- [x] 3.3 Preserve delayed activation: evaluate end-of-bar N, arm from bar N+1; fill price = bar close (no intrabar)
- [x] 3.4 Test: runtime RSI does not trigger before runner
- [x] 3.5 Test: runtime EMA cross does not trigger before runner
- [x] 3.6 Test: runtime RSI triggers after runner (long RSI >= threshold; short RSI <= threshold)
- [x] 3.7 Test: runtime EMA cross triggers after runner (long bearish cross; short bullish cross)
- [x] 3.8 Test: runtime RSI/EMA exit price equals bar close on winning bar

### 4. Arbitration and execution integration

- [x] 4.1 Extend `ExitArbitrator` / `ExitCandidate` for v1 sub-priority: protective runtime → take runtime → market_close runtime → signal
- [x] 4.2 Ensure no new trade execution path; managed provider still called from existing execution layer only
- [x] 4.3 Test: no new trade path introduced (parity test: `exit_policy`-only config vs baseline)
- [x] 4.4 Test: `phase_runtime_exit` configs still behave per delayed-arm semantics

### 5. Reports and managed events (normalized exit_layer)

- [x] 5.1 Emit `runtime_exit_triggered` / `runtime_exit_executed` with `exit_layer`, `exit_owner`, `component_id`, `role`, `rule_id`, `exit_kind`, phase, side, price, bar_index, MFE/MAE, bars_in_trade, metadata
- [x] 5.2 Narrow existing coarse `exit_layer: exit_management` to precise layers (`exit_management.stop_rule`, etc.); add `exit_owner`
- [x] 5.3 Add variant `exit_layer_breakdown` with precise keys (no `exit_management.other`); add `runtime_exit_breakdown` by `component_id` / `rule_id`
- [x] 5.4 Add runner capture summaries for runtime RSI/EMA vs initial SL in runner phase
- [x] 5.5 Test: reports distinguish `exit_policy` vs `exit_management.runtime_exit`; trade `exit_layer` matches breakdown keys

### 6. BFF catalog

- [x] 6.1 Add `allowed_roles: list[str]` to `ComponentSchema` in `research_api/contracts/catalog.py`
- [x] 6.2 Expose roles on `rsi_signal_exit`, `ema_cross_loss_exit`, `phase_runtime_exit`, `atr_stop_loss`, `adx_di_threshold`, etc.
- [x] 6.3 Add parity test: research registry `allowed_roles` == BFF catalog for each shared `component_id`

### 7. Smoke fixtures (Slice 1)

- [x] 7.1 Add smoke spec under `research/experiments/specs/smoke/` for runner ADX + `disable_initial_tp` + RSI/EMA runtime exits
- [x] 7.2 Smoke JSON authored and validates (live backtest → C.M1–C.M4)

---

## CHECKPOINT (mandatory stop before Slice 2)

**Status:** **PASSED** — backend / unit / integration + market-data smoke accepted. Composer Slice 2 may start.

**Market smoke evidence:** `exit_management_runner_rsi_ema_runtime_smoke_batch.json` on BTCUSDT 5m full range (646 029 candles); report `2026-06-09T132642Z_ema_pullback_BTCUSDT_5m__strict_adx40_runner_runtime_rsi90_ema100_200_smoke.json`.

### Passed (backend / unit / integration)

- [x] C.1 Hand-authored JSON configs validate (runner phase + RSI take + EMA protective runtime exits)
- [x] C.2 All Slice 1 pytest targets green (`674` passed)
- [x] C.3 Unit/integration parity: runtime exits do not introduce a new trade path; `exit_policy`-only configs unchanged
- [x] C.4 Report contract tests: precise `exit_layer` / `exit_owner` breakdown keys align in synthetic fixtures

### Passed (market-data smoke)

- [x] C.M1 Run smoke batch on CLI with local candle data (`exit_management_runner_rsi_ema_runtime_smoke_batch.json` → `_local.json`)
- [x] C.M2 Live report: `exit_layer_breakdown.exit_management.runtime_exit` = 24 (RSI take 7, EMA protective 17)
- [x] C.M3 Zero pre-runner runtime RSI/EMA exits (`runtime_exit_triggered` before runner: 0)
- [x] C.M4 No unexpected regression: `exit_policy`-only parity covered by C.3; 108 pre-runner `exit_policy` closes unaffected by runtime rules

---

## Slice 2 — Composer authoring (after CHECKPOINT)

- [x] 8.1 Add `runtime_exits` authoring section with allowlisted component picker (`rsi_signal_exit`, `ema_cross_loss_exit`, `phase_runtime_exit`)
- [x] 8.2 Require `activate_when` and `exit_kind` (`take_profit` | `protective_exit` | `market_close`) in Composer forms; reject `signal`
- [x] 8.3 Workbench round-trip: `composerRuntimeExitAuthoring.test.tsx` validates runner RSI + EMA smoke load/edit/save via `prepareStrategyForApi`
