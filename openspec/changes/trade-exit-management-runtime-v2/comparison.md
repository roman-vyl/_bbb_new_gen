# Slice 9 — Baseline vs managed comparison

Generic paired-run comparison between baseline and managed reports. Populates `metrics.baseline_vs_managed_summary` on the **managed** variant.

**Workbench UX:** Slice 10 surfaces this summary in the Workbench (empty state when compare not run; populated view after paired compare). See `tasks.md` § Slice 10.C and `design.md` § Composer and Workbench UX.

## Helper location

| Piece | Path |
|-------|------|
| Aggregator | `research/strategies/ema_pullback/execution/managed_comparison.py` |
| Placeholder re-export | `research/strategies/ema_pullback/execution/results.py` → `baseline_vs_managed_summary_placeholder()` |
| Standalone CLI | `python -m research.experiments.compare_baseline_managed` |

## Trade pairing

Closed trades are matched by **pair key**:

1. `{direction}:{entry_idx}` when `entry_idx >= 0` (preferred — aligns managed `"short:979"` with baseline numeric `trade_id` on same entry bar)
2. Fallback: `{direction}@{entry_time_ms}`
3. Fallback: `{direction}:{trade_id}`

Unpaired managed trades are ignored for category lists and transition matrix.

## Populating `baseline_vs_managed_summary`

Single managed run (no baseline pair) keeps **placeholder** empty arrays from backtest (`backtest.py`).

After paired baseline + managed runs:

```bash
python -m research.experiments.compare_baseline_managed \
  --baseline research/results/runs/<diagnostic_or_baseline_run>.json \
  --managed research/results/runs/<managed_run>.json \
  --output research/results/runs/<managed_run>.compared.json
```

Omit `--output` to overwrite `--managed` in place.

Optional: `--baseline-variant`, `--managed-variant` when reports contain multiple variants.

## Categories (generic)

| Field | When appended |
|-------|----------------|
| `saved_by_managed_stop` | Managed close via `exit_management` + `managed_stop` candidate; `managed_pnl > baseline_pnl` |
| `hurt_by_managed_stop` | Same managed stop close; `managed_pnl < baseline_pnl` |
| `take_disabled_then_won` | `active_take_at_exit` not `initial`; `managed_pnl > baseline_pnl` |
| `take_disabled_then_lost` | Take disabled at exit; `managed_pnl < baseline_pnl` |
| `runtime_exit_helped` | `runtime_exit` / `phase_runtime_exit`; `managed_pnl > baseline_pnl` |
| `runtime_exit_hurt` | Runtime exit; `managed_pnl < baseline_pnl` |

Each list entry includes: `pair_key`, trade ids, pnls, `pnl_delta`, exit layers, `managed_exit_candidate_type`, `managed_exit_component_id`, `active_take_at_exit`.

`be_helped` / `be_hurt` are **not** schema fields — derive from `saved_by_managed_stop` / `hurt_by_managed_stop` filtered by `managed_exit_component_id == "break_even_stop"`, or from `stop_management_breakdown["break_even_stop"]` via `derive_break_even_stop_view()`.

## `exit_layer_transition_matrix`

Counts paired trades by `{baseline_exit_layer}->{managed_exit_layer}`.

Example: `exit_policy->exit_management` when baseline closed on initial SL/TP path and managed closed via managed layer.

Exit layers are read from `trade_management.exit_layer`, record `exit_layer`, or inferred from `exit_kind` / `exit_reason` prefix.

## Paired smoke workflow (manual)

```bash
# 1. Baseline / control (diagnostic_only — same strategy params, no managed rules)
python research/strategies/ema_pullback/run.py \
  --config research/experiments/specs/smoke/exit_management_diagnostic_smoke.json

# 2. Managed (behavior-changing)
python research/strategies/ema_pullback/run.py \
  --config research/experiments/specs/smoke/exit_management_managed_smoke.json

# 3. Compare (use run artifacts from step 1 and 2)
python -m research.experiments.compare_baseline_managed \
  --baseline research/results/runs/<diagnostic_run_id>.json \
  --managed research/results/runs/<managed_run_id>.json \
  --output research/results/runs/<managed_run_id>.compared.json
```

Inspect `variants[0].metrics.baseline_vs_managed_summary` in the compared artifact.

## Tests

`tests/test_managed_comparison.py` — synthetic paired trade sets + report post-processor.

## Slice 10 / Slice 11 expectations

| Layer | Responsibility |
|-------|----------------|
| Slice 9 (done) | Research helper + CLI (`compare_baseline_managed`) |
| Slice 10 | Workbench comparison panel: **comparison not generated** vs populated; honest disclaimer copy; optional compare trigger affordance |
| Slice 11 | Comparison smoke re-run + Composer-managed Workbench acceptance on compared artifact |
