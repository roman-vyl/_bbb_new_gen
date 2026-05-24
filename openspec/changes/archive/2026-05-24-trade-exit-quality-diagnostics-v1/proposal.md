## Why

Current closed-trade diagnostics explain entry context and exit attribution, but they do not show whether a trade had real post-entry edge or how much of the available move the exit logic captured. This makes it hard to separate weak entries from good entries with poor exits, especially when evaluating `ema_cross` as a runner exit.

## What Changes

- Add direction-aware, post-trade MFE / MAE metrics to closed ema-pullback trade records.
- Add capture and giveback metrics that compare realized exit outcome against the best favorable excursion reached before exit.
- Add per-trade quality flags for high-MFE winners, high-MFE giveback failures, signal-exit winners, stop losses after low MFE, and stop losses after bad HTF context.
- Add variant-level aggregate breakdowns for quality flags and exit components so runner exits such as `ema_cross` can be judged systematically.
- Emit new generated reports as `report_schema_version = 5` while keeping readers compatible with existing v3/v4 artifacts.
- Surface the new optional fields through report readers, Workbench trade tables, filters, and selected-trade chart diagnostics.
- Keep all metric computation inside `research/strategies/ema_pullback/execution/`, preferably in a dedicated helper module called by `results.py`.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `ema-pullback-report-diagnostics`: extend closed-trade report diagnostics with direction-aware excursion, capture, giveback, quality flags, and aggregate breakdowns.

## Impact

- Affected layers: `research`, `research_api`, `frontend`.
- Research owns all metric calculation and report serialization in `research/strategies/ema_pullback/execution/`; no trading logic or diagnostics move into `data_engine`.
- `research_api` remains a read-only BFF that serves persisted report fields without recomputing metrics.
- `frontend` displays and filters optional report fields only; it does not calculate MFE, MAE, capture, giveback, or quality flags.
- Relevant docs: `docs/research/README.md`, `docs/research/strategy_constructor_master_plan.md`, and `docs/frontend/implementation_plan.md`.
- Non-goals: no optimizer, no parameter search, no change to signal generation or portfolio simulation, no detailed HTF resistance-stack taxonomy beyond coarse bad-context flags, and no use of future data for entry context.
