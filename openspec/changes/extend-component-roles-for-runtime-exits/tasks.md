## Slice 1 — Backend (registry, runtime, reports, catalog)

### 1. Consumer registry contract

- [ ] 1.1 Extend `ComponentDefinition` (or sibling metadata) with `allowed_roles`, `input_contract`, `output_contract`, `side_aware`, `feature_requirements`, `params_schema`, `diagnostics_contract`
- [ ] 1.2 Populate `allowed_roles` for v1 components: `rsi_signal_exit`, `ema_cross_loss_exit`, `atr_stop_loss`, `atr_take_profit`, `adx_di_threshold`, `phase_runtime_exit`, management components
- [ ] 1.3 Add validate-time role resolution: JSON path + explicit `role` on `runtime_exits` rules → registry lookup → hard reject if disallowed
- [ ] 1.4 Test: registry rejects component used in disallowed role (`atr_stop_loss` in `runtime_exits`)

### 2. Spec types and runtime_exits wire shape

- [ ] 2.1 Generalize `RuntimeExitRuleSpec` to support `rsi_signal_exit`, `ema_cross_loss_exit`, and `phase_runtime_exit` with `role`, `exit_kind`, `activate_when`, typed `params`
- [ ] 2.2 Reject `runtime_exits` without `activate_when`; reject `exit_kind: "signal"`; reject unknown `component_id`; reject role mismatch
- [ ] 2.3 Test: `rsi_signal_exit` validates in both `exit_policy.signal_exit` and `exit_management.runtime_exit` with `activate_when`
- [ ] 2.4 Test: `ema_cross_loss_exit` validates in both consumers
- [ ] 2.5 Test: existing `exit_policy`-only configs still validate and run unchanged

### 3. Runtime consumer adapter

- [ ] 3.1 Refactor `evaluate_runtime_exits` to dispatch by `component_id` through consumer adapters (no duplicated RSI/EMA math)
- [ ] 3.2 Wire feature planning for runtime-only `rsi_signal_exit` / `ema_cross_loss_exit` rules
- [ ] 3.3 Preserve delayed activation: evaluate end-of-bar N, arm from bar N+1; fill price = bar close (no intrabar)
- [ ] 3.4 Test: runtime RSI does not trigger before runner
- [ ] 3.5 Test: runtime EMA cross does not trigger before runner
- [ ] 3.6 Test: runtime RSI triggers after runner (long RSI >= threshold; short RSI <= threshold)
- [ ] 3.7 Test: runtime EMA cross triggers after runner (long bearish cross; short bullish cross)
- [ ] 3.8 Test: runtime RSI/EMA exit price equals bar close on winning bar

### 4. Arbitration and execution integration

- [ ] 4.1 Extend `ExitArbitrator` / `ExitCandidate` for v1 sub-priority: protective runtime → take runtime → market_close runtime → signal
- [ ] 4.2 Ensure no new trade execution path; managed provider still called from existing execution layer only
- [ ] 4.3 Test: no new trade path introduced (parity test: `exit_policy`-only config vs baseline)
- [ ] 4.4 Test: `phase_runtime_exit` configs still behave per delayed-arm semantics

### 5. Reports and managed events (normalized exit_layer)

- [ ] 5.1 Emit `runtime_exit_triggered` / `runtime_exit_executed` with `exit_layer`, `exit_owner`, `component_id`, `role`, `rule_id`, `exit_kind`, phase, side, price, bar_index, MFE/MAE, bars_in_trade, metadata
- [ ] 5.2 Narrow existing coarse `exit_layer: exit_management` to precise layers (`exit_management.stop_rule`, etc.); add `exit_owner`
- [ ] 5.3 Add variant `exit_layer_breakdown` with precise keys (no `exit_management.other`); add `runtime_exit_breakdown` by `component_id` / `rule_id`
- [ ] 5.4 Add runner capture summaries for runtime RSI/EMA vs initial SL in runner phase
- [ ] 5.5 Test: reports distinguish `exit_policy` vs `exit_management.runtime_exit`; trade `exit_layer` matches breakdown keys

### 6. BFF catalog

- [ ] 6.1 Add `allowed_roles: list[str]` to `ComponentSchema` in `research_api/contracts/catalog.py`
- [ ] 6.2 Expose roles on `rsi_signal_exit`, `ema_cross_loss_exit`, `phase_runtime_exit`, `atr_stop_loss`, `adx_di_threshold`, etc.
- [ ] 6.3 Add parity test: research registry `allowed_roles` == BFF catalog for each shared `component_id`

### 7. Smoke fixtures (Slice 1)

- [ ] 7.1 Add smoke spec under `research/experiments/specs/smoke/` for runner ADX + `disable_initial_tp` + RSI/EMA runtime exits
- [ ] 7.2 Run smoke configs end-to-end; verify reports show `exit_layer: exit_management.runtime_exit`

---

## CHECKPOINT (mandatory stop before Slice 2)

Do not start Composer authoring until all items below pass:

- [ ] C.1 Hand-authored JSON configs validate and backtest (runner phase + RSI take + EMA protective runtime exits)
- [ ] C.2 All Slice 1 pytest targets green
- [ ] C.3 Smoke runner RSI/EMA configs run without regression vs `exit_policy`-only baseline on same fixture
- [ ] C.4 Reports: `exit_layer_breakdown` keys match per-trade `exit_layer`; `exit_owner` rollup correct; zero pre-runner runtime RSI/EMA exits in runner-gated config

---

## Slice 2 — Composer authoring (after CHECKPOINT)

- [ ] 8.1 Add `runtime_exits` authoring section with allowlisted component picker (`rsi_signal_exit`, `ema_cross_loss_exit`, `phase_runtime_exit`)
- [ ] 8.2 Require `activate_when` and `exit_kind` (`take_profit` | `protective_exit` | `market_close`) in Composer forms; reject `signal`
- [ ] 8.3 Manual Workbench: validate round-trip for runner RSI + EMA cross runtime exit draft
