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

**Automated (logs in `debug/reports/`):**

```bat
debug\run-workbench-pipeline-debug.bat
```

Does **not** start Vite — use your usual dev stack. Requires:

- Frontend already up (`5173` or `5174`, or set `WORKBENCH_URL`)
- BFF on `:8000` (`GET /health`)
- Vite started with `VITE_EMA_PIPELINE_DEBUG=true` in `frontend/.env.local` (restart dev after change)

Writes `workbench_YYYYMMDD_HHmmss.log` and per-scenario `workbench_<scenario>_*.txt`.

**Manual (DevTools):**

In `frontend/.env.local`:

```
VITE_EMA_PIPELINE_DEBUG=true
```

Restart Vite. Filter console for `[pipeline]`. Call `__pipelineDebugFlush()` or `__pipelineDebugExport()`.

## OpenSpec

Change: [`openspec/changes/pipeline-debug-instrumentation-v1/`](../../openspec/changes/pipeline-debug-instrumentation-v1/).

## Known findings (see design.md)

- `POST /backtests` path loads external config **twice** (`_validate_config_file` + runner).
- Signal trace CLI second fetch may fail until `SignalTraceMeta` supports multi-setup `component_ids.setups`.
