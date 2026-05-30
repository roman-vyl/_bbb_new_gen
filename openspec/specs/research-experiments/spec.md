# research-experiments Specification

## Purpose

Batch Experiment Management System in `research/experiments/`: batch input contracts, validation preflight, sequential execution via Experiment BatchRunner v1, reproducibility metadata, candidate summary extraction, and batch result persistence. Delegates strategy runs to existing `ema_pullback` runner; no optimizer, frontend, or Data Engine changes in v1.

## Requirements

### Requirement: Batch Experiment Management System scope

The research layer SHALL provide a **Batch Experiment Management System** in `research/experiments/` responsible for batch experiment input contracts, validation preflight, execution policy, reproducibility metadata, timing, candidate summary extraction, batch result persistence, and failure policy. The system MUST NOT compute trading signals, strategy indicators, or trade-quality formulas itself.

**Experiment BatchRunner v1** (`research/experiments/batch_runner.py`) is the first execution module within this system; it SHALL run **already-validated** candidates sequentially by delegating each run to the existing ema_pullback strategy runner.

The system MUST NOT be imported from `research/strategies/ema_pullback` (except the pre-existing `config_loader` dependency direction).

The system MUST NOT implement optimizer logic, parameter grid/search, entry-edge barrier diagnostics, frontend integration, research_api endpoints, or Data Engine changes in v1.

#### Scenario: System documentation names layer and v1 module distinctly

- **WHEN** a developer reads `research/experiments/README.md`
- **THEN** it describes the Batch Experiment Management System as the experiment orchestration layer
- **AND** it identifies Experiment BatchRunner v1 as the first execution module
- **AND** it states the system is not an optimizer, parameter sampler, grid/search tool, or entry-edge barrier diagnostics
- **AND** it states CLI is a local/debug entrypoint, not the final UX

#### Scenario: Strategy layer does not depend on batch management modules

- **WHEN** static import analysis is applied to `research/strategies/ema_pullback`
- **THEN** no module imports `research.experiments.batch_runner` or batch result models

### Requirement: Experiment batch spec contract

The Batch Experiment Management System SHALL accept an `ExperimentBatchSpec` document with at least:

- `experiment_id` (non-empty string)
- `family` (v1: `"ema_pullback"`)
- `symbol` and `timeframe` (batch-level metadata)
- `candidates` (non-empty list of `ExperimentCandidateSpec`)

Each `ExperimentCandidateSpec` SHALL include:

- `candidate_id` (unique within the batch)
- `strategy_config_path` (path to an existing external strategy config file loadable by `research/experiments/config_loader.load_strategy_config_file`)

Optional fields: `description`, `metadata`, `result_options`.

#### Scenario: Valid batch spec passes validation without backtests

- **WHEN** a JSON file contains a valid `ExperimentBatchSpec` with two candidates referencing loadable single-instance config paths whose markets match batch `symbol` and `timeframe`
- **THEN** validation succeeds without error
- **AND** no strategy backtest is started

#### Scenario: Invalid batch spec fails before execution

- **WHEN** a batch spec has duplicate `candidate_id` values, an empty `candidates` list, or an unsupported `family`
- **THEN** validation fails with a non-zero exit (CLI) or raised validation error (API/function)
- **AND** no candidate backtests are executed

### Requirement: Single-instance candidate config rule

Batch Experiment Management System v1 SHALL require each candidate `strategy_config_path` to reference a config file containing **exactly one** `instances` item.

Multi-instance candidate configs are out of scope for v1. If a candidate config contains zero or more than one instance, validation MUST fail before any strategy run.

#### Scenario: Multi-instance candidate config rejected at validation

- **WHEN** a batch spec references a candidate config with two or more `instances` entries
- **THEN** validation fails before any strategy runner invocation
- **AND** the error identifies the offending candidate config path

#### Scenario: Single-instance candidate config accepted

- **WHEN** each candidate config contains exactly one `instances` entry
- **THEN** validation passes the single-instance check

### Requirement: Batch market symbol and timeframe validation

Before execution, the system SHALL validate that each loaded candidate config market matches batch-level `symbol` and `timeframe`.

If any candidate market mismatch is found, validation MUST fail before running any candidate. This is a batch specification error, not a per-candidate runtime failure.

#### Scenario: Market mismatch rejects batch before execution

- **WHEN** batch `symbol` is `BTCUSDT` and `timeframe` is `5m` but a candidate config market is `ETHUSDT` or `1h`
- **THEN** validation fails before any strategy runner invocation
- **AND** no candidate backtests are executed

