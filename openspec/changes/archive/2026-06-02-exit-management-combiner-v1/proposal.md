## Why

Stateful exit management should extend the existing `ema_pullback` bar-by-bar research runtime, not live inside `vectorbt.adjust_sl_func_nb` callbacks and not become a separate orchestration engine beside the current pipeline.

This change establishes a small Exit Management Combiner for `break_even_stop` so future stop moves, trailing stops, and take-profit management can share one domain state machine and one diagnostics source.

## What Changes

- Add a research-layer Exit Management Combiner that consumes existing compiled entries, exit-policy outputs, profile/context state, and OHLCV.
- Add `break_even_stop` as the first managed rule with initial-risk freeze, pending/effective stop state, next-bar semantics, and tighten-only behavior.
- **BLOCKER:** reject configs (validate + spec) that enable `break_even_stop` without a resolvable initial `stop_loss` from `exit_policy` for the same effective exit group (always_on ∪ locked profile).
- Add semantic config under `trade_management.exit_management` for `always_on` and profile-scoped rules (separate from `exit_policy.exits`; see **Example configuration** in `design.md`).
- Add Composer authoring: catalog sections and UI lists for exit-management rules in **Always On**, **aligned**, **countertrend**, and **neutral** (same buckets as exit policy, different wire path).
- Keep the current `vectorbt` path for configs without stateful exit-management rules.
- Route managed configs through the combiner path and emit trade records compatible with existing metrics/report builders.
- Add backend diagnostics for closed trades through optional `trade_records[].break_even`.
- Attribute managed-path exits (including `exit_reason: break_even:<instance_id>` when the moved stop closes the trade); chart exit marker **BE**, not `unknown`/UNK.
- Add Signal Trace optional read-only fields sourced from the same combiner diagnostics.
- Add API/frontend read-only passthrough/display for the diagnostics only after backend behavior is stable.
- Remove the old `break-even-stop-management-v1` direction as a source of truth.

Non-goals:

- No changes to `data_engine/`.
- No setup, trigger, blocker, context provider, or candle cache changes.
- No frontend recomputation of break-even logic.
- No chart stop-line overlay in this slice.
- No standalone custom backtest orchestrator beside the existing research runtime.
- No domain break-even logic inside `vectorbt.adjust_sl_func_nb`.

## Capabilities

### New Capabilities

- `exit-management-combiner`: Research runtime capability for stateful exit-management rules, starting with `break_even_stop`, integrated into the existing `ema_pullback` bar-by-bar flow.
- `composer-exit-management`: Composer catalog + UI to author `trade_management.exit_management` rules in always_on and profile buckets.
- `ema-pullback-signal-trace`: Signal Trace exposes optional per-bar exit-management diagnostics without duplicating break-even math.

### Modified Capabilities

- `ema-pullback-report-diagnostics`: Closed trade records can expose optional `break_even` diagnostics sourced from the combiner.
- `workbench-chart-trade-diagnostics`: Selected trade details can display optional break-even diagnostics read-only when present.

## Impact

Affected layer(s):

- `research`: config models, exit-management domain runtime, backtest integration, report diagnostics, Signal Trace.
- `research_api`: component catalog + validate for exit-management rules; optional contract passthrough for report/trade records and Signal Trace fields.
- `frontend`: Composer exit-management sections; read-only type/display support for optional break-even diagnostics.

Likely touched files/modules:

- `research/strategies/ema_pullback/spec.py`
- `research/strategies/ema_pullback/component_builders.py`
- `research/strategies/ema_pullback/execution/exits.py`
- `research/strategies/ema_pullback/execution/backtest.py`
- `research/strategies/ema_pullback/execution/results.py`
- `research/strategies/ema_pullback/execution/signal_trace.py`
- new `research/strategies/ema_pullback/execution/exit_management.py`
- `research_api/services/component_catalog.py`, `research_api/services/config_service.py`
- `research_api/contracts/*` and `research_api/services/signal_trace_service.py`
- `frontend/src/features/composer/*` (ComposerPanel, composerDraft, catalog sections)
- frontend report/selected-trade detail types and components

Reference docs:

- `docs/research/18_exit_management_combiner_start.md`
- `docs/research/16_exit_reason_attribution.md`
- `docs/research/17_exit_policy_entry_lock_spike.md`
