## 1. System contracts (`models.py`)

- [x] 1.1 Add `research/experiments/models.py`: `ExperimentBatchSpec`, `ExperimentCandidateSpec`, `ExperimentCandidateResult`, `ExperimentBatchResult` (dataclasses + JSON load/dump helpers)
- [x] 1.2 **Batch result fields:** `batch_spec_path`, `batch_spec_hash`, `started_at`, `finished_at`, `duration_sec`, plus existing identity/count fields
- [x] 1.3 **Candidate result fields:** `run_id`, `strategy_config_path`, `strategy_config_hash`, `started_at`, `finished_at`, `duration_sec`, `report_path`, `config_id`, `report_schema_version`, summary metrics
- [x] 1.4 Update `research/experiments/__init__.py` docstring: **Batch Experiment Management System** (capability `research-experiments`); Experiment BatchRunner v1 as first execution module

## 2. Validation preflight (`validation.py` or equivalent)

- [x] 2.1 Implement `load_and_validate_batch_spec(path)` / `validate_batch_spec_with_candidate_configs(spec)`
- [x] 2.2 Checks: batch structure, unique `candidate_id`, non-empty candidates, supported `family`, candidate paths exist/loadable
- [x] 2.3 **Single-instance rule:** each candidate config MUST have exactly one `instances` item; reject otherwise
- [x] 2.4 **Market match:** each candidate config market `symbol`/`timeframe` MUST match batch `symbol`/`timeframe`; reject before any run
- [x] 2.5 Compute SHA256 file hashes for batch spec and each candidate config during validation or at run start
- [x] 2.6 Validation MUST NOT call strategy runner or start backtests

## 3. Summary extraction (system helper)

- [x] 3.1 Add pure function `extract_candidate_summary(report_payload)` reading `variants[0]` (single-instance configs only)
- [x] 3.2 Map schema v5 paths: `metrics.total`, `fee_diagnostics`, `quality_flag_breakdown.<flag>.trades`; use `null` for missing quality fields
- [x] 3.3 Extract `run_id`, `config_id`, `report_schema_version` from report payload

## 4. Experiment BatchRunner v1 (`batch_runner.py`)

- [x] 4.1 Implement `BatchRunner.run(batch_spec, *, batch_spec_path)` — requires pre-validated spec; sequential loop; runtime failure isolation
- [x] 4.2 Record batch-level and per-candidate `started_at`, `finished_at`, `duration_sec`
- [x] 4.3 Wire candidate execution to `run_strategy_specs_from_config` (or adapter returning `run_id` + report paths)
- [x] 4.4 On success: populate `run_id`, `report_path`, hashes, summary, `status="ok"`; on runtime failure: capture error, continue

## 5. Result persistence (`storage.py`)

- [x] 5.1 Write/read batch result to `research/experiments/results/batches/<experiment_id>.json`
- [x] 5.2 Ensure `results/batches/` is gitignored if runtime-only (prefer gitignore)

## 6. CLI, examples, README (local/debug entrypoints)

- [x] 6.1 Add `research/experiments/cli.py` with argparse subcommands:
  - `validate --spec PATH`
  - `run-batch --spec PATH`
- [x] 6.2 `run-batch` stdout (required only): `experiment_id`, `candidates_count`, `ok_count`, `failed_count`, `output_path`, `duration_sec` — **no best-candidate / optimizer ranking**
- [x] 6.3 Document CLI as minimal local operator/debug entrypoint; not final UX; frontend/API out of scope; **no `--db-path`** — batch system does not own data source / DB selection
- [x] 6.4 Add `research/experiments/specs/example_batch.json` and two **single-instance** candidate configs
- [x] 6.5 Add `research/experiments/README.md`: system overview, BatchRunner v1, single-instance rule, validation, result path `results/batches/`, reproducibility hashes, non-goals

## 7. Tests — models / validation

- [x] 7.1 `tests/test_experiment_models.py`: batch/candidate result field serialization (hashes, timing, `run_id`)
- [x] 7.2 Duplicate `candidate_id` rejects before execution
- [x] 7.3 Missing candidate config path rejects during validation
- [x] 7.4 Multi-instance candidate config (2+ `instances`) rejects before execution
- [x] 7.5 Candidate market symbol/timeframe mismatch rejects before execution
- [x] 7.6 `validate --spec` / validation function does NOT call strategy runner (mock/assert)

## 8. Tests — runner / extraction

- [x] 8.1 `tests/test_experiment_batch_runner.py`: mock runner, two candidates, assert full `ExperimentBatchResult` shape
- [x] 8.2 Summary extraction from v5 report; quality flag counts
- [x] 8.3 v4-like report without quality fields → null quality counts, no exception
- [x] 8.4 Runtime failure isolation: first candidate fails, second succeeds
- [x] 8.5 Invalid batch validation fails before any candidate run (no runner calls)

## 9. Test gate

- [x] 9.1 Run: `python -m pytest -q tests/test_experiment_batch_runner.py tests/test_experiment_models.py`
- [x] 9.2 Run: `python -m pytest -q tests/test_ema_pullback_results_artifact.py tests/test_ema_pullback_run_metrics.py`
- [x] 9.3 Run full gate: `python -m pytest -q`

## 10. Validation (manual)

- [x] 10.1 Smoke: `python -m research.experiments.cli validate --spec research/experiments/specs/example_batch.json`
- [x] 10.2 Smoke: `python -m research.experiments.cli run-batch --spec …` (optional if DB/candles available)
- [x] 10.3 Confirm `git diff` shows no changes under `data_engine/`, `frontend/`, `research_api/`, or legacy bybit-bot paths

## 11. Strategy adapter (only if needed)

- [x] 11.1 If `run_strategy_specs_from_config` cannot return `run_id` + report paths cleanly, add minimal adapter in `runner.py` without moving orchestration into strategy layer
