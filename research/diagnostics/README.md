# Pipeline debug instrumentation

Opt-in step counters and timings for the ema_pullback path (config → backtest → signal trace) and Workbench network loads.

## Python

**Windows (лог в `debug/reports/`):**

```bat
debug\run-pipeline-debug.bat
```

**Вручную:**

```powershell
$env:EMA_PIPELINE_DEBUG = "1"
python research/diagnostics/run_pipeline_debug.py
```

Tables print to **stderr** per `dbg_root` (e.g. `bff.backtest`, `bff.signal_trace`). Rows prefixed with **`REPEAT`** ran more than once inside that root (e.g. double config load on Workbench backtest: preflight + run).

Module API: `research.diagnostics.pipeline_trace` — `dbg_root`, `dbg_span`, `dbg_mark`, `dbg_flush`.

## Frontend (Workbench)

In `frontend/.env.local`:

```
VITE_EMA_PIPELINE_DEBUG=true
```

Restart Vite. Use Composer → Run backtest → open Chart. Filter console for `[pipeline]`. After signal trace loads, a summary table is printed; or run `__pipelineDebugFlush()` in DevTools.

## OpenSpec

Change: [`openspec/changes/pipeline-debug-instrumentation-v1/`](../../openspec/changes/pipeline-debug-instrumentation-v1/).

## Known findings (see design.md)

- `POST /backtests` path loads external config **twice** (`_validate_config_file` + runner).
- Signal trace CLI second fetch may fail until `SignalTraceMeta` supports multi-setup `component_ids.setups`.
