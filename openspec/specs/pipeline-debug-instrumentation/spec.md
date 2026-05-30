## Purpose

Opt-in step counters and timings for the ema_pullback pipeline (config → backtest → signal trace) and Workbench network loads. Debug instrumentation MUST NOT alter research outputs when disabled or enabled.

## Requirements

### Requirement: Pipeline debug is opt-in with zero overhead when disabled

The system MUST NOT record pipeline timings, increment step counters, or write debug output unless the layer-specific debug flag is enabled (`EMA_PIPELINE_DEBUG` for Python, `VITE_EMA_PIPELINE_DEBUG` for the Workbench frontend build).

#### Scenario: Python helpers no-op without env

- **WHEN** `EMA_PIPELINE_DEBUG` is unset or not truthy
- **THEN** `dbg_span`, `dbg_mark`, and `dbg_flush` return immediately without mutating global counters or printing to stderr

#### Scenario: Frontend helpers no-op without env

- **WHEN** `VITE_EMA_PIPELINE_DEBUG` is not `"true"`
- **THEN** `dbgMark`, `dbgTimed`, and `dbgFlush` do not log to the console and do not update internal counters

### Requirement: Python pipeline trace emits per-root stderr summary

When `EMA_PIPELINE_DEBUG` is enabled, the research diagnostics module SHALL accumulate per-step `count`, `total_ms`, and `max_ms` within a `dbg_root` scope and SHALL print a formatted table to stderr on root exit via `dbg_flush`.

#### Scenario: Repeated step is labeled REPEAT

- **WHEN** the same step id is recorded more than once before `dbg_flush` for the current root
- **THEN** the stderr table line for that step is prefixed with `REPEAT`

#### Scenario: CLI runner exercises backtest path

- **WHEN** `python research/diagnostics/run_pipeline_debug.py` is executed with `EMA_PIPELINE_DEBUG=1` and a valid temp or file config
- **THEN** stderr includes a `PIPELINE_DEBUG` table for root `bff.backtest` listing at least `bff.backtest.run` and config-load steps

### Requirement: Frontend pipeline debug traces Workbench network and load policy

When `VITE_EMA_PIPELINE_DEBUG` is `"true"`, the Workbench SHALL record timings for backtest and primary GET helpers and SHALL log signal-trace load policy decisions.

#### Scenario: API backtest is timed

- **WHEN** the user runs backtest from Composer with debug enabled
- **THEN** the browser console includes a `[pipeline] api.runBacktest` entry with duration metadata

#### Scenario: Signal trace skip is visible

- **WHEN** signal trace load is skipped because the chart window is already loaded
- **THEN** the console includes `wb.signal_trace_decision` with `action` equal to `skip_already_loaded` (or equivalent skip action from policy)

#### Scenario: Developer can flush browser summary

- **WHEN** debug is enabled and `window.__pipelineDebugFlush()` is called
- **THEN** the console prints a grouped table of accumulated frontend step counts and timings

### Requirement: Diagnostics do not change research outputs

Pipeline debug instrumentation MUST NOT alter backtest metrics, trade records, report JSON shape, or API response bodies compared to the same run with debug disabled.

#### Scenario: Backtest metrics unchanged

- **WHEN** a strategy spec is run with debug off versus debug on (only env differs)
- **THEN** variant trade counts and total PnL in the result payload are identical
