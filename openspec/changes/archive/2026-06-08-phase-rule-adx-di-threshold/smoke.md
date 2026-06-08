# Smoke and research verification plan

Aligned with `docs/research/22_phase_rule_condition.md` §5 and §8.

## Fixture rewrites (required)

Update existing smoke specs to component-style `condition` before adding new cases:

| Fixture | Change |
|---------|--------|
| `research/experiments/specs/smoke/exit_management_managed_smoke.json` | `mfe_atr` rules → `component_id` + `params` |
| `research/experiments/specs/smoke/exit_management_diagnostic_smoke.json` | same |
| Any experiment YAML referencing `condition.type` | rewrite or fail validate |

## New smoke cases

### S1 — Protected by 5m ADX impulse + BE

```json
{
  "rule_id": "protected_5m_adx_di_40",
  "to_phase": "protected",
  "condition": {
    "component_id": "adx_di_threshold",
    "params": {
      "timeframe": "base",
      "period": 14,
      "adx_threshold": 40,
      "require_di_alignment": true
    }
  }
}
```

Paired `stop_management`:

```json
{
  "rule_id": "be_at_protected",
  "component_id": "break_even_stop",
  "activate_when": { "phase_at_least": "protected" },
  "params": { "buffer_type": "none", "buffer": 0.0 }
}
```

**Verify:**

- `phase_changed` with `condition_component_id: adx_di_threshold`
- BE not active on same bar as phase transition
- BE candidate from bar N+1 when applicable

### S2 — Runner by 1h ADX impulse + disable TP

```json
{
  "rule_id": "runner_1h_adx_di_30",
  "to_phase": "runner",
  "condition": {
    "component_id": "adx_di_threshold",
    "params": {
      "timeframe": "1h",
      "period": 14,
      "adx_threshold": 30,
      "require_di_alignment": true
    }
  }
}
```

Paired `take_management`:

```json
{
  "rule_id": "disable_initial_tp_at_runner",
  "component_id": "take_profile_switch",
  "activate_when": { "phase_at_least": "runner" },
  "params": { "action": "disable_initial_tp" }
}
```

**Verify:**

- Runner phase events fire with 1h ADX/DI diagnostics in metadata
- Initial TP suppressed in candidate view from bar after runner transition

### S3 — Parity baseline (migrated mfe_atr)

Run rewritten managed smoke with only `mfe_atr` component-style rules.

**Verify:** trade count, exit reasons, and phase progression match pre-migration behavior for equivalent thresholds (within existing numeric tolerance).

### S4 — Legacy rejection

Attempt to load config with `condition.type: "mfe_atr"`.

**Verify:** validation fails before backtest; error mentions legacy `condition.type`.

## Research sweeps (post-smoke, optional)

### A — Protected / BE by 5m ADX

Sweep `params.adx_threshold`: 30, 35, 40, 45. Compare against MFE/ATR `protected` baseline.

Metrics: protected count, BE exits, saved/hurt managed stop, PF, winrate, long/short split.

### B — Runner by 1h ADX

Sweep `params.adx_threshold`: 20, 25, 30, 35, 40. Optional `lock_profit_stop` at runner.

Metrics: runner activation timing, TP suppression benefit, runner+SL categories.

## CLI checks

```bash
python -m pytest -q tests/test_trade_runtime_diagnostics.py tests/test_exit_management_contracts.py
python research/strategies/ema_pullback/run.py --config <smoke-yaml>
```

Composer: save/load round-trip on S1 fixture shape in Exit Management panel.
