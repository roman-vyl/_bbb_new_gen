## Context

Today a single ema_pullback research run is triggered by an external config file loaded via [`research/experiments/config_loader.py`](../../../research/experiments/config_loader.py) and executed by [`research/strategies/ema_pullback/execution/runner.py`](../../../research/strategies/ema_pullback/execution/runner.py) (`run_strategy_specs_from_config`). That function loads candles once, runs all `instances` in the config as variants, writes a schema v5 artifact under `research/results/`, and returns a `run_id`.

The repo already has a thin `research/experiments/` package (`config_loader`, `__init__.py`) used by the strategy runner for external config loading. This change introduces the **Batch Experiment Management System** in that package.

> **Batch Experiment Management System v1 manages predefined single-instance candidate configs. It establishes reproducible batch execution, validation, failure isolation, summary extraction, and result persistence. It does not generate candidates, select winners, or optimize parameters.**

> **Experiment BatchRunner v1 is the first execution module inside the system. It runs validated candidates sequentially and delegates every strategy run to the existing ema_pullback runner.**

### Naming hierarchy

| Level | Name | OpenSpec / code |
|-------|------|-----------------|
| Layer / capability | Batch Experiment Management System | capability `research-experiments`, package `research/experiments/` |
| Change | batch-experiment-management-system-v1 | `openspec/changes/batch-experiment-management-system-v1/` |
| v1 execution module | Experiment BatchRunner | `research/experiments/batch_runner.py` |
| Batch result storage | batches | `research/experiments/results/batches/<experiment_id>.json` |

Future modules (not v1): candidate samplers, barrier diagnostics runners, frontend/API integration—each as separate components under the same system, not inside `ema_pullback`.

### Layer dependency (required)

```text
research/experiments  (Batch Experiment Management System)
    validation preflight
    Experiment BatchRunner v1  →  research/strategies/ema_pullback (single-config runner)
        →  research/experiments/config_loader + data access
data_engine
    → no knowledge of research or experiments
```

**Forbidden:** `research/strategies/ema_pullback` MUST NOT import `batch_runner.py` or batch management models. (Existing import of `config_loader` from strategy runner remains acceptable.)

## Goals / Non-Goals

**Goals (system v1):**

- Define batch input/output contracts with reproducibility and timing fields.
- Validate batch specs and all candidate configs **before** any backtest (preflight).
- Enforce single-instance candidate configs and batch/candidate market consistency.
- Provide execution policy: sequential runs, per-candidate runtime failure isolation.
- Extract candidate summaries from persisted schema v5 reports; link via `run_id`.
- Persist batch results under `research/experiments/results/batches/`.
- Expose minimal local/debug CLI (`validate`, `run-batch`) and README.

**Goals (Experiment BatchRunner v1 module):**

- Accept a **already-validated** `ExperimentBatchSpec`; invoke ema_pullback runner per candidate.
- Record per-candidate and batch timing; aggregate `ExperimentBatchResult`.

**Non-Goals:**

- Parameter generation, search, ranking/selection, or candidate sampling.
- Entry-edge barrier diagnostics, MFE/MAE recomputation, or signal logic in the experiment layer.
- Frontend, research_api, or Data Engine changes.
- CLI as the final system UX; no Workbench or BFF integration in v1.
- Refactoring ema_pullback into a framework or moving orchestration inside strategy code.
- Dry-run / simulated backtests; validation-only preflight does not start strategy runs.

## Decisions

### 1. System structure vs. v1 module scope

The **system** owns contracts, validation, storage layout, failure policy, reproducibility, timing, and documentation. **Experiment BatchRunner v1** owns only the sequential execution loop and wiring to the strategy runner after validation passes. Summary extraction and file hashing live in testable system helpers.

### 2. Package layout (flat v1)

```text
research/experiments/
  __init__.py          # names Batch Experiment Management System
  config_loader.py     # existing — strategy config loading (unchanged)
  models.py            # system contracts
  validation.py        # load_and_validate_batch_spec (or equivalent module)
  batch_runner.py      # Experiment BatchRunner v1
  storage.py           # batch result persistence
  cli.py               # validate + run-batch (local/debug entrypoints)
  README.md
  specs/               # example batch + single-instance candidate configs
  results/
    batches/           # batch result JSON (prefer gitignore for runtime)
      <experiment_id>.json
```

