# Slice 6 — Backend smoke / acceptance

End-to-end proof that managed v2 runs through `run.py` and serializes Slice 5 report fields in `research/results/latest.json`.

**Status:** ACCEPTED (2026-06-08); Slice 11 re-verified (2026-06-08)

## Fixtures

| Mode | Config |
|------|--------|
| `diagnostic_only` (control) | `research/experiments/specs/smoke/exit_management_diagnostic_smoke.json` |
| `managed` (behavior-changing) | `research/experiments/specs/smoke/exit_management_managed_smoke.json` |

Both share the same base strategy (`relaxed_w9_r10_wlb20_ulb75_ab8`, SL 4×ATR, safety TP 40×ATR). Managed adds `stop_management`, `take_management`, `runtime_exits`, and an exhaustion phase rule.

## Commands

```bash
# Control — diagnostic_only parity path
python research/strategies/ema_pullback/run.py \
  --config research/experiments/specs/smoke/exit_management_diagnostic_smoke.json

# Managed — v2 execution loop + report serialization
python research/strategies/ema_pullback/run.py \
  --config research/experiments/specs/smoke/exit_management_managed_smoke.json
```

Artifact: `research/results/latest.json` (overwritten by each run).

## Inspection script

```bash
python -c "
import json
from pathlib import Path
from collections import Counter

data = json.loads(Path('research/results/latest.json').read_text(encoding='utf-8'))
variant = data['variants'][0]
trades = variant.get('trade_records', [])
metrics = variant.get('metrics', {})
tm_events = variant.get('trade_management_events', [])
summary = metrics.get('trade_management_summary', {})
baseline_vs = metrics.get('baseline_vs_managed_summary')
managed_blocks = [t.get('trade_management') for t in trades if t.get('trade_management')]
exit_layers = Counter(b['exit_layer'] for b in managed_blocks if b.get('exit_layer'))
print('trades:', len(trades))
print('trade_management_events:', len(tm_events))
print('has baseline_vs_managed_summary:', baseline_vs is not None)
print('exit_layers:', dict(exit_layers))
print('stop_management_breakdown:', summary.get('stop_management_breakdown'))
print('take_management_breakdown:', summary.get('take_management_breakdown'))
print('runtime_exit_breakdown:', summary.get('runtime_exit_breakdown'))
"
```

## Verified results (2026-06-08)

### diagnostic_only (control)

| Check | Result |
|-------|--------|
| `status=ok` | yes |
| Trades | 329 |
| `trade_management_events` | 1050 |
| `trade_management_summary` | present |
| `baseline_vs_managed_summary` | **absent** |
| Managed breakdown keys | **absent** |
| `exit_layer` | `stop_loss` / `take_profit` only (baseline `exit_policy`) |
| Legacy BE path | no evidence |

### managed (behavior-changing)

| Check | Result |
|-------|--------|
| `status=ok` | yes |
| Trades | 384 (differs from diagnostic — expected) |
| `trade_management_events` | 2759 |
| `baseline_vs_managed_summary` | **present** (placeholder) |
| `exit_layer` | `exit_management` 285, `exit_policy` 99 |
| `exit_candidate_type` | `managed_stop` 229, `runtime_exit` 56, `stop_loss` 99 |
| `stop_management_breakdown` | `break_even_stop` 131, `lock_profit_stop` 98 |
| `take_management_breakdown` | `take_profile_switch` 156 (`disable_initial_tp`) |
| `runtime_exit_breakdown` | `phase_runtime_exit` 56 (exhaustion closes) |
| `active_take_at_exit` | `initial` 228, `disable_initial_tp` 156 |
| Legacy BE path | no evidence |

## Acceptance checklist

- [x] Smoke run completes with `status=ok` (both fixtures).
- [x] `diagnostic_only` — control mode; baseline exit layers only; no managed breakdowns.
- [x] `managed` — single v2 managed runtime path (`run_managed_execution_loop`).
- [x] `trade_management_events` with managed event types (`phase_changed`, `active_stop_updated`, `active_take_updated`, `runtime_exit_triggered`, `exit_executed`, …).
- [x] Closed trades have `exit_layer`, `exit_rule_id`, `exit_component_id` where applicable.
- [x] `trade_management_summary.exit_layer_breakdown` populated on managed variant.
- [x] `stop_management` exercised — `break_even_stop`, `lock_profit_stop` in breakdown.
- [x] `take_management` exercised — `take_profile_switch` / `disable_initial_tp`.
- [x] `runtime_exits` exercised — `phase_runtime_exit` at exhaustion.
- [x] `exit_management` closes present and dominant (285 / 384).
- [x] `baseline_vs_managed_summary` placeholder present **only** in managed mode.
- [x] No evidence of legacy BE combiner / `run_managed_bar_loop` involvement.
- [x] Backend pytest suite Slices 1–5 green (see `tasks.md` §6.1).

## Slice map (reference)

| Slice | Status | Doc |
|-------|--------|-----|
| 6 | ACCEPTED | this file |
| 7–8 | ACCEPTED | `tasks.md` |
| 9 | Comparison tooling | `comparison.md` |
| 10 | Composer / managed UX | `tasks.md` § Slice 10 |
| 11 | Final smoke / archive | `tasks.md` § Slice 11 |

Slice 11 archive readiness runs **after** Slice 10 Composer acceptance.