#### Scenario: Matching markets pass validation

- **WHEN** all candidate config markets match batch `symbol` and `timeframe`
- **THEN** validation passes the market consistency check

### Requirement: Validation preflight without backtests

The system SHALL provide a validation function (e.g. `load_and_validate_batch_spec(path)`) that:

- Validates batch spec structure and duplicate `candidate_id`
- Validates each `strategy_config_path` exists and is loadable
- Validates supported `family`
- Validates exactly one instance per candidate config
- Validates candidate market matches batch `symbol` / `timeframe`
- Does **not** invoke the strategy runner or start backtests

The CLI SHALL expose:

`python -m research.experiments.cli validate --spec <path>`

#### Scenario: Validate command succeeds without strategy runner

- **WHEN** `validate --spec` is invoked with a valid batch spec and candidate configs
- **THEN** the process exits 0
- **AND** the strategy runner is not called

#### Scenario: Validate command rejects missing candidate config

- **WHEN** a batch spec references a `strategy_config_path` that does not exist
- **THEN** validation fails before any strategy runner invocation

#### Scenario: Run-batch validates before execution

- **WHEN** `run-batch --spec` is invoked with an invalid batch spec
- **THEN** the process exits non-zero before executing any candidate

### Requirement: Experiment BatchRunner v1 sequential execution

Given a validated `ExperimentBatchSpec`, Experiment BatchRunner v1 SHALL execute candidates **sequentially** in list order. For each candidate it SHALL invoke the existing ema_pullback strategy runner using `strategy_config_path`.

#### Scenario: Two candidates produce two strategy reports

- **WHEN** a validated batch spec lists two candidates with distinct valid config paths
- **THEN** the strategy runner is invoked once per candidate
- **AND** each successful candidate yields a persisted strategy report under `research/results/`

### Requirement: Candidate result identity and report linkage

Each `ExperimentCandidateResult` SHALL include at minimum:

- `candidate_id`, `status`
- `run_id` (strategy report run identifier from ema_pullback runner)
- `report_path`
- `config_id`
- `report_schema_version`
- `strategy_config_path`, `strategy_config_hash`
- `started_at`, `finished_at`, `duration_sec`
- summary metrics when `status` is `"ok"`

#### Scenario: Successful candidate links to strategy report via run_id

- **WHEN** a candidate run completes successfully
- **THEN** the candidate result includes a non-empty `run_id`
- **AND** `report_path` points to the persisted strategy report for that `run_id`

### Requirement: Batch and candidate reproducibility metadata

`ExperimentBatchResult` SHALL record:

- `batch_spec_path` — path to the batch spec file used for the run
- `batch_spec_hash` — deterministic SHA256 hash of the batch spec file contents at run time

Each `ExperimentCandidateResult` SHALL record:

- `strategy_config_path` — from the candidate spec
- `strategy_config_hash` — deterministic SHA256 hash of the candidate config file contents at run time

#### Scenario: Batch result records input file hashes

- **WHEN** a batch run completes
- **THEN** the persisted batch result includes `batch_spec_path` and `batch_spec_hash`
- **AND** each candidate result includes `strategy_config_path` and `strategy_config_hash`

#### Scenario: Changed input file detectable via hash mismatch

- **WHEN** a batch spec or candidate config file is edited after a run
- **THEN** a new run produces a different hash for the modified file
- **AND** the stored result hash identifies the file version used at run time

### Requirement: Batch and candidate timing metadata

`ExperimentBatchResult` SHALL include `started_at`, `finished_at`, and `duration_sec` for the overall batch execution.

Each `ExperimentCandidateResult` SHALL include `started_at`, `finished_at`, and `duration_sec` for that candidate's execution window.

#### Scenario: Batch result records total duration

- **WHEN** a batch run completes
- **THEN** the batch result includes `started_at`, `finished_at`, and a positive `duration_sec`

#### Scenario: Candidate result records per-candidate duration

- **WHEN** a candidate run completes (success or runtime failure)
- **THEN** the candidate result includes `started_at`, `finished_at`, and `duration_sec`

### Requirement: Candidate summary extraction from schema v5 reports

For each successful candidate, the system SHALL build summary metrics by reading the persisted strategy report JSON and extracting at minimum:

