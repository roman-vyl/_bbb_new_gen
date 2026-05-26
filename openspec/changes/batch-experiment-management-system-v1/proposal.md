## Why

Research today runs one external strategy config → one JSON report via `research/strategies/ema_pullback`. We need a **Batch Experiment Management System** above strategy runners: input specs, candidate contracts, validation, execution policy, reproducibility, summary extraction, result persistence, and failure handling—without turning `ema_pullback` into an optimizer or grid search.

**Experiment BatchRunner v1** is the first execution module inside that system: it runs validated single-instance candidates sequentially and delegates every strategy run to the existing ema_pullback runner. This establishes the experiment layer boundary before adding smarter experiment types (e.g. entry-edge barrier diagnostics).

## What Changes

Introduce the **Batch Experiment Management System** (`research/experiments/`, capability `research-experiments`). v1 delivers one execution module plus system-wide concerns:

| System concern | v1 artifact |
|----------------|-------------|
| Input contracts | `ExperimentBatchSpec`, `ExperimentCandidateSpec` (`models.py`) |
| Validation preflight | `load_and_validate_batch_spec` — no backtests until batch passes |
| Execution policy | **Experiment BatchRunner v1** (`batch_runner.py`) — sequential runs, failure isolation |
| Reproducibility | `batch_spec_path` / `batch_spec_hash`; per-candidate `strategy_config_path` / `strategy_config_hash` (SHA256) |
| Timing | `started_at`, `finished_at`, `duration_sec` on batch and each candidate |
| Report linkage | `run_id`, `report_path`, `config_id`, `report_schema_version` on each candidate result |
| Summary extraction | `extract_candidate_summary` — schema v5 report → candidate metrics |
| Result persistence | `storage.py` → `research/experiments/results/batches/` |
| Local operator entrypoint | `cli.py` — `validate --spec`, `run-batch --spec` (debug/local only; not final UX) |
| Documentation | `README.md` — system purpose, BatchRunner v1 scope, non-goals |

Each candidate config MUST contain exactly one `instances` item and its market `symbol`/`timeframe` MUST match the batch-level values. Candidate configs reference existing strategy config files using the envelope from [`research/experiments/config_loader.py`](../../../research/experiments/config_loader.py).

**Non-goals (explicit)**

- Not an optimizer, parameter sampler, grid/random/Bayesian search, or winner selection.
- Not entry-edge barrier diagnostics (+5/−5 ATR first).
- No changes to `data_engine/`, legacy bybit-bot, `frontend/`, or `research_api`.
- No changes to `ema_pullback` strategy semantics; at most a small public adapter if the runner entrypoint needs refinement.
- No global analytics DB, Workbench display, or BFF endpoints in v1.
- CLI is not the final UX for the system; future frontend/API integration is out of scope for v1.
- Batch system does not expose `--db-path` or own data source / DB selection (delegates to ema_pullback runner environment).

## Capabilities

### New Capabilities

- `research-experiments`: **Batch Experiment Management System** — batch contracts, validation preflight, reproducibility hashes, timing, execution policy, summary extraction, batch result persistence, failure policy, minimal local CLI. **v1 execution module: Experiment BatchRunner** (`batch_runner.py`).

### Modified Capabilities

- _(none — ema_pullback report schema and strategy execution contract unchanged; the system consumes existing reports only)_

## Impact

| Layer | Scope |
|-------|--------|
| **research** | Extended `research/experiments/` (`models.py`, `validation.py` or equivalent, `batch_runner.py`, `storage.py`, `cli.py`, `README.md`, example specs); optional minimal adapter in `research/strategies/ema_pullback/execution/runner.py` if needed for programmatic single-candidate runs |
| **tests** | `tests/test_experiment_batch_runner.py`, `tests/test_experiment_models.py` (validation, hashes, timing, single-instance rule) |
| **data_engine / research_api / frontend** | _none_ |

**Reference docs**: [`docs/research/README.md`](../../../docs/research/README.md), [`docs/research/strategy_constructor_master_plan.md`](../../../docs/research/strategy_constructor_master_plan.md), [`openspec/specs/ema-pullback-report-diagnostics/spec.md`](../../specs/ema-pullback-report-diagnostics/spec.md) (report field semantics for summary extraction).