### 3. Candidate config: single-instance rule (v1)

Each `ExperimentCandidateSpec.strategy_config_path` MUST reference a config file with **exactly one** `instances` entry.

- Multi-instance candidate configs are **out of scope** for v1.
- Validation fails before execution if `len(instances) != 1`.
- Each candidate is one strategy instance; batch orchestration replaces multi-variant configs inside one file.

No `selected_variant_index`, warnings array, or “first variant” fallback.

### 4. Batch market validation (v1)

Batch-level `symbol` and `timeframe` MUST match the market of every candidate config (`instances[0].market.symbol`, `instances[0].market.base_timeframe` or equivalent fields from loaded config).

Mismatch is a **batch spec validation error** — rejected before any strategy run, not a per-candidate runtime failure.

### 5. Validation preflight (not dry-run)

`load_and_validate_batch_spec(path)` (or `validate_batch_spec_with_candidate_configs(spec)`) performs:

- Parse batch spec JSON
- Unique `candidate_id`, non-empty candidates, supported `family`
- Each `strategy_config_path` exists and loads via `config_loader`
- Each candidate config has exactly one instance
- Each candidate market matches batch `symbol` / `timeframe`
- **Does not** invoke strategy runner or start backtests

CLI: `python -m research.experiments.cli validate --spec <path>` — exits 0 on success, non-zero on validation errors.

`run-batch` calls validation first; aborts before execution if validation fails.

### 6. Reproducibility fields

Deterministic file hash (SHA256 of file bytes, hex-encoded):

| Field | Scope | Source |
|-------|-------|--------|
| `batch_spec_path` | batch result | path passed to CLI / runner |
| `batch_spec_hash` | batch result | SHA256 of batch spec file at run time |
| `strategy_config_path` | candidate result | from `ExperimentCandidateSpec` |
| `strategy_config_hash` | candidate result | SHA256 of candidate config file at run time |

If input files change after a run, stored hashes identify which file version produced the result.

### 7. Timing fields

ISO 8601 UTC timestamps; `duration_sec` as float (finished − started).

**ExperimentBatchResult:** `started_at`, `finished_at`, `duration_sec` (plus existing `created_at` for artifact write time if kept separately).

**ExperimentCandidateResult:** `started_at`, `finished_at`, `duration_sec` per candidate.

### 8. Candidate identity and report linkage

Each successful `ExperimentCandidateResult` MUST include at minimum:

- `candidate_id`, `status`
- `run_id` — primary strategy report identifier (from ema_pullback runner)
- `report_path` — persisted run JSON path
- `config_id` — from report variant
- `report_schema_version`
- summary metrics (trades, pnl, return_pct, etc.)
- reproducibility and timing fields above

`run_id` links batch results to `research/results/runs/<run_id>.json` and future frontend/API consumption.

### 9. Strategy invocation (BatchRunner v1 → ema_pullback)

BatchRunner v1 calls `run_strategy_specs_from_config` (or adapter returning `run_id` + report paths) per validated candidate. Single-instance configs produce one variant per report; summary extraction uses `variants[0]`.

BatchRunner MUST NOT import backtest, signal, or trade-analyzer modules.

### 10. Summary extraction (system helper)

Pure function `extract_candidate_summary(report_payload)` reading `variants[0]`:

| Result field | Report source |
|--------------|---------------|
| `total_trades`, `pnl`, `return_pct`, `profit_factor`, `win_rate`, `sharpe`, `max_drawdown` | `variants[0].metrics.total.*` |
| `gross_pnl`, `fees_paid` | `variants[0].metrics.fee_diagnostics.*` |
| quality `*_count` fields | `variants[0].metrics.quality_flag_breakdown.<flag>.trades` |
| `report_schema_version`, `config_id`, `run_id` | top-level / variant |

Missing quality fields → `null`; never raise during extraction.