- From `variants[0].metrics.total`: `trades`, `pnl`, `return_pct`, `profit_factor`, `win_rate`, `sharpe`, `max_drawdown`
- From `variants[0].metrics.fee_diagnostics` when present: `gross_pnl`, `total_fees_paid` (mapped to result `fees_paid`)
- From `variants[0].metrics.quality_flag_breakdown.<flag>.trades` when present for flags: `high_mfe_high_capture`, `high_mfe_low_capture`, `signal_exit_winner`, `signal_exit_giveback_failure`, `stop_loss_after_low_mfe`, `stop_loss_after_bad_context`

#### Scenario: Schema v5 report yields full summary including quality counts

- **WHEN** a candidate run produces a report with `report_schema_version` 5 and populated `quality_flag_breakdown`
- **THEN** the candidate result includes numeric quality count fields derived from each flag bucket's `trades` count
- **AND** core total metrics match the report variant metrics

#### Scenario: Report without quality breakdown does not fail extraction

- **WHEN** a candidate report lacks `quality_flag_breakdown` (e.g. older schema)
- **THEN** the candidate result status remains `"ok"` if the run succeeded
- **AND** quality count fields are `null` rather than causing an exception

### Requirement: Per-candidate runtime failure isolation

If one candidate fails at **runtime** (runner exception, missing report, or summary extraction error after validation passed), the system SHALL record `ExperimentCandidateResult.status = "failed"` with an `error` message and SHALL continue executing remaining candidates.

Validation failures (spec errors, market mismatch, multi-instance config, missing paths) MUST NOT be represented as per-candidate runtime failures; they fail the batch before execution.

#### Scenario: Second candidate runs after first runtime failure

- **WHEN** the first candidate's strategy run raises an error and the second candidate is valid
- **THEN** the first result has `status = "failed"` and a non-empty `error`
- **AND** the second candidate is still executed
- **AND** the batch result includes both candidate results

#### Scenario: All candidates failed at runtime still produces batch result

- **WHEN** every candidate in a validated batch fails at runtime
- **THEN** the system returns an `ExperimentBatchResult` with `failed_count` equal to `candidates_count` and `ok_count` 0
- **AND** the batch result is still persistable as JSON

### Requirement: Batch result persistence

The system SHALL persist an `ExperimentBatchResult` JSON file separate from ordinary strategy run artifacts at:

`research/experiments/results/batches/<experiment_id>.json`

The batch result SHALL include: `experiment_id`, `created_at`, `started_at`, `finished_at`, `duration_sec`, `batch_spec_path`, `batch_spec_hash`, `family`, `symbol`, `timeframe`, `candidates_count`, `ok_count`, `failed_count`, and `results`.

#### Scenario: Batch result written after run completes

- **WHEN** a batch run finishes
- **THEN** a JSON file exists at `research/experiments/results/batches/<experiment_id>.json`
- **AND** the file contains aggregated counts matching the candidate results

### Requirement: Local CLI entrypoints (not final UX)

The system SHALL provide minimal local operator/debug CLI entrypoints:

- `python -m research.experiments.cli validate --spec <path>`
- `python -m research.experiments.cli run-batch --spec <path>`

The CLI is a **minimal local operator/debug entrypoint** for v1. Future frontend/API integration is out of scope; the CLI is **not** the final UX for the Batch Experiment Management System.

The CLI MUST NOT expose `--db-path` or other data source / DB selection flags in v1. Data access remains the responsibility of candidate configs and the existing ema_pullback runner in their current environment.

`run-batch` SHALL print a stdout summary containing at minimum: `experiment_id`, `candidates_count`, `ok_count`, `failed_count`, `output_path`, and batch `duration_sec`.

The CLI MUST NOT implement optimizer selection, winner ranking, or “best candidate” semantics in v1.

#### Scenario: Run-batch prints minimal summary

- **WHEN** `run-batch` completes a batch run
- **THEN** stdout includes `experiment_id`, candidate counts, and `output_path`
- **AND** stdout does not label any candidate as “best” or “selected winner”

#### Scenario: Validate exits zero on valid spec

- **WHEN** `validate --spec` is invoked with a valid batch spec
- **THEN** the process exits 0

### Requirement: System non-goals boundary

The Batch Experiment Management System v1 MUST NOT implement optimizer logic, parameter sampler, grid/random/Bayesian search, entry-edge barrier diagnostics, frontend integration, research_api changes, or Data Engine changes. Strategy layer responsibilities (single-config execution, report schema v5 generation, trade quality diagnostics) remain unchanged.

#### Scenario: README states system non-goals

- **WHEN** a developer reads `research/experiments/README.md`
- **THEN** it explicitly lists optimizer, search, sampler, barrier diagnostics, frontend, research_api, and Data Engine as out of scope for v1
