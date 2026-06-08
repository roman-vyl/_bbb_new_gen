## 1. Registry foundation and breaking contract (research)

- [ ] 1.1 Add `phase_rule_conditions/` module with allowlisted registry, `EvaluationResult`, and dispatcher (`validate`, `plan_features`, `evaluate`)
- [ ] 1.2 Replace `PhaseRuleConditionSpec` with component-style `{ component_id, params }` in `spec.py`; remove `EXIT_MANAGEMENT_CONDITION_TYPES` / `condition.type`
- [ ] 1.3 Update `instance_loader.py`: parse `component_id` + `params`; reject `condition.type` with explicit legacy error; reject unknown `component_id`
- [ ] 1.4 Add contract tests: valid shapes per component, legacy `type` rejection, unknown `component_id` rejection, `bars_in_trade` non-integer threshold rejection

## 2. Built-in condition components (research)

- [ ] 2.1 Implement `mfe_atr` component: validate params, plan ATR, evaluate (parity with current `_condition_met` branch)
- [ ] 2.2 Implement `mfe_pct` component: validate params, evaluate (parity tests)
- [ ] 2.3 Implement `bars_in_trade` component: validate `params.threshold` as integer `>= 1` (reject `1.5` etc.), evaluate (parity tests)
- [ ] 2.4 Wire `evaluate_phase_rules` to registry dispatcher; remove `_condition_met` type switch
- [ ] 2.5 Wire `build_feature_plan` to registry `plan_features` for all phase rules

## 3. adx_di_threshold component (research)

- [ ] 3.1 Implement `adx_di_threshold`: validate params (`timeframe`, `period`, `adx_threshold`, `require_di_alignment`)
- [ ] 3.2 Plan ADX/+DI/-DI via shared helper (independent of blockers)
- [ ] 3.3 Evaluate side-aware ADX/DI on end-of-bar; NaN → not met with `indicator_not_ready` diagnostic
- [ ] 3.4 Emit `phase_changed` metadata with `condition_component_id` and ADX/DI diagnostics
- [ ] 3.5 Tests: long/short aligned DI, opposing DI, missing indicator, delayed BE (N vs N+1)

## 4. Config rewrite and smoke (research)

- [ ] 4.1 Rewrite in-repo smoke/experiment JSON using `condition.component_id` + `params` (including `exit_management_managed_smoke.json`, diagnostic smoke, experiment YAMLs)
- [ ] 4.2 Add smoke fixture: `protected` via `adx_di_threshold` (base/5m) + `break_even_stop` at protected
- [ ] 4.3 Add smoke fixture: `runner` via `adx_di_threshold` (1h) + `disable_initial_tp` at runner
- [ ] 4.4 Grep repo for `condition.type` in phase_rules and eliminate or confirm test-only legacy cases

## 5. Composer (frontend)

- [ ] 5.1 Replace `PHASE_RULE_CONDITION_TYPES` with condition component catalog (`component_id` + param schemas)
- [ ] 5.2 Update `PhaseRulesEditor.tsx` to author `condition.component_id` + `params` per component
- [ ] 5.3 Update `defaultDiagnosticPhaseRules` / `createBlankPhaseRule` to component-style `mfe_atr`
- [ ] 5.4 Validate rejects `condition.type` in drafts; tests for all four components and round-trip
- [ ] 5.5 Remove UI paths that emit flat `condition.type` fields

## 6. Acceptance verification

- [ ] 6.1 `python -m pytest -q` — registry, parity, adx_di_threshold, contract rejection tests pass
- [ ] 6.2 Run rewritten managed smoke backtest — phase semantics unchanged for mfe_atr equivalents
- [ ] 6.3 Run adx_di_threshold managed smoke — `phase_changed` events show `condition_component_id: adx_di_threshold`
- [ ] 6.4 Composer: save/load round-trip on component-style phase rules + stop_management pairing
- [ ] 6.5 Confirm `data_engine/` untouched (`git diff --stat data_engine/` empty)

## 7. Research experiment grid (post-acceptance, optional same PR)

- [ ] 7.1 Experiment YAML skeleton: protected sweep ADX 30/35/40/45 vs MFE/ATR baseline (research §8.A)
- [ ] 7.2 Experiment YAML skeleton: runner sweep 1h ADX 20–40 (research §8.B)