### 11. Failure policy (system-wide)

| Condition | Behavior |
|-----------|----------|
| Invalid batch spec or preflight validation | Fail before any candidate run (CLI non-zero) |
| Candidate runtime failure (runner exception, missing report, extraction error) | `status = "failed"`, `error` set, batch continues |
| All candidates failed at runtime | Still write batch result (`ok_count = 0`) |

Validation errors (duplicate ids, market mismatch, multi-instance config, missing path) are **never** per-candidate runtime failures.

### 12. Storage path

```text
research/experiments/results/batches/<experiment_id>.json
```

Results belong to the **Batch Experiment Management System** (`batches/`), not the runner module filename. Individual strategy reports remain under `research/results/runs/`.

### 13. CLI (local/debug entrypoint, not final UX)

argparse (matches ema_pullback style):

```bash
python -m research.experiments.cli validate --spec research/experiments/specs/example_batch.json
python -m research.experiments.cli run-batch --spec research/experiments/specs/example_batch.json
```

- CLI is a **minimal local operator/debug entrypoint** for v1.
- Future frontend/API integration is out of scope; CLI is **not** the final UX for the system.
- **No `--db-path` in v1.** The Batch Experiment Management System does not own data source or DB selection. Candidate configs and the existing ema_pullback runner use their current environment (same as standalone `run_strategy_specs_from_config`).
- `run-batch` stdout summary (required): `experiment_id`, `candidates_count`, `ok_count`, `failed_count`, `output_path`, batch `duration_sec`.
- No ranked “best candidate” output in v1 acceptance. Optional preview sorted by metric may be added later with explicit disclaimer that ordering is display-only, not optimizer selection.

### 14. Models

Dataclasses + JSON helpers (consistent with `config_loader.py`).

### 15. Example batch result (shape)

```json
{
  "experiment_id": "batch_ema_pullback_smoke_001",
  "created_at": "2026-05-24T14:00:00Z",
  "started_at": "2026-05-24T13:58:10Z",
  "finished_at": "2026-05-24T14:00:00Z",
  "duration_sec": 110.5,
  "batch_spec_path": "research/experiments/specs/example_batch.json",
  "batch_spec_hash": "a1b2c3…",
  "family": "ema_pullback",
  "symbol": "BTCUSDT",
  "timeframe": "5m",
  "candidates_count": 2,
  "ok_count": 2,
  "failed_count": 0,
  "results": [
    {
      "candidate_id": "instance_1_current",
      "status": "ok",
      "run_id": "2026-05-24T135820Z_ema_pullback_BTCUSDT_5m",
      "report_path": "research/results/runs/2026-05-24T135820Z_ema_pullback_BTCUSDT_5m.json",
      "strategy_config_path": "research/experiments/specs/candidates/instance_1.json",
      "strategy_config_hash": "d4e5f6…",
      "config_id": "baseline_fast100",
      "report_schema_version": 5,
      "started_at": "2026-05-24T13:58:20Z",
      "finished_at": "2026-05-24T13:59:05Z",
      "duration_sec": 45.2,
      "total_trades": 259,
      "pnl": -2024.75,
      "return_pct": -0.2024,
      "profit_factor": 0.81,
      "win_rate": 0.289,
      "high_mfe_high_capture_count": 20,
      "high_mfe_low_capture_count": 7
    }
  ]
}
```

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| CLI mistaken for product UX | README and design state CLI is local/debug only; no ranking/selection semantics |
| Repeated candle loads per candidate | Accept for v1; document; future module may cache candles |
| Hash drift if files edited in place | Document that hashes snapshot inputs at run time |
| Strategy imports `config_loader` from experiments | Keep BatchRunner separate; no reverse imports |

## Migration Plan

1. Models + validation + hash/timing fields + validation tests (no runner).
2. Summary extractor + BatchRunner v1 + runtime failure isolation tests.
3. Storage (`batches/`) + CLI + example specs + README.
4. Manual smoke; pytest gate.

No production migration; optional workflow alongside single-config CLI.

## Open Questions

- _(none blocking v1)_
